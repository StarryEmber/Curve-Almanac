/**
 * Plugin host activator (T6.1, SPEC §14.3/ADR-052).
 *
 * Plugins are statically imported (ADR-010), so there is no sandbox here: the
 * host validates definitions, keeps a status per plugin, isolates activation
 * failures (rollback + disabled list + log) and exposes the four contribution
 * registries. Disable state is in memory only in T6.1.
 */

import { builtinColumnTypeSchema, createAppError, isAppError, toAppError } from '@curve/domain';

import { createConsolePluginLogger, prefixLogger } from './logging';
import { closeRegistry, createRegistry, createRegistryState, removeBySource } from './registry';

import type {
  ChartKindDef,
  CommandDef,
  ContributionSource,
  FieldTypeDef,
  ImporterDef,
  PluginContext,
  PluginDefinition,
  PluginErrorInfo,
  PluginHost,
  PluginHostOptions,
  PluginLogger,
  PluginState,
  PluginStatus,
  Registry,
} from './types';

/** Host API version; plugin `apiVersion` must share its major (SPEC §14.3). */
export const PLUGIN_API_VERSION = '1.0' as const;

const BUILTIN_SOURCE: ContributionSource = { kind: 'builtin' };
const CHART_SERIES_TYPES: ReadonlyArray<ChartKindDef['seriesType']> = ['line', 'scatter', 'bar'];

export function isCompatibleApiVersion(version: string, hostMajor = 1): boolean {
  const match = /^(\d+)(?:\.|$)/.exec(version.trim());
  if (match === null) {
    return false;
  }
  return Number(match[1]) === hostMajor;
}

interface PluginRecord {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string;
  readonly definition: PluginDefinition | null;
  status: PluginStatus;
  error?: PluginErrorInfo;
}

interface PluginViews {
  readonly fields: Registry<FieldTypeDef>;
  readonly importers: Registry<ImporterDef>;
  readonly chartKinds: Registry<ChartKindDef>;
  readonly commands: Registry<CommandDef>;
}

interface NormalizedPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string;
  readonly definition: PluginDefinition | null;
  readonly error?: PluginErrorInfo;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidDefinition(id: string, message: string): PluginErrorInfo {
  return { code: 'E_PLUGIN_INVALID', message: `Plugin "${id}": ${message}` };
}

function normalizePlugin(raw: unknown, index: number): NormalizedPlugin {
  const fallbackId = `invalid-plugin-${String(index + 1)}`;
  if (!isRecord(raw)) {
    return {
      id: fallbackId,
      name: fallbackId,
      version: '0.0.0',
      apiVersion: '0.0',
      definition: null,
      error: {
        code: 'E_PLUGIN_INVALID',
        message: `Plugin definition at index ${String(index)} is not an object.`,
      },
    };
  }

  const rawId = typeof raw['id'] === 'string' ? raw['id'] : '';
  const id = rawId.trim().length === 0 ? fallbackId : rawId;
  const name = typeof raw['name'] === 'string' && raw['name'].trim().length > 0 ? raw['name'] : id;
  const version = typeof raw['version'] === 'string' ? raw['version'] : '0.0.0';
  const apiVersion = typeof raw['apiVersion'] === 'string' ? raw['apiVersion'] : '0.0';
  const activate = raw['activate'];
  const deactivate = raw['deactivate'];

  let failure: string | null = null;
  if (rawId.trim().length === 0) {
    failure = 'the id is empty.';
  } else if (typeof raw['name'] !== 'string' || raw['name'].trim().length === 0) {
    failure = 'the name is empty.';
  } else if (version.trim().length === 0) {
    failure = 'the version is empty.';
  } else if (apiVersion.trim().length === 0) {
    failure = 'the apiVersion is empty.';
  } else if (typeof activate !== 'function') {
    failure = 'activate must be a function.';
  } else if (deactivate !== undefined && typeof deactivate !== 'function') {
    failure = 'deactivate must be a function when present.';
  }

  if (failure !== null) {
    return {
      id,
      name,
      version,
      apiVersion,
      definition: null,
      error: invalidDefinition(id, failure),
    };
  }

  return {
    id,
    name,
    version,
    apiVersion,
    definition: raw as unknown as PluginDefinition,
  };
}

function buildRecords(plugins: readonly PluginDefinition[]): PluginRecord[] {
  const seen = new Set<string>();
  return plugins.map((raw, index) => {
    const normalized = normalizePlugin(raw, index);
    let definition = normalized.definition;
    let error = normalized.error;
    if (definition !== null && seen.has(normalized.id)) {
      definition = null;
      error = {
        code: 'E_PLUGIN_INVALID',
        message: `Plugin "${normalized.id}" is declared more than once.`,
      };
    }
    if (definition !== null) {
      seen.add(normalized.id);
    }
    const record: PluginRecord = {
      index,
      id: normalized.id,
      name: normalized.name,
      version: normalized.version,
      apiVersion: normalized.apiVersion,
      definition,
      status: definition === null ? 'disabled' : 'pending',
    };
    if (error !== undefined) {
      record.error = error;
    }
    return record;
  });
}

