import { describe, expect, it } from 'vitest';

import type { ColumnDef, TableMeta } from '@curve/domain';

import { autoMapImportColumns, createImportColumns } from './import-planning';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

function table(): TableMeta {
  return {
    id: 'tbl_import',
    name: 'Import',
    file: 'tables/tbl_import.jsonl',
    schemaVersion: 1,
    columns: [
      column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true }),
      column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number' }),
      column({ id: 'col_day', key: 'day', label: 'Day', type: 'date' }),
    ],
    primaryKey: 'col_id',
    rowCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('createImportColumns', () => {
  it('creates unique optional columns and keeps the selected types', () => {
    let sequence = 0;
    const result = createImportColumns(
      table(),
      [
        { label: 'Amount', type: 'number' },
        { label: 'Amount', type: 'number' },
        { label: 'When', type: 'date' },
      ],
      { uuid: () => `id${String(++sequence)}` },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.columns.map((entry) => entry.key)).toEqual(['amount_2', 'amount_3', 'when']);
    expect(result.columns.map((entry) => entry.type)).toEqual(['number', 'number', 'date']);
    expect(result.columns.every((entry) => entry.required !== true)).toBe(true);
  });

  it('rejects an empty label and the 100-column cap', () => {
    expect(createImportColumns(table(), [{ label: ' ', type: 'text' }])).toMatchObject({
      ok: false,
      issues: [{ index: 0, field: 'label', reason: 'required' }],
    });

    const full: TableMeta = {
      ...table(),
      columns: Array.from({ length: 100 }, (_, index) =>
        column({ id: `col_${String(index)}`, key: `c${String(index)}`, type: 'text' }),
      ),
    };
    expect(createImportColumns(full, [{ label: 'Extra', type: 'text' }])).toMatchObject({
      ok: false,
      issues: [{ index: -1, reason: 'limit' }],
    });
  });
});

describe('autoMapImportColumns', () => {
  it('maps by key/label case-insensitively and creates drafts for the rest', () => {
    const result = autoMapImportColumns(table(), [
      { index: 0, name: 'ID', type: 'text', confidence: 1, sampleSize: 2 },
      { index: 1, name: 'amount', type: 'number', confidence: 1, sampleSize: 2 },
      { index: 2, name: 'note', type: 'text', confidence: 1, sampleSize: 2 },
      { index: 3, name: 'day', type: 'date', confidence: 1, sampleSize: 2 },
    ]);

    expect(result.mappings).toEqual([
      { sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } },
      { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_amount' } },
      { sourceIndex: 2, target: { kind: 'new', newColumnIndex: 0 } },
      { sourceIndex: 3, target: { kind: 'existing', columnId: 'col_day' } },
    ]);
    expect(result.newColumns).toEqual([{ label: 'note', type: 'text' }]);
    expect(result.unmappedRequiredColumnIds).toEqual([]);
  });

  it('does not auto-map incompatible types or reuse one target', () => {
    const result = autoMapImportColumns(table(), [
      { index: 0, name: 'amount', type: 'text', confidence: 1, sampleSize: 1 },
      { index: 1, name: 'Amount', type: 'number', confidence: 1, sampleSize: 1 },
    ]);

    expect(result.mappings).toEqual([
      { sourceIndex: 0, target: { kind: 'new', newColumnIndex: 0 } },
      { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_amount' } },
    ]);
    expect(result.newColumns).toEqual([{ label: 'amount', type: 'text' }]);
  });

  it('reports required columns that no source column covers', () => {
    const required: TableMeta = {
      ...table(),
      columns: [
        ...table().columns,
        column({ id: 'col_name', key: 'name', label: 'Name', type: 'text', required: true }),
      ],
    };
    const result = autoMapImportColumns(required, [
      { index: 0, name: 'id', type: 'text', confidence: 1, sampleSize: 1 },
    ]);

    expect(result.unmappedRequiredColumnIds).toEqual(['col_name']);
  });
});
