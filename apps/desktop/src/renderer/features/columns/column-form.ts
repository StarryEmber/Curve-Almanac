import type { ColumnDraft } from '@curve/app-core';
import type { ColumnDef, ColumnRole, ColumnType } from '@curve/domain';

/** Storage types in the order the dialog lists them (SPEC §6.1). */
export const COLUMN_TYPES: readonly ColumnType[] = ['text', 'number', 'date', 'boolean', 'enum'];

export const COLUMN_ROLES: readonly ColumnRole[] = ['none', 'x', 'y', 'series', 'label'];

/** Builds the editable form state from an existing column. */
export function draftFromColumn(column: ColumnDef): ColumnDraft {
  return {
    label: column.label,
    key: column.key,
    type: column.type,
    role: column.role,
    ...(column.unit === undefined ? {} : { unit: column.unit }),
    ...(column.precision === undefined ? {} : { precision: column.precision }),
    ...(column.enumOptions === undefined
      ? {}
      : { enumOptions: column.enumOptions.map((option) => ({ ...option })) }),
    ...(column.required === true ? { required: true } : {}),
  };
}

export function uniqueColumnKey(base: string, existing: readonly string[]): string {
  let candidate = base;
  let suffix = 2;
  while (existing.includes(candidate)) {
    candidate = `${base}_${String(suffix)}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * ASCII slug for the `key` field. Chinese labels produce an empty slug, so the
 * form falls back to `column` / `column_2`; the user can always edit the key.
 */
export function keyFromLabel(label: string, existing: readonly string[]): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base =
    normalized.length === 0
      ? 'column'
      : /^[a-z_]/.test(normalized)
        ? normalized
        : `column_${normalized}`;
  const bounded = base.slice(0, 60).replace(/_+$/g, '');
  return uniqueColumnKey(bounded.length === 0 ? 'column' : bounded, existing);
}

export function newColumnDraft(table: { columns: readonly ColumnDef[] }): ColumnDraft {
  const existing = table.columns.map((column) => column.key);
  return {
    label: '',
    key: uniqueColumnKey('column', existing),
    type: 'text',
    role: 'none',
  };
}

function sameEnumOptions(
  current: ColumnDef['enumOptions'],
  next: ColumnDraft['enumOptions'],
): boolean {
  const left = current ?? [];
  const right = next ?? [];
  return (
    left.length === right.length &&
    left.every(
      (option, index) =>
        option.value === right[index]?.value && option.label === right[index]?.label,
    )
  );
}

/**
 * A change needs the destructive confirmation when it can rewrite or invalidate
 * stored values (Q5): type, required and enum-option changes.
 */
export function isDestructiveColumnChange(current: ColumnDef, next: ColumnDraft): boolean {
  return (
    current.type !== next.type ||
    (current.required === true) !== (next.required === true) ||
    !sameEnumOptions(current.enumOptions, next.enumOptions)
  );
}