function toState(record: PluginRecord): PluginState {
  const state: PluginState = {
    id: record.id,
    name: record.name,
    version: record.version,
    apiVersion: record.apiVersion,
    status: record.status,
  };
  if (record.error !== undefined) {
    return { ...state, error: record.error };
  }
  return state;
}

function requireFunction(id: string, candidate: Record<string, unknown>, key: string): void {
  if (typeof candidate[key] !== 'function') {
    throw createAppError('E_PLUGIN_INVALID', `Contribution "${id}" requires a ${key} function.`);
  }
}

function requireString(id: string, candidate: Record<string, unknown>, key: string): void {
  if (typeof candidate[key] !== 'string' || (candidate[key] as string).trim().length === 0) {
    throw createAppError('E_PLUGIN_INVALID', `Contribution "${id}" requires a non-empty ${key}.`);
  }
}

function validateFieldTypeDef(id: string, def: FieldTypeDef): void {
  if (!isRecord(def)) {
    throw createAppError('E_PLUGIN_INVALID', `Field type "${id}" must be an object.`);
  }
  const candidate = def as unknown as Record<string, unknown>;
  requireString(id, candidate, 'label');
  if (!builtinColumnTypeSchema.safeParse(candidate['storageType']).success) {
    throw createAppError(
      'E_PLUGIN_INVALID',
      `Field type "${id}" has an unsupported storageType; expected one of the five builtin column types.`,
    );
  }
  requireFunction(id, candidate, 'parseText');
  requireFunction(id, candidate, 'format');
  requireFunction(id, candidate, 'validate');
  requireFunction(id, candidate, 'compare');
  const width = candidate['defaultWidth'];
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    throw createAppError(
      'E_PLUGIN_INVALID',
      `Field type "${id}" requires a positive defaultWidth.`,
    );
  }
}

function validateImporterDef(id: string, def: ImporterDef): void {
  if (!isRecord(def)) {
    throw createAppError('E_PLUGIN_INVALID', `Importer "${id}" must be an object.`);
  }
  const candidate = def as unknown as Record<string, unknown>;
  requireString(id, candidate, 'label');
  requireFunction(id, candidate, 'parse');
  const extensions = candidate['extensions'];
  if (
    !Array.isArray(extensions) ||
    extensions.length === 0 ||
    !extensions.every((entry) => typeof entry === 'string' && entry.startsWith('.'))
  ) {
    throw createAppError(
      'E_PLUGIN_INVALID',
      `Importer "${id}" requires a non-empty extensions array of dotted suffixes.`,
    );
  }
}

function validateChartKindDef(id: string, def: ChartKindDef): void {
  if (!isRecord(def)) {
    throw createAppError('E_PLUGIN_INVALID', `Chart kind "${id}" must be an object.`);
  }
  const candidate = def as unknown as Record<string, unknown>;
  requireString(id, candidate, 'label');
  const seriesType = candidate['seriesType'];
  if (
    typeof seriesType !== 'string' ||
    !CHART_SERIES_TYPES.includes(seriesType as ChartKindDef['seriesType'])
  ) {
    throw createAppError(
      'E_PLUGIN_INVALID',
      `Chart kind "${id}" requires seriesType line, scatter or bar.`,
    );
  }
}

function validateCommandDef(id: string, def: CommandDef): void {
  if (!isRecord(def)) {
    throw createAppError('E_PLUGIN_INVALID', `Command "${id}" must be an object.`);
  }
  const candidate = def as unknown as Record<string, unknown>;
  requireString(id, candidate, 'label');
  requireFunction(id, candidate, 'run');
}

