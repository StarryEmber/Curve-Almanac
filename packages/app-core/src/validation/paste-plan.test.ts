import { describe, expect, it } from 'vitest';

import { checkTable } from '@curve/domain';
import type { ColumnDef, Row, TableMeta } from '@curve/domain';

import { createPastePlanner, planPaste } from './paste-plan';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

function makeTable(
  columns: ColumnDef[],
  primaryKey = 'col_id',
  rows: readonly Row[] = [],
): TableMeta {
  return {
    id: 'tbl_paste',
    name: 'Paste',
    file: 'tables/tbl_paste.jsonl',
    schemaVersion: 1,
    columns,
    primaryKey,
    rowCount: rows.length,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function row(id: string, values: Row['values']): Row {
  return { id, values };
}

const COLUMNS: ColumnDef[] = [
  column({ id: 'col_id', key: 'id', type: 'text', required: true }),
  column({ id: 'col_name', key: 'name', type: 'text' }),
  column({ id: 'col_amount', key: 'amount', type: 'number', precision: 2 }),
  column({ id: 'col_day', key: 'day', type: 'date' }),
  column({ id: 'col_flag', key: 'flag', type: 'boolean' }),
  column({
    id: 'col_status',
    key: 'status',
    type: 'enum',
    enumOptions: [
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' },
    ],
  }),
];

const ROWS: Row[] = [
  row('row_a', ['alpha', 'First', 10, 100, true, 'active']),
  row('row_b', ['beta', 'Second', 20, 200, false, 'paused']),
  row('row_c', ['gamma', 'Third', 30, 300, true, 'active']),
];

const ALL_COLUMN_IDS = COLUMNS.map((entry) => entry.id);

function uuidSequence(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `paste${String(index)}`;
  };
}

function expectValid(table: TableMeta, rows: readonly Row[]): void {
  const report = checkTable(table, { rows });
  expect(report.issues).toEqual([]);
}

describe('planPaste', () => {
  it('updates the anchored rectangle, appends missing rows and coerces every type', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const matrix = [
      ['alpha', 'Renamed', '1,234.5', '2026-02-03', '是', 'paused'],
      ['beta', 'Second!', '20', '2026-01-02', 'false', 'active'],
      ['gamma', 'Third!', '30', '2026-01-03', 'true', 'paused'],
      ['delta', 'Delta', '40', '2026-01-04', '否', 'active'],
      ['epsilon', 'Epsilon', '50', '2026-01-05', '1', 'paused'],
    ];
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      columnIds: ALL_COLUMN_IDS,
      matrix,
      uuid: uuidSequence(),
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.summary).toEqual({
      updatedRows: 3,
      appendedRows: 2,
      addedColumns: 0,
      changedCells: 22,
      totalCells: 30,
    });
    expect(plan.rows).toHaveLength(5);
    expect(plan.rows[0]?.values).toEqual([
      'alpha',
      'Renamed',
      1234.5,
      new Date(2026, 1, 3).getTime(),
      true,
      'paused',
    ]);
    expect(plan.rows[1]?.values[1]).toBe('Second!');
    expect(plan.rows[3]?.values[0]).toBe('delta');
    expect(plan.rows[4]?.values[0]).toBe('epsilon');
    expect(plan.table.rowCount).toBe(5);
    expect(plan.rows[3]?.id).toMatch(/^row_/u);
    expectValid(plan.table, plan.rows);
  });

  it('maps from the top-left of the selection and leaves columns outside the matrix alone', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_b', columnId: 'col_name' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [
        ['B2', '22'],
        ['C2', '33'],
      ],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.rows[1]?.values).toEqual(['beta', 'B2', 22, 200, false, 'paused']);
    expect(plan.rows[2]?.values).toEqual(['gamma', 'C2', 33, 300, true, 'active']);
    expect(plan.rows[0]?.values).toEqual(ROWS[0]?.values);
    expect(plan.summary.updatedRows).toBe(2);
    expect(plan.summary.appendedRows).toBe(0);
    expectValid(plan.table, plan.rows);
  });

  it('appends rows from the first row when the table is empty', () => {
    const table = makeTable(COLUMNS);
    const plan = planPaste({
      table,
      rows: [],
      anchor: { rowId: null, columnId: 'col_name' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [
        ['Only', '1'],
        ['Two', '2'],
      ],
      uuid: uuidSequence(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.rows).toHaveLength(2);
    // The matrix starts at `name`, so the primary key was not pasted and is generated.
    expect(plan.rows[0]?.values[0]).toMatch(/^row_/u);
    expect(plan.rows[0]?.values[1]).toBe('Only');
    expect(plan.rows[1]?.values[2]).toBe(2);
    expectValid(plan.table, plan.rows);
  });

  it('generates a primary key for an appended row whose pasted key is blank', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_c', columnId: 'col_id' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [
        ['gamma', 'Third!'],
        ['', 'Generated'],
      ],
      uuid: uuidSequence(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.rows).toHaveLength(4);
    expect(plan.rows[2]?.values[0]).toBe('gamma');
    const appended = plan.rows[3];
    expect(appended?.values[1]).toBe('Generated');
    expect(appended?.values[0]).toMatch(/^row_/u);
    expect(appended?.values[0]).toBe(appended?.id);
    expectValid(plan.table, plan.rows);
  });

  it('rejects blanking the primary key of an existing row', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_b', columnId: 'col_id' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['']],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) {
      return;
    }
    expect(plan.issues[0]).toMatchObject({
      reason: 'primary-key-empty',
      matrixRow: 0,
      matrixColumn: 0,
      rowNumber: 2,
      columnId: 'col_id',
      value: '',
    });
    expect(plan.totalIssues).toBe(1);
  });

  it('collects structured type errors with matrix coordinates', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_amount' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [
        ['not-a-number', '2026-02-03'],
        ['1', 'not-a-date'],
      ],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) {
      return;
    }
    expect(plan.totalIssues).toBe(2);
    expect(plan.issues[0]).toMatchObject({
      reason: 'type',
      matrixRow: 0,
      matrixColumn: 0,
      rowNumber: 1,
      columnId: 'col_amount',
      value: 'not-a-number',
    });
    expect(plan.issues[1]).toMatchObject({
      reason: 'type',
      matrixRow: 1,
      matrixColumn: 1,
      rowNumber: 2,
      columnId: 'col_day',
    });
    expect(plan.error.code).toBe('E_TYPE');
  });

  it('rejects a duplicate key inside the pasted matrix and reports the matrix cell', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['same'], ['other'], ['same']],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) {
      return;
    }
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]).toMatchObject({
      reason: 'duplicate-key',
      matrixRow: 2,
      matrixColumn: 0,
      rowNumber: 3,
      conflictRowNumber: 1,
      columnId: 'col_id',
    });
  });

  it('rejects a key that already belongs to an untouched row', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['beta']],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) {
      return;
    }
    expect(plan.issues[0]).toMatchObject({
      reason: 'duplicate-key',
      matrixRow: 0,
      matrixColumn: 0,
      rowNumber: 1,
      conflictRowNumber: 2,
      conflictRowId: 'row_b',
    });
  });

  it('allows a primary-key swap inside one paste', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['beta'], ['alpha']],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.rows[0]?.values[0]).toBe('beta');
    expect(plan.rows[1]?.values[0]).toBe('alpha');
    expectValid(plan.table, plan.rows);
  });

  it('reports how many columns are missing before it can plan', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_b', columnId: 'col_amount' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['1', '2', '3', '4', '5', '6']],
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) {
      return;
    }
    expect(plan.needsColumns).toBe(2);
    expect(plan.issues).toEqual([]);
  });

  it('adds new optional columns, pads existing rows and keeps the schema valid', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const newColumns: ColumnDef[] = [
      column({ id: 'col_extra1', key: 'extra1', type: 'text', role: 'none' }),
      column({ id: 'col_extra2', key: 'extra2', type: 'number', role: 'none' }),
    ];
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_flag' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [
        ['true', 'active', 'new1', '1'],
        ['false', 'paused', 'new2', '2'],
        ['true', 'active', 'new3', '3'],
        ['false', 'paused', 'new4', '4'],
      ],
      newColumns,
      uuid: uuidSequence(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.table.columns).toHaveLength(COLUMNS.length + 2);
    expect(plan.summary.addedColumns).toBe(2);
    expect(plan.summary.appendedRows).toBe(1);
    expect(plan.rows[0]?.values.slice(-2)).toEqual(['new1', 1]);
    expect(plan.rows[2]?.values.slice(-2)).toEqual(['new3', 3]);
    expect(plan.rows[3]?.values.slice(-2)).toEqual(['new4', 4]);
    expectValid(plan.table, plan.rows);
  });

  it('fills new columns with empty values for existing rows outside the paste range', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const newColumns: ColumnDef[] = [
      column({ id: 'col_extra', key: 'extra', type: 'text', role: 'none' }),
    ];
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_b', columnId: 'col_flag' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['true', 'active', 'x']],
      newColumns,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.rows[0]?.values.at(-1)).toBe('');
    expect(plan.rows[1]?.values.at(-1)).toBe('x');
    expect(plan.rows[2]?.values.at(-1)).toBe('');
    expectValid(plan.table, plan.rows);
  });

  it('refuses required new columns because untouched existing rows cannot fill them', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_flag' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['true', 'active', 'x']],
      newColumns: [
        column({ id: 'col_extra', key: 'extra', type: 'text', role: 'none', required: true }),
      ],
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error.code).toBe('E_VALIDATION');
    }
  });

  it('enforces the 100-column limit when the matrix would add columns', () => {
    const wideColumns: ColumnDef[] = Array.from({ length: 100 }, (_, index) =>
      column({ id: `col_${String(index)}`, key: `c${String(index)}`, type: 'text' }),
    );
    const table = makeTable(wideColumns, 'col_0');
    const plan = planPaste({
      table,
      rows: [],
      anchor: { rowId: null, columnId: 'col_99' },
      columnIds: wideColumns.map((entry) => entry.id),
      matrix: [['a', 'b']],
      newColumns: [column({ id: 'col_extra', key: 'extra', type: 'text' })],
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error.code).toBe('E_TABLE_LIMIT');
    }
  });

  it('rejects a non-rectangular matrix', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const plan = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['a', 'b'], ['c']],
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error.code).toBe('E_VALIDATION');
    }
  });

  it('rejects an anchor row or column that does not exist', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const missingRow = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_missing', columnId: 'col_id' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['x']],
    });
    expect(missingRow.ok).toBe(false);

    const missingColumn = planPaste({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_missing' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [['x']],
    });
    expect(missingColumn.ok).toBe(false);
  });

  it('reports required columns that are not covered by the matrix for appended rows', () => {
    const columns: ColumnDef[] = [
      column({ id: 'col_id', key: 'id', type: 'text', required: true }),
      column({ id: 'col_required', key: 'required', type: 'text', required: true }),
    ];
    const existing = [row('row_a', ['alpha', 'ok'])];
    const table = makeTable(columns, 'col_id', existing);
    const plan = planPaste({
      table,
      rows: existing,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      columnIds: ['col_id'],
      matrix: [['x'], ['y']],
      uuid: uuidSequence(),
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) {
      return;
    }
    expect(plan.issues[0]).toMatchObject({
      reason: 'required',
      matrixRow: 1,
      matrixColumn: -1,
      columnId: 'col_required',
      rowNumber: 2,
    });
  });

  it('supports chunked stepping without double-processing rows', () => {
    const table = makeTable(COLUMNS, 'col_id', ROWS);
    const planner = createPastePlanner({
      table,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      columnIds: ALL_COLUMN_IDS,
      matrix: [
        ['a', 'A', '1', '2026-01-01', 'true', 'active'],
        ['b', 'B', '2', '2026-01-02', 'false', 'paused'],
        ['c', 'C', '3', '2026-01-03', 'true', 'active'],
      ],
    });
    expect(planner.processedRows).toBe(0);
    planner.step(1);
    expect(planner.processedRows).toBe(1);
    planner.step(1);
    expect(planner.processedRows).toBe(2);
    planner.step(10);
    expect(planner.processedRows).toBe(3);
    const plan = planner.finish();
    expect(plan.ok).toBe(true);
  });
});
