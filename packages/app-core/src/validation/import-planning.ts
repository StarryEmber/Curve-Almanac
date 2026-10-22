/**
 * Import-specific column helpers (T2.5).
 *
 * The wizard needs to turn inferred source columns into either an existing
 * target column, a new optional column, or an explicit "ignore". These helpers
 * reuse the T2.3 column form (`checkColumnDraft`) and the T2.4 naming rules so
 * an import cannot create a column the columns panel would reject.
 */

import { createColumnId, MAX_COLUMNS_PER_TABLE } from '@curve/domain';
import type { ColumnDef, TableMeta, UuidFactory } from '@curve/domain';
import type { ImportColumnMapping, ImportColumnType, ImportedColumn } from '@curve/table-engine';

import { checkColumnDraft } from './column-draft';

export type ImportColumnDraft = {
  label: string;
  type: ImportColumnType;
};

export interface ImportColumnIssue {
  /** 0-based draft index; -1 for a table-wide problem. */
  index: number;
  field: 'label' | 'type' | 'form';
  reason: 'required' | 'range' | 'limit' | 'invalid' | 'primary-key-type';
  message: string;
}

export type ImportColumnsResult =
  | { readonly ok: true; readonly columns: ColumnDef[] }
  | { readonly ok: false; readonly issues: readonly ImportColumnIssue[] };

const IMPORT_COLUMN_TYPES: readonly ImportColumnType[] = ['text', 'number', 'date', 'boolean'];

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

export function createImportColumns(
  table: TableMeta,
  drafts: readonly ImportColumnDraft[],
  options: { uuid?: UuidFactory } = {},
): ImportColumnsResult {
  const issues: ImportColumnIssue[] = [];
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
    if (!IMPORT_COLUMN_TYPES.includes(draft.type)) {
      issues.push({
        index,
        field: 'type',
        reason: 'invalid',
        message: 'import columns support text, number, date and boolean',
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
      issues.push({
        index,
        field: first?.field === 'label' ? 'label' : first?.field === 'type' ? 'type' : 'form',
        reason:
          first?.reason === 'required'
            ? 'required'
            : first?.reason === 'range'
              ? 'range'
              : first?.reason === 'limit'
                ? 'limit'
                : first?.reason === 'primary-key-type'
                  ? 'primary-key-type'
                  : 'invalid',
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

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export interface AutoImportMappingResult {
  mappings: ImportColumnMapping[];
  /** Drafts for source columns that did not match an existing column. */
  newColumns: ImportColumnDraft[];
  /** Existing required columns (other than the primary key) left unmapped. */
  unmappedRequiredColumnIds: string[];
}

/**
 * Maps source columns by normalised header against the target column key and
 * label. Only compatible types auto-map; a text source does not silently map
 * onto a number/date/boolean column, because the validation step would then
 * reject every row. Everything else becomes a new optional column draft.
 */
export function autoMapImportColumns(
  table: TableMeta,
  sourceColumns: readonly ImportedColumn[],
): AutoImportMappingResult {
  const usedTargets = new Set<string>();
  const mappings: ImportColumnMapping[] = [];
  const newColumns: ImportColumnDraft[] = [];

  for (const source of sourceColumns) {
    const normalized = normalize(source.name);
    const match = table.columns.find((column) => {
      if (usedTargets.has(column.id)) {
        return false;
      }
      const key = normalize(column.key);
      const label = normalize(column.label);
      if (normalized.length === 0 || (key !== normalized && label !== normalized)) {
        return false;
      }
      return source.type === 'text' ? column.type === 'text' : column.type === source.type;
    });

    if (match !== undefined) {
      usedTargets.add(match.id);
      mappings.push({
        sourceIndex: source.index,
        target: { kind: 'existing', columnId: match.id },
      });
      continue;
    }

    const newColumnIndex = newColumns.length;
    newColumns.push({
      label: source.name.trim().length === 0 ? `Column ${String(source.index + 1)}` : source.name,
      type: source.type === 'text' ? 'text' : source.type,
    });
    mappings.push({
      sourceIndex: source.index,
      target: { kind: 'new', newColumnIndex },
    });
  }

  const mapped = new Set(
    mappings
      .filter((mapping) => mapping.target.kind === 'existing')
      .map((mapping) => (mapping.target.kind === 'existing' ? mapping.target.columnId : '')),
  );
  const unmappedRequiredColumnIds = table.columns
    .filter(
      (column) =>
        column.required === true && column.id !== table.primaryKey && !mapped.has(column.id),
    )
    .map((column) => column.id);

  return { mappings, newColumns, unmappedRequiredColumnIds };
}

/**
 * Maps a new-column draft index to the generated `ColumnDef` index maintained
 * by `createImportColumns`. Kept here so the wizard and tests agree on the
 * mapping shape.
 */
export function mapNewColumnsToTargets(
  baseMappings: readonly ImportColumnMapping[],
): ImportColumnMapping[] {
  return baseMappings.map((mapping) => {
    if (mapping.target.kind !== 'new') {
      return mapping;
    }
    return {
      sourceIndex: mapping.sourceIndex,
      target: { kind: 'new', newColumnIndex: mapping.target.newColumnIndex },
    };
  });
}
