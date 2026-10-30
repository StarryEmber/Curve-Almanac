/**
 * Renderer plugin assembly point (SPEC §14.1, T6.2/T6.3).
 *
 * Plugins are statically imported and activated once before the first render
 * (`main.tsx`). The host is a module singleton: every consumer (column form,
 * import wizard, chart dialogs, command palette, grid formatter, app-core) reads
 * the same registries, and the registry snapshot is what the UI renders — T6.3
 * removed the last hard-coded builtin lists by registering them through the
 * same `Registry` API (ADR-054).
 */

import type { Cell, ColumnDef } from '@curve/domain';
import { samplePlugin } from '@curve/plugin-sample';
import { createPluginHost } from '@curve/plugin-sdk';
import type {
  ChartKindDef,
  CommandDef,
  ContributionSource,
  FieldTypeDef,
  ImporterDef,
  PluginLogger,
  PluginHost,
  PluginState,
  RegistryEntry,
} from '@curve/plugin-sdk';

import { registerBuiltinContributions } from './builtins';
import { reportPluginError } from './errors';
import { createPrefixedPluginLogger, createRingPluginLogger } from './log';

export { clearPluginErrorDedupe, subscribePluginErrors } from './errors';
export type { PluginErrorEvent } from './errors';
export { clearPluginLog, listPluginLog, subscribePluginLog } from './log';
export type { PluginLogEntry } from './log';

/** Plugins compiled into this build, in activation order (T6.2). */
const PLUGINS = [samplePlugin];

export const pluginHost: PluginHost = createPluginHost({
  plugins: PLUGINS,
  logger: createRingPluginLogger(),
});

let activation: Promise<readonly PluginState[]> | null = null;
let builtinsRegistered = false;

function registerBuiltinsOnce(): void {
  if (builtinsRegistered) {
    return;
  }
  registerBuiltinContributions(pluginHost);
  builtinsRegistered = true;
}

/** Listeners pinged when plugin *state* changes without a registry mutation. */
const stateListeners = new Set<() => void>();

function notifyStateListeners(): void {
  for (const listener of [...stateListeners]) {
    try {
      listener();
    } catch {
      // A broken subscriber must not break plugin state changes.
    }
  }
}

/**
 * Activates the builtin contributions and every compiled-in plugin exactly
 * once. Failures are isolated by the host (rollback + disabled list + log), so
 * this never blocks startup.
 */
export function activateRendererPlugins(): Promise<readonly PluginState[]> {
  activation ??= (async () => {
    registerBuiltinsOnce();
    return pluginHost.activateAll();
  })();
  return activation;
}

/** Every field type, builtin first (SPEC §14.3 ordering). */
export function listFieldTypes(): readonly RegistryEntry<FieldTypeDef>[] {
  return pluginHost.fields.list();
}

/** Every importer, builtin CSV/TSV + JSON first. */
export function listImporters(): readonly RegistryEntry<ImporterDef>[] {
  return pluginHost.importers.list();
}

/** Every chart kind, builtin line/scatter/bar first. */
export function listChartKinds(): readonly RegistryEntry<ChartKindDef>[] {
  return pluginHost.chartKinds.list();
}

/** Commands contributed by plugins (builtin commands live in `APP_COMMANDS`). */
export function listPluginCommands(): readonly RegistryEntry<CommandDef>[] {
  return pluginHost.commands.list();
}

export function findFieldType(fieldTypeId: string): FieldTypeDef | undefined {
  return pluginHost.fields.get(fieldTypeId);
}

export function findImporter(importerId: string): ImporterDef | undefined {
  return pluginHost.importers.get(importerId);
}

export function findChartKind(chartKindId: string): ChartKindDef | undefined {
  return pluginHost.chartKinds.get(chartKindId);
}

export function findPluginCommand(commandId: string): RegistryEntry<CommandDef> | undefined {
  return pluginHost.commands.list().find((entry) => entry.id === commandId);
}

/** The registration entry (id + definition + owner) of a field type. */
export function findFieldTypeEntry(fieldTypeId: string): RegistryEntry<FieldTypeDef> | undefined {
  return pluginHost.fields.list().find((entry) => entry.id === fieldTypeId);
}

export function findImporterEntry(importerId: string): RegistryEntry<ImporterDef> | undefined {
  return pluginHost.importers.list().find((entry) => entry.id === importerId);
}

export function getPluginStates(): readonly PluginState[] {
  return pluginHost.getPlugins();
}

/** Display name of a plugin id, falling back to the id itself. */
export function pluginNameFor(pluginId: string): string {
  return pluginHost.getPlugins().find((plugin) => plugin.id === pluginId)?.name ?? pluginId;
}

