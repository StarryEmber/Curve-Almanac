import type { ColumnDraft } from '@curve/app-core';
import type { ColumnDef, ColumnRole } from '@curve/domain';

/**
 * T6.3: the storage types are the five builtin field types of the plugin host
 * registry (SPEC §14.4); the dialog reads them from `listFieldTypes()` instead
 * of a local list. This module keeps only the role list, which is not a plugin
 * contribution point.
 */
export const COLUMN_ROLES: readonly ColumnRole[] = ['none', 'x', 'y', 'series', 'label'];

/** Builds the editable form state from an existing column. */
export function draftFromColumn(column: ColumnDef): ColumnDraft {
  return {
    label: column.label,
    key: column.key,
    type: column.type,
    role: column.role,
    // T6.2: `null` means "explicitly no semantic type", so clearing it in the
    // dialog is not undone by the T2.3 "keep the current field type" fallback.
    fieldTypeId: column.fieldTypeId ?? null,
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
    fieldTypeId: null,
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
