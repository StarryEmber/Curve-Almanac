import { describe, expect, it } from 'vitest';

import type { ColumnDef, Row, TableMeta, WorkspaceManifest } from '@curve/domain';

import { MAX_ROWS_PER_TABLE, MAX_TABLE_FILE_BYTES, tableWriteLimitError } from './jsonl';
import { createTableData, diffRowCounts, diffTableRows, reconcileRowCounts } from './row-set';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_test',
    name: 'Test',
    file: 'tables/tbl_test.jsonl',
    schemaVersion: 1,
    columns: [column({ id: 'col_id', key: 'id', type: 'text', required: true })],
    primaryKey: 'col_id',
    rowCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeManifest(tables: TableMeta[]): WorkspaceManifest {
  return {
    formatVersion: 1,
    id: 'ws_test',
    name: 'Test',
    appVersion: '0.1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tables,
    charts: [],
    views: [],
    tableStyles: [],
    layout: { type: 'pane', viewIds: [], activeViewId: null },
    settings: {
      theme: 'system',
      locale: 'zh-CN',
      defaultTableStyleId: 'builtin.default',
      autosave: true,
    },
  };
}

function row(id: string, value: string): Row {
  return { id, values: [value] };
}

describe('createTableData', () => {
  it('copies the row array and keeps the table reference', () => {
    const table = makeTable();
    const rows = [row('row_1', 'a')];
    const data = createTableData(table, rows);

    expect(data.table).toBe(table);
    expect(data.rows).toEqual(rows);
    expect(data.rows).not.toBe(rows);
    expect(createTableData(table).rows).toEqual([]);
  });
});

describe('diffRowCounts / reconcileRowCounts', () => {
  it('reports nothing when every declared count matches', () => {
    const table = makeTable({ rowCount: 3 });
    const drifts = diffRowCounts([table], new Map([['tbl_test', 3]]));

    expect(drifts).toEqual([]);
    expect(reconcileRowCounts(makeManifest([table]), new Map([['tbl_test', 3]])).changed).toBe(
      false,
    );
  });

  it('reports the declared and actual counts of a drifted table', () => {
    const table = makeTable({ rowCount: 9 });
    const drifts = diffRowCounts([table], new Map([['tbl_test', 4]]));

    expect(drifts).toEqual([{ tableId: 'tbl_test', declared: 9, actual: 4 }]);
  });

  it('rewrites only the drifted row counts and keeps updatedAt (hint repair)', () => {
    const drifted = makeTable({ rowCount: 9 });
    const stable = makeTable({ id: 'tbl_other', rowCount: 2 });
    const manifest = makeManifest([drifted, stable]);

    const result = reconcileRowCounts(
      manifest,
      new Map([
        ['tbl_test', 4],
        ['tbl_other', 2],
      ]),
    );

    expect(result.changed).toBe(true);
    expect(result.manifest.tables[0]?.rowCount).toBe(4);
    expect(result.manifest.tables[1]?.rowCount).toBe(2);
    expect(result.manifest.updatedAt).toBe(manifest.updatedAt);
    expect(manifest.tables[0]?.rowCount).toBe(9);
  });

  it('leaves a table without a count untouched', () => {
    const table = makeTable({ rowCount: 7 });
    const result = reconcileRowCounts(makeManifest([table]), new Map());

    expect(result.changed).toBe(false);
    expect(result.manifest.tables[0]?.rowCount).toBe(7);
  });
});

describe('diffTableRows', () => {
  it('reports an empty diff for identical row sets', () => {
    const rows = [row('row_1', 'a'), row('row_2', 'b')];
    expect(diffTableRows(rows, [...rows])).toEqual({
      added: [],
      removed: [],
      changed: [],
      orderChanged: false,
      empty: true,
    });
  });

  it('classifies added, removed and changed rows', () => {
    const before = [row('row_1', 'a'), row('row_2', 'b')];
    const after = [row('row_1', 'a'), row('row_3', 'c')];

    expect(diffTableRows(before, after)).toMatchObject({
      added: ['row_3'],
      removed: ['row_2'],
      changed: [],
      empty: false,
    });
  });

  it('detects a value change and a pure reorder', () => {
    expect(diffTableRows([row('row_1', 'a')], [row('row_1', 'b')]).changed).toEqual(['row_1']);
    expect(
      diffTableRows([row('row_1', 'a'), row('row_2', 'b')], [row('row_2', 'b'), row('row_1', 'a')]),
    ).toMatchObject({ added: [], removed: [], changed: [], orderChanged: true, empty: false });
  });
});

describe('tableWriteLimitError', () => {
  it('accepts a table at the row and byte limits', () => {
    expect(
      tableWriteLimitError({ rowCount: MAX_ROWS_PER_TABLE, bytes: MAX_TABLE_FILE_BYTES }),
    ).toBeNull();
  });

  it('rejects one row above the hard cap with E_TABLE_LIMIT', () => {
    expect(tableWriteLimitError({ rowCount: MAX_ROWS_PER_TABLE + 1, bytes: 10 })).toMatchObject({
      code: 'E_TABLE_LIMIT',
    });
  });

  it('rejects a file above 256 MB with E_TABLE_LIMIT', () => {
    expect(tableWriteLimitError({ rowCount: 1, bytes: MAX_TABLE_FILE_BYTES + 1 })).toMatchObject({
      code: 'E_TABLE_LIMIT',
    });
  });
});
