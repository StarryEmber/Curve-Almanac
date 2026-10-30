/**
 * Renderer plugin assembly point (SPEC §14.1, T6.2).
 *
 * Plugins are statically imported and activated once before the first render
 * (`main.tsx`). The host is a module singleton: every consumer (column form,
 * import wizard, grid formatter, app-core) reads the same registries, and no
 * React component subscribes to them in T6.2 — the contribution set is fixed at
 * startup, so a snapshot read is enough (T6.3 adds change notifications).
 */

import type { Cell, ColumnDef } from '@curve/domain';
import { samplePlugin } from '@curve/plugin-sample';
import { createPluginHost } from '@curve/plugin-sdk';
import type {
  FieldTypeDef,
  ImporterDef,
  PluginHost,
  PluginState,
  RegistryEntry,
} from '@curve/plugin-sdk';

/** Plugins compiled into this build, in activation order (T6.2). */
const PLUGINS = [samplePlugin];

export const pluginHost: PluginHost = createPluginHost({ plugins: PLUGINS });

let activation: Promise<readonly PluginState[]> | null = null;

/**
 * Activates every compiled-in plugin exactly once. Failures are isolated by the
 * host (rollback + disabled list + log), so this never blocks startup.
 */
export function activateRendererPlugins(): Promise<readonly PluginState[]> {
  activation ??= pluginHost.activateAll();
  return activation;
}

/** Semantic field types contributed by plugins, in registration order. */
export function listFieldTypes(): readonly RegistryEntry<FieldTypeDef>[] {
  return pluginHost.fields.list();
}

/** Importers contributed by plugins, in registration order. */
export function listImporters(): readonly RegistryEntry<ImporterDef>[] {
  return pluginHost.importers.list();
}

export function findFieldType(fieldTypeId: string): FieldTypeDef | undefined {
  return pluginHost.fields.get(fieldTypeId);
}

export function findImporter(importerId: string): ImporterDef | undefined {
  return pluginHost.importers.get(importerId);
}

/**
 * Lookup passed to `@curve/app-core` so the command layer validates a semantic
 * cell exactly like the grid does (T6.2). Structurally compatible with
 * app-core's `FieldTypeRule`, so app-core keeps no plugin-sdk dependency.
 */
export const fieldTypeLookup = (fieldTypeId: string): FieldTypeDef | undefined =>
  pluginHost.fields.get(fieldTypeId);

/**
 * Formats a cell through its semantic field type (grid and style preview).
 * Returns `null` when the column has no field type or it is not registered, so
 * callers fall back to the storage-type presentation.
 */
export function formatFieldCell(value: Cell, column: ColumnDef, locale: string): string | null {
  if (column.fieldTypeId === undefined) {
    return null;
  }
  const fieldType = pluginHost.fields.get(column.fieldTypeId);
  if (fieldType === undefined) {
    return null;
  }
  return fieldType.format(value, { locale });
}
