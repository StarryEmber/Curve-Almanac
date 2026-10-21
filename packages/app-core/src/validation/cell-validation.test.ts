import { describe, expect, it } from 'vitest';

import type { Row, TableMeta } from '@curve/domain';

import { createAppStore } from '../state/store';

import { cellIssueToAppError, checkTableCellSet, validateCellBatch } from './cell-validation';

import type { WorkspaceInfo } from '../state/types';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

const TABLE: TableMeta = {
  id: 'tbl_test',
  name: 'Test',
  file: 'tables/tbl_test.jsonl',
  schemaVersion: 1,
  columns: [
    { id: 'col_id', key: 'id', label: 'Id', type: 'text', role: 'none', required: true },
    { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    {
      id: 'col_status',
      key: 'status',
      label: 'Status',
      type: 'enum',
      role: 'none',
      enumOptions: [
        { value: 'active', label: 'Active' },
        { value: 'paused', label: 'Paused' },
      ],
    },
    { id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'none' },
    { id: 'col_flag', key: 'flag', label: 'Flag', type: 'boolean', role: 'none' },
  ],
  primaryKey: 'col_id',
  rowCount: 3,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const ROWS: Row[] = [
  { id: 'row_1', values: ['alpha', 1, 'active', 1_767_225_600_000, true] },
  { id: 'row_2', values: ['beta', 2, 'paused', 1_767_232_200_000, false] },
  { id: 'row_3', values: ['gamma', 3, 'active', 1_767_238_800_000, true] },
];

const WORKSPACE: WorkspaceInfo = {
  formatVersion: 1,
  id: 'ws_test',
  name: 'Test',
  root: 'C:\\tmp\\Test.cstudio',
  appVersion: '0.1.0',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  settings: {
    theme: 'system',
    locale: 'zh-CN',
    defaultTableStyleId: 'builtin.report-light',
    autosave: true,
  },
  warnings: [],
};

function setup(): ReturnType<typeof createAppStore> {
  return createAppStore({
    initialState: {
      workspace: WORKSPACE,
      tables: { tbl_test: { table: TABLE, rows: ROWS } },
    },
  });
}

describe('checkTableCellSet', () => {
  it('coerces a valid edit and reports whether the stored cell changes', () => {
    const store = setup();
    const outcome = checkTableCellSet(store.getState(), {
      tableId: 'tbl_test',
      rowId: 'row_2',
      columnId: 'col_value',
      value: '1,234.5',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.value).toBe(1234.5);
    expect(outcome.changed).toBe(true);
    expect(outcome.rowIndex).toBe(1);
    expect(outcome.columnIndex).toBe(1);
  });

  it('returns a structured required issue with a 1-based row number', () => {
    const store = setup();
    const outcome = checkTableCellSet(store.getState(), {
      tableId: 'tbl_test',
      rowId: 'row_1',
      columnId: 'col_id',
      value: '   ',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.issue.reason).toBe('primary-key-empty');
    expect(outcome.issue.code).toBe('E_VALIDATION');
    expect(outcome.issue.columnId).toBe('col_id');
    expect(outcome.issue.rowNumber).toBe(1);
  });

  it('reports the conflicting row number and row id for a duplicate primary key', () => {
    const store = setup();
    const outcome = checkTableCellSet(store.getState(), {
      tableId: 'tbl_test',
      rowId: 'row_2',
      columnId: 'col_id',
      value: 'alpha',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.issue.reason).toBe('duplicate-key');
    expect(outcome.issue.code).toBe('E_DUPLICATE_KEY');
    expect(outcome.issue.rowNumber).toBe(2);
    expect(outcome.issue.conflictRowNumber).toBe(1);
    expect(outcome.issue.conflictRowId).toBe('row_1');
  });

  it('maps domain coercion failures to localisable reasons', () => {
    const store = setup();
    const cases: Array<{ columnId: string; value: unknown; reason: string }> = [
      { columnId: 'col_value', value: 'not-a-number', reason: 'type' },
      { columnId: 'col_status', value: 'deleted', reason: 'enum' },
    ];

    for (const item of cases) {
      const outcome = checkTableCellSet(store.getState(), {
        tableId: 'tbl_test',
        rowId: 'row_1',
        columnId: item.columnId,
        value: item.value,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.issue.reason).toBe(item.reason);
        expect(outcome.issue.rowNumber).toBe(1);
      }
    }
  });

  it('carries the reason and row numbers in the AppError detail', () => {
    const store = setup();
    const outcome = checkTableCellSet(store.getState(), {
      tableId: 'tbl_test',
      rowId: 'row_2',
      columnId: 'col_id',
      value: 'alpha',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    const error = cellIssueToAppError(outcome.issue);
    expect(error.code).toBe('E_DUPLICATE_KEY');
    expect(error.detail).toContain('reason=duplicate-key');
    expect(error.detail).toContain('row=2');
    expect(error.detail).toContain('conflictRow=1');
  });
});

describe('validateCellBatch', () => {
  it('accepts a batch when every edit is valid', () => {
    const issues = validateCellBatch(TABLE, ROWS, [
      { rowId: 'row_1', columnId: 'col_value', value: '10' },
      { rowId: 'row_2', columnId: 'col_status', value: 'active' },
      { rowId: 'row_3', columnId: 'col_flag', value: '否' },
    ]);
    expect(issues).toEqual([]);
  });

  it('returns every invalid cell and does not stop at the first issue', () => {
    const issues = validateCellBatch(TABLE, ROWS, [
      { rowId: 'row_1', columnId: 'col_value', value: 'oops' },
      { rowId: 'row_2', columnId: 'col_status', value: 'deleted' },
      { rowId: 'row_3', columnId: 'col_value', value: '3.5' },
    ]);
    expect(issues.map((issue) => issue.reason)).toEqual(['type', 'enum']);
    expect(issues.map((issue) => issue.rowNumber)).toEqual([1, 2]);
  });

  it('detects duplicate primary keys created by the batch itself', () => {
    const issues = validateCellBatch(TABLE, ROWS, [
      { rowId: 'row_2', columnId: 'col_id', value: 'delta' },
      { rowId: 'row_3', columnId: 'col_id', value: 'delta' },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.reason).toBe('duplicate-key');
    expect(issues[0]?.rowNumber).toBe(3);
    expect(issues[0]?.conflictRowNumber).toBe(2);
    expect(issues[0]?.conflictRowId).toBe('row_2');
  });

  it('allows a primary-key swap when both rows change in the same batch', () => {
    const issues = validateCellBatch(TABLE, ROWS, [
      { rowId: 'row_1', columnId: 'col_id', value: 'beta' },
      { rowId: 'row_2', columnId: 'col_id', value: 'alpha' },
    ]);
    expect(issues).toEqual([]);
  });
});
