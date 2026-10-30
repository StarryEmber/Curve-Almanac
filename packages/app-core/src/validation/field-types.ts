/**
 * Structural port for plugin semantic field types (T6.2, SPEC §14.2/§14.3).
 *
 * app-core must apply the same semantic rules as the grid: the command layer is
 * the last line of defence, so a plugin field type cannot be bypassed by a
 * direct `table.cell.set` dispatch. app-core deliberately does not import
 * `@curve/plugin-sdk`: the renderer passes a lookup backed by the plugin host,
 * tests pass plain objects, and a missing lookup simply keeps the storage-type
 * rules.
 */

import type { Cell, ColumnDef, ColumnType } from '@curve/domain';

export interface FieldTypeRule {
  /** Reverse-domain id, e.g. `com.curvealmanac.rating`. */
  readonly id: string;
  /** Physical storage type; the column must already declare the same type. */
  readonly storageType: ColumnType;
  /** Parses user text into a storable cell; `''` usually clears the cell. */
  parseText(raw: string): { ok: true; value: Cell } | { ok: false; message: string };
  /** Returns a developer-facing message when the value is not acceptable. */
  validate(value: Cell, column: ColumnDef): string | null;
}

export type FieldTypeLookup = (fieldTypeId: string) => FieldTypeRule | undefined;
