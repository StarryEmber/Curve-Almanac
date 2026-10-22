import { applyPatches } from 'immer';
import { describe, expect, it, vi } from 'vitest';

import type { Row, TableMeta } from '@curve/domain';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import { createRowInsertCommand } from './rows';

import type { AppLogger } from '../logging';
import type { WorkspaceInfo } from '../state/types';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const NOW = '2026-01-01T12:00:00.000Z';

const TABLE: TableMeta = {
  id: 'tbl_rows',
  name: 'Rows',
  file: 'tables/tbl_rows.jsonl',
  schemaVersion: 1,
  columns: [
    { id: 'col_id', key: 'id', label: 'Id', type: 'text', role: 'none', required: true },
    { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'label' },
    { id: 'col_amount', key: 'amount', label: 'Amount', type: 'number', role: 'y' },
    { id: 'col_done', key: 'done', label: 'Done', type: 'boolean', role: 'none' },
  ],
  primaryKey: 'col_id',
  rowCount: 2,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const ROWS: Row[] = [
  { id: 'row_1', values: ['a', 'First', 1, true] },
  { id: 'row_2', values: ['b', 'Second', 2, false] },
];

const WORKSPACE: WorkspaceInfo = {
  formatVersion: 1,
  id: 'ws_rows',
  name: 'Rows',
  root: 'C:\\tmp\\Rows.cstudio',
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

function uuidSequence(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `insert${String(index)}`;
  };
}

interface Setup {
  store: ReturnType<typeof createAppStore>;
  bus: ReturnType<typeof createCommandBus>;
  logger: AppLogger;
}

function setup(): Setup {
  const store = createAppStore({
    initialState: {
      workspace: WORKSPACE,
      tables: { tbl_rows: { table: TABLE, rows: ROWS } },
      ui: { activeTableId: 'tbl_rows' },
    },
  });
  const logger: AppLogger = { error: vi.fn(), warn: vi.fn() };
  const bus = createCommandBus(store, { logger });
  bus.register(createRowInsertCommand({ now: () => new Date(NOW), uuid: uuidSequence() }));
  return { store, bus, logger };
}

describe('table.rows.insert', () => {
  it('inserts rows at the index, coerces values and records reversible patches', () => {
    const { store, bus, logger } = setup();
    const before = store.getState();
    const outcome = bus.dispatch('table.rows.insert', {
      tableId: TABLE.id,
      index: 1,
      rows: [
        { id: 'row_mid', values: ['mid', 'Middle', '1,234.5', '是'] },
        { values: ['', 'Last', '3', 'false'] },
      ],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const after = store.getState();
    const data = after.tables['tbl_rows'];
    expect(data?.rows).toHaveLength(4);
    expect(data?.rows[1]).toEqual({ id: 'row_mid', values: ['mid', 'Middle', 1234.5, true] });
    expect(data?.rows[2]?.id).toBe('row_insert1');
    expect(data?.rows[2]?.values).toEqual(['row_insert1', 'Last', 3, false]);
    expect(data?.rows[0]).toBe(ROWS[0]);
    expect(data?.table.rowCount).toBe(4);
    expect(data?.table.updatedAt).toBe(NOW);
    expect(after.workspace?.updatedAt).toBe(NOW);
    expect(after.ui.dirtyTables.map((entry) => entry.tableId)).toEqual(['tbl_rows']);
    expect(logger.error).not.toHaveBeenCalled();

    const restored = applyPatches(after, outcome.result.inversePatches);
    expect(restored.tables).toEqual(before.tables);
    expect(restored.workspace).toEqual(before.workspace);
  });

  it('appends when index equals the row count', () => {
    const { store, bus } = setup();
    const outcome = bus.dispatch('table.rows.insert', {
      tableId: TABLE.id,
      index: 2,
      rows: [{ values: ['c', 'Third', 3, true] }],
    });
    expect(outcome.ok).toBe(true);
    const rows = store.getState().tables['tbl_rows']?.rows;
    expect(rows?.map((row) => row.values[0])).toEqual(['a', 'b', 'c']);
    expect(rows?.[2]?.id).toBe('row_insert1');
  });

  it('rejects duplicate keys, duplicate row ids and bad shapes without changing state', () => {
    const cases: Array<{ payload: unknown; code: string }> = [
      {
        payload: {
          tableId: TABLE.id,
          index: 2,
          rows: [{ values: ['a', 'Duplicate', 1, true] }],
        },
        code: 'E_DUPLICATE_KEY',
      },
      {
        payload: {
          tableId: TABLE.id,
          index: 2,
          rows: [{ id: 'row_1', values: ['c', 'Third', 3, true] }],
        },
        code: 'E_DUPLICATE_KEY',
      },
      {
        payload: {
          tableId: TABLE.id,
          index: 2,
          rows: [{ values: ['c', 'Third'] }],
        },
        code: 'E_VALIDATION',
      },
      {
        payload: {
          tableId: TABLE.id,
          index: 3,
          rows: [{ values: ['c', 'Third', 3, true] }],
        },
        code: 'E_VALIDATION',
      },
      {
        payload: {
          tableId: TABLE.id,
          index: 2,
          rows: [{ values: ['c', 'Third', 'not-a-number', true] }],
        },
        code: 'E_VALIDATION',
      },
      {
        payload: {
          tableId: 'tbl_missing',
          index: 0,
          rows: [{ values: ['c', 'Third', 3, true] }],
        },
        code: 'E_TABLE_NOT_FOUND',
      },
      {
        payload: { tableId: TABLE.id, index: 2, rows: [] },
        code: 'E_VALIDATION',
      },
      {
        payload: { tableId: TABLE.id, index: 2, rows: [{ id: 'bad', values: ['c'] }] },
        code: 'E_VALIDATION',
      },
    ];

    for (const testCase of cases) {
      const { store, bus } = setup();
      const before = store.getState();
      const outcome = bus.dispatch('table.rows.insert', testCase.payload);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) {
        continue;
      }
      expect(outcome.error.code).toBe(testCase.code);
      expect(store.getState().tables).toBe(before.tables);
      expect(store.getState().workspace).toBe(before.workspace);
    }
  });
});
