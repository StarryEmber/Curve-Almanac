/**
 * Compiled-in plugin field types for main-process manifest validation (T6.2).
 *
 * Plugins are activated in the renderer (SPEC §14.1), but the workspace manifest
 * is validated in the main process *before* a renderer exists. A persisted
 * `ColumnDef.fieldTypeId` must still resolve to the field type's storage type
 * (SPEC §14.3), otherwise opening a workspace with an `rating` column would only
 * produce the "cannot verify field type" warning.
 *
 * Only the definitions exported by the plugin packages are read here; no plugin
 * is activated and no renderer/Electron code is imported. Both processes use the
 * same `sampleFieldTypes` array, so the storage types cannot drift apart.
 */

import type { ColumnType } from '@curve/domain';
import { sampleFieldTypes } from '@curve/plugin-sample';

const STORAGE_BY_FIELD_TYPE: ReadonlyMap<string, ColumnType> = new Map(
  sampleFieldTypes.map((fieldType) => [fieldType.id, fieldType.storageType]),
);

/** Resolves a semantic field type id to its storage type, if it is compiled in. */
export function resolveFieldTypeStorage(fieldTypeId: string): ColumnType | undefined {
  return STORAGE_BY_FIELD_TYPE.get(fieldTypeId);
}
