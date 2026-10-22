import { describe, expect, it } from 'vitest';

import type { ColumnDef, TableMeta } from '@curve/domain';

import { createPasteColumns } from './paste-columns';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

function makeTable(columns: ColumnDef[]): TableMeta {
  return {
    id: 'tbl_paste',
    name: 'Paste',
    file: 'tables/tbl_paste.jsonl',
    schemaVersion: 1,
    columns,
    primaryKey: columns[0]?.id ?? 'col_id',
    rowCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const TABLE = makeTable([column({ id: 'col_id', key: 'id', type: 'text', required: true })]);

function uuidSequence(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `column${String(index)}`;
  };
}

describe('createPasteColumns', () => {
  it('creates optional, typed columns with unique ids and ASCII keys', () => {
    const result = createPasteColumns(
      TABLE,
      [
        { label: 'Score', type: 'number' },
        { label: 'When', type: 'date' },
        { label: 'Active', type: 'boolean' },
      ],
      { uuid: uuidSequence() },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.columns.map((entry) => entry.key)).toEqual(['score', 'when', 'active']);
    expect(result.columns.map((entry) => entry.type)).toEqual(['number', 'date', 'boolean']);
    expect(result.columns.every((entry) => entry.required !== true)).toBe(true);
    expect(result.columns.every((entry) => entry.role === 'none')).toBe(true);
    expect(result.columns.map((entry) => entry.id)).toEqual([
      'col_column1',
      'col_column2',
      'col_column3',
    ]);
  });

  it('deduplicates keys against the table and between new columns', () => {
    const table = makeTable([
      column({ id: 'col_id', key: 'id', type: 'text' }),
      column({ id: 'col_score', key: 'score', type: 'number' }),
    ]);
    const result = createPasteColumns(
      table,
      [
        { label: 'Score', type: 'number' },
        { label: 'Score', type: 'text' },
      ],
      { uuid: uuidSequence() },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns.map((entry) => entry.key)).toEqual(['score_2', 'score_3']);
    }
  });

  it('falls back to a stable key for non-ASCII labels', () => {
    const result = createPasteColumns(
      TABLE,
      [
        { label: '金额', type: 'number' },
        { label: '备注', type: 'text' },
      ],
      { uuid: uuidSequence() },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns.map((entry) => entry.key)).toEqual(['column', 'column_2']);
    }
  });

  it('rejects an empty label', () => {
    const result = createPasteColumns(TABLE, [{ label: '   ', type: 'text' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({ index: 0, field: 'label', reason: 'required' });
    }
  });

  it('rejects unsupported storage types such as enum', () => {
    const result = createPasteColumns(TABLE, [
      { label: 'Status', type: 'enum' as unknown as 'text' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({ index: 0, field: 'type', reason: 'invalid' });
    }
  });

  it('enforces the 100-column table limit', () => {
    const columns = Array.from({ length: 100 }, (_, index) =>
      column({ id: `col_${String(index)}`, key: `c${String(index)}`, type: 'text' }),
    );
    const result = createPasteColumns(makeTable(columns), [{ label: 'Extra', type: 'text' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({ index: -1, reason: 'limit' });
    }
  });
});