export function createPluginHost(options: PluginHostOptions): PluginHost {
  const baseLogger: PluginLogger = options.logger ?? createConsolePluginLogger();
  const hostLog = prefixLogger(baseLogger, '[plugin-host]');
  const records = buildRecords(options.plugins);

  const fieldState = createRegistryState<FieldTypeDef>({ validate: validateFieldTypeDef });
  const importerState = createRegistryState<ImporterDef>({ validate: validateImporterDef });
  const chartKindState = createRegistryState<ChartKindDef>({ validate: validateChartKindDef });
  const commandState = createRegistryState<CommandDef>({ validate: validateCommandDef });

  let disposed = false;

  for (const record of records) {
    if (record.definition === null && record.error !== undefined) {
      hostLog.error(`plugin "${record.id}" is disabled: ${record.error.message}`);
    }
  }

  function ensureOpen(): void {
    if (disposed) {
      throw createAppError('E_PLUGIN_INVALID', 'The plugin host has been disposed.');
    }
  }

  function findRecord(pluginId: string): PluginRecord | null {
    return records.find((record) => record.id === pluginId && record.definition !== null) ?? null;
  }

  function createViews(pluginId: string): PluginViews {
    const source: ContributionSource = { kind: 'plugin', pluginId };
    return {
      fields: createRegistry(fieldState, source),
      importers: createRegistry(importerState, source),
      chartKinds: createRegistry(chartKindState, source),
      commands: createRegistry(commandState, source),
    };
  }

  function rollback(pluginId: string): void {
    const source: ContributionSource = { kind: 'plugin', pluginId };
    removeBySource(fieldState, source);
    removeBySource(importerState, source);
    removeBySource(chartKindState, source);
    removeBySource(commandState, source);
  }

  function disable(record: PluginRecord, error: PluginErrorInfo, level: 'warn' | 'error'): void {
    record.status = 'disabled';
    record.error = error;
    const message = `plugin "${record.id}" disabled: ${error.message}`;
    if (level === 'warn') {
      hostLog.warn(message);
    } else {
      hostLog.error(message);
    }
  }

  async function activateRecord(record: PluginRecord): Promise<void> {
    const definition = record.definition;
    if (definition === null || record.status === 'active') {
      return;
    }

    record.status = 'pending';
    delete record.error;

    if (!isCompatibleApiVersion(definition.apiVersion)) {
      disable(
        record,
        {
          code: 'E_PLUGIN_INCOMPATIBLE',
          message: `Plugin "${record.id}" targets API ${definition.apiVersion}; this host supports ${PLUGIN_API_VERSION}.`,
        },
        'warn',
      );
      return;
    }

    const views = createViews(record.id);
    const context: PluginContext = {
      apiVersion: PLUGIN_API_VERSION,
      ...views,
      log: prefixLogger(baseLogger, `[plugin:${record.id}]`),
    };

    try {
      await definition.activate(context);
      record.status = 'active';
      hostLog.info(`plugin "${record.id}" activated`);
    } catch (thrown) {
      rollback(record.id);
      const error: PluginErrorInfo = isAppError(thrown)
        ? { code: thrown.code, message: thrown.message }
        : {
            code: 'E_PLUGIN_ACTIVATE',
            message: `Plugin "${record.id}" failed to activate: ${toAppError(thrown).message}`,
          };
      disable(record, error, 'error');
      hostLog.error(`plugin "${record.id}" activation error`, thrown);
    }
  }

  function getPlugins(): readonly PluginState[] {
    return records.map(toState);
  }

  function getDisabled(): readonly PluginState[] {
    return records.filter((record) => record.status === 'disabled').map(toState);
  }

  return {
    apiVersion: PLUGIN_API_VERSION,
    fields: createRegistry(fieldState, BUILTIN_SOURCE),
    importers: createRegistry(importerState, BUILTIN_SOURCE),
    chartKinds: createRegistry(chartKindState, BUILTIN_SOURCE),
    commands: createRegistry(commandState, BUILTIN_SOURCE),

    async activateAll(): Promise<readonly PluginState[]> {
      ensureOpen();
      for (const record of records) {
        if (record.definition !== null) {
          await activateRecord(record);
        }
      }
      return getPlugins();
    },

    async activate(pluginId: string): Promise<PluginState> {
      ensureOpen();
      const record = findRecord(pluginId);
      if (record === null) {
        throw createAppError('E_PLUGIN_INVALID', `Unknown plugin "${pluginId}".`);
      }
      await activateRecord(record);
      return toState(record);
    },

    async deactivate(pluginId: string): Promise<PluginState> {
      ensureOpen();
      const record = findRecord(pluginId);
      if (record === null) {
        throw createAppError('E_PLUGIN_INVALID', `Unknown plugin "${pluginId}".`);
      }
      if (record.status !== 'active') {
        return toState(record);
      }
      const definition = record.definition;
      try {
        await definition?.deactivate?.();
      } catch (thrown) {
        hostLog.error(
          `plugin "${record.id}" deactivate hook failed: ${toAppError(thrown).message}`,
          thrown,
        );
      }
      rollback(record.id);
      record.status = 'inactive';
      delete record.error;
      hostLog.info(`plugin "${record.id}" deactivated`);
      return toState(record);
    },

    getPlugins,
    getDisabled,

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      closeRegistry(fieldState);
      closeRegistry(importerState);
      closeRegistry(chartKindState);
      closeRegistry(commandState);
      for (const record of records) {
        record.status = 'inactive';
        delete record.error;
      }
      hostLog.info('plugin host disposed');
    },
  };
}