/**
 * Single point that turns a contribution failure into a logged, attributed
 * error event (T6.3). Builtin contributions report an empty name; the shell is
 * responsible for localising that label.
 */
export function reportContributionError(source: ContributionSource, error: unknown): void {
  const pluginId = source.kind === 'plugin' ? source.pluginId : null;
  reportPluginError({
    pluginId,
    pluginName: pluginId === null ? '' : pluginNameFor(pluginId),
    error,
  });
}

/**
 * Enables or disables one plugin for this session (T6.3, ADR-054).
 *
 * Disabling calls the host's `deactivate` (hook + contribution removal), so the
 * registry snapshot changes and every open selector drops the options on the
 * next render. The disabled set is intentionally not persisted: `settings.json`
 * and the workspace format stay untouched (ADR-050/ADR-052 review condition).
 */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<PluginState> {
  const state = enabled
    ? await pluginHost.activate(pluginId)
    : await pluginHost.deactivate(pluginId);
  notifyStateListeners();
  return state;
}

export interface PluginSnapshot {
  readonly fields: readonly RegistryEntry<FieldTypeDef>[];
  readonly importers: readonly RegistryEntry<ImporterDef>[];
  readonly chartKinds: readonly RegistryEntry<ChartKindDef>[];
  readonly commands: readonly RegistryEntry<CommandDef>[];
  readonly plugins: readonly PluginState[];
}

/** Consistent read of all four registries plus the plugin states. */
export function readPluginSnapshot(): PluginSnapshot {
  return {
    fields: pluginHost.fields.list(),
    importers: pluginHost.importers.list(),
    chartKinds: pluginHost.chartKinds.list(),
    commands: pluginHost.commands.list(),
    plugins: pluginHost.getPlugins(),
  };
}

/**
 * Subscribes to every contribution registry plus plugin state changes. The
 * listener is called synchronously after each mutation; callers that render
 * merge the calls themselves (React batches the state updates).
 */
export function subscribePluginChanges(listener: () => void): () => void {
  const unsubscribers = [
    pluginHost.fields.subscribe(listener),
    pluginHost.importers.subscribe(listener),
    pluginHost.chartKinds.subscribe(listener),
    pluginHost.commands.subscribe(listener),
  ];
  stateListeners.add(listener);
  return (): void => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
    stateListeners.delete(listener);
  };
}

/**
 * Lookup passed to `@curve/app-core` so the command layer validates a semantic
 * cell exactly like the grid does (T6.2). Structurally compatible with
 * app-core's `FieldTypeRule`, so app-core keeps no plugin-sdk dependency.
 */
export const fieldTypeLookup = (fieldTypeId: string): FieldTypeDef | undefined =>
  pluginHost.fields.get(fieldTypeId);

/**
 * Formats a cell through its semantic field type (grid, auto width and style
 * preview). Returns `null` when the column has no field type or it is not
 * registered, so callers fall back to the storage-type presentation.
 *
 * T6.3: a throwing `format` only loses that cell's semantic formatting — the
 * error is attributed to the plugin and surfaced as a toast, never thrown into
 * the grid render loop.
 */
export function formatFieldCell(value: Cell, column: ColumnDef, locale: string): string | null {
  if (column.fieldTypeId === undefined) {
    return null;
  }
  const entry = findFieldTypeEntry(column.fieldTypeId);
  if (entry === undefined) {
    return null;
  }
  try {
    return entry.def.format(value, { locale });
  } catch (thrown) {
    reportContributionError(entry.source, thrown);
    return null;
  }
}

export interface PluginCommandExecutor {
  /** Dispatches an app-core command; throws the `AppError` when it fails. */
  execute(commandId: string, payload: unknown): Promise<void>;
}

/**
 * Runs one plugin command with a context bound to that plugin (T6.3).
 *
 * Errors are isolated exactly like contribution calls: the palette closes, the
 * plugin is named in the toast and nothing else changes.
 */
export async function runPluginCommand(
  entry: RegistryEntry<CommandDef>,
  executor: PluginCommandExecutor['execute'],
): Promise<void> {
  const pluginId = entry.source.kind === 'plugin' ? entry.source.pluginId : null;
  const logger: PluginLogger = createPrefixedPluginLogger(
    pluginId === null ? '[plugin-host]' : `[plugin:${pluginId}]`,
  );
  try {
    await entry.def.run({ log: logger, execute: executor });
  } catch (thrown) {
    reportContributionError(entry.source, thrown);
  }
}
