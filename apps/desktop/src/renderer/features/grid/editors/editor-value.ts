import type { Cell, ColumnDef } from '@curve/domain';

/**
 * Pure conversions between a stored `Cell` and the local editor string.
 *
 * The editor never writes the store directly: `cellToEditorValue` seeds the
 * draft, and `editorValueToRaw` turns the final string back into the raw input
 * that `coerceCell` validates. Keeping these conversions pure makes the date
 * (local midnight) and boolean/enum (null vs empty string) rules testable.
 */

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/** Formats an epoch timestamp as the local `YYYY-MM-DD` an input[type=date] needs. */
export function formatLocalDateInput(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    return '';
  }
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

export function cellToEditorValue(value: Cell, column: ColumnDef): string {
  if (value === null) {
    return '';
  }
  switch (column.type) {
    case 'text':
      return String(value);
    case 'number':
      return String(value);
    case 'date':
      return typeof value === 'number' ? formatLocalDateInput(value) : '';
    case 'boolean':
      return value === true ? 'true' : value === false ? 'false' : '';
    case 'enum':
      return String(value);
  }
}

/**
 * Converts the editor string to the raw value submitted to `coerceCell`.
 *
 * Empty text stays `''` so text cells can store an empty string; every other
 * type uses `null`, which is what `coerceCell` treats as "clear this cell".
 */
export function editorValueToRaw(text: string, column: ColumnDef): unknown {
  switch (column.type) {
    case 'text':
      return text;
    case 'number':
      return text.trim() === '' ? null : text;
    case 'date':
      return text === '' ? null : text;
    case 'boolean':
      return text === 'true' ? true : text === 'false' ? false : null;
    case 'enum':
      return text === '' ? null : text;
  }
}
