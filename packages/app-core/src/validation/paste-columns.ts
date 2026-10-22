/**
 * Builds the `ColumnDef`s for a paste that is wider than the current table.
 *
 * The paste dialog collects a label and a storage type per new column; this
 * module owns the naming (`key`), the id and the same field validation as the
 * T2.3 column form, so the renderer never hand-builds schema. New columns are
 * always optional: existing rows outside the pasted rectangle cannot supply a
 * required value, so `planPaste` rejects required new columns.
 */

import { createColumnId, MAX_COLUMNS_PER_TABLE } from '@curve/domain';
import type { ColumnDef, TableMeta, UuidFactory } from '@curve/domain';

import { checkColumnDraft } from './column-draft';

export type PasteColumnType = 'text' | 'number' | 'date' | 'boolean';

export interface PasteColumnDraft {
  label: string;
  type: PasteColumnType;
}

export interface PasteColumnIssue {
  /** 0-based draft index; -1 for a table-wide problem. */
  index: number;
  field: 'label' | 'type' | 'form';
  reason: 'required' | 'range' | 'limit' | 'invalid';
  message: string;
}

export type PasteColumnsResult =
  | { readonly ok: true; readonly columns: ColumnDef[] }
  | { readonly ok: false; readonly issues: readonly PasteColumnIssue[] };

const PASTE_COLUMN_TYPES: readonly PasteColumnType[] = ['text', 'number', 'date', 'boolean'];

function slug(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const ascii = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (ascii.length === 0) {
    return 'column';
  }
  return /^[a-z_]/.test(ascii) ? ascii : `column_${ascii}`;
}

function uniqueKey(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}_${String(suffix)}`)) {
    suffix += 1;
  }
  const key = `${base}_${String(suffix)}`;
  used.add(key);
  return key;
}

/**
 * Normalises the dialog drafts into valid, optional columns.
 *
 * Ids come from the injected UUID source; keys are ASCII slugs made unique
 * against the table and the other new columns. Validation reuses
 * `checkColumnDraft`, so a paste column cannot be accepted by a weaker rule
 * than the columns panel.
 */
export function createPasteColumns(
  table: TableMeta,
  drafts: readonly PasteColumnDraft[],
  options: { uuid?: UuidFactory } = {},
): PasteColumnsResult {
  const issues: PasteColumnIssue[] = [];
  if (table.columns.length + drafts.length > MAX_COLUMNS_PER_TABLE) {
    return {
      ok: false,
      issues: [
        {
          index: -1,
          field: 'form',
          reason: 'limit',
          message: `a table may have at most ${String(MAX_COLUMNS_PER_TABLE)} columns`,
        },
      ],
    };
  }

  const usedKeys = new Set(table.columns.map((column) => column.key));
  const columns: ColumnDef[] = [];

  drafts.forEach((draft, index) => {
    const label = draft.label.trim();
    if (label.length === 0) {
      issues.push({
        index,
        field: 'label',
        reason: 'required',
        message: 'the column label is required',
      });
      return;
    }
    if (!PASTE_COLUMN_TYPES.includes(draft.type)) {
      issues.push({
        index,
        field: 'type',
        reason: 'invalid',
        message: 'paste columns support text, number, date and boolean',
      });
      return;
    }

    const key = uniqueKey(slug(label), usedKeys);
    const columnId = createColumnId(options.uuid);
    const extended: TableMeta = { ...table, columns: [...table.columns, ...columns] };
    const checked = checkColumnDraft(
      extended,
      { label, key, type: draft.type, role: 'none' },
      columnId,
    );
    if (!checked.ok) {
      const first = checked.issues[0];
      const field: PasteColumnIssue['field'] =
        first?.field === 'label' ? 'label' : first?.field === 'type' ? 'type' : 'form';
      const reason: PasteColumnIssue['reason'] =
        first?.reason === 'required'
          ? 'required'
          : first?.reason === 'range'
            ? 'range'
            : first?.reason === 'limit'
              ? 'limit'
              : 'invalid';
      issues.push({
        index,
        field,
        reason,
        message: first?.message ?? 'the column definition is invalid',
      });
      return;
    }
    columns.push(checked.column);
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, columns };
}
