import { describe, expect, it } from 'vitest';

import { checkTable } from '@curve/domain';
import type { ColumnDef, Row, TableMeta } from '@curve/domain';

import { planPaste } from './paste-plan';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

const COLUMNS: ColumnDef[] = [
  column({ id: 'col_id', key: 'id', type: 'text', required: true }),
  column({ id: 'col_name', key: 'name', type: 'text' }),
];

const ROWS: Row[] = [
  { id: 'row_a', values: ['a', 'A'] },
  { id: 'row_b', values: ['b', 'B'] },
  { id: 'row_c', values: ['c', 'C'] },
  { id: 'row_d', values: ['d', 'D'] },
];

const TABLE: TableMeta = {
  id: 'tbl_visible',
  name: 'Visible',
  file: 'tables/tbl_visible.jsonl',
  schemaVersion: 1,
  columns: COLUMNS,
  primaryKey: 'col_id',
  rowCount: ROWS.length,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const COLUMN_IDS = COLUMNS.map((entry) => entry.id);

function sequence(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `new${String(index)}`;
  };
}

describe('planPaste with visible row ids (T2.6)', () => {
  it('writes only the visible rows in display order', () => {
    const plan = planPaste({
      table: TABLE,
      rows: ROWS,
      anchor: { rowId: 'row_c', columnId: 'col_id' },
      columnIds: COLUMN_IDS,
      rowIds: ['row_c', 'row_a'],
      appendBeyondVisible: false,
      matrix: [
        ['c', 'C!'],
        ['a', 'A!'],
      ],
      uuid: sequence(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.rows.map((row) => row.id)).toEqual(['row_a', 'row_b', 'row_c', 'row_d']);
    expect(plan.rows[0]?.values).toEqual(['a', 'A!']);
    expect(plan.rows[2]?.values).toEqual(['c', 'C!']);
    expect(plan.rows[1]?.values).toEqual(['b', 'B']);
    expect(plan.summary).toMatchObject({ updatedRows: 2, appendedRows: 0 });
    expect(checkTable(plan.table, { rows: plan.rows }).issues).toEqual([]);
  });

  it('rejects a matrix larger than the remaining visible rows', () => {
    const plan = planPaste({
      table: TABLE,
      rows: ROWS,
      anchor: { rowId: 'row_b', columnId: 'col_id' },
      columnIds: COLUMN_IDS,
      rowIds: ['row_a', 'row_b'],
      appendBeyondVisible: false,
      matrix: [
        ['b', 'B1'],
        ['c', 'C1'],
      ],
      uuid: sequence(),
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) {
      return;
    }
    expect(plan.error.code).toBe('E_VALIDATION');
    expect(plan.error.detail).toContain('visible-rows=1');
  });

  it('appends overflow when the caller allows it (unfiltered view)', () => {
    const plan = planPaste({
      table: TABLE,
      rows: ROWS,
      anchor: { rowId: 'row_d', columnId: 'col_id' },
      columnIds: COLUMN_IDS,
      rowIds: ['row_d'],
      appendBeyondVisible: true,
      matrix: [
        ['d', 'D1'],
        ['e', 'E1'],
      ],
      uuid: sequence(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.rows).toHaveLength(5);
    expect(plan.rows[4]?.values[0]).toBe('e');
    expect(plan.summary).toMatchObject({ updatedRows: 1, appendedRows: 1 });
  });

  it('rejects an anchor or target that is not visible or does not exist', () => {
    const hiddenAnchor = planPaste({
      table: TABLE,
      rows: ROWS,
      anchor: { rowId: 'row_b', columnId: 'col_id' },
      columnIds: COLUMN_IDS,
      rowIds: ['row_a', 'row_c'],
      matrix: [['b', 'B']],
      uuid: sequence(),
    });
    expect(hiddenAnchor.ok).toBe(false);

    const unknown = planPaste({
      table: TABLE,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      columnIds: COLUMN_IDS,
      rowIds: ['row_a', 'row_missing'],
      matrix: [['a', 'A1']],
      uuid: sequence(),
    });
    expect(unknown.ok).toBe(false);

    const duplicate = planPaste({
      table: TABLE,
      rows: ROWS,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      columnIds: COLUMN_IDS,
      rowIds: ['row_a', 'row_a'],
      matrix: [['a', 'A1']],
      uuid: sequence(),
    });
    expect(duplicate.ok).toBe(false);
  });

  it('still supports the legacy physical-order path when row ids are omitted', () => {
    const plan = planPaste({
      table: TABLE,
      rows: ROWS,
      anchor: { rowId: 'row_b', columnId: 'col_id' },
      columnIds: COLUMN_IDS,
      matrix: [
        ['b', 'B1'],
        ['c', 'C1'],
      ],
      uuid: sequence(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.rows[1]?.values).toEqual(['b', 'B1']);
    expect(plan.rows[2]?.values).toEqual(['c', 'C1']);
  });
});
