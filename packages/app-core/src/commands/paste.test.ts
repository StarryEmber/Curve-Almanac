import { applyPatches } from 'immer';
import { describe, expect, it, vi } from 'vitest';

import type { ColumnDef, Row, TableMeta, ViewDef } from '@curve/domain';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import { createPasteCommand } from './paste';

import type { AppLogger } from '../logging';
import type { WorkspaceInfo } from '../state/types';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const NOW = '2026-01-01T12:00:00.000Z';

const COLUMNS: TableMeta['columns'] = [
  { id: 'col_id', key: 'id', label: 'Id', type: 'text', role: 'none', required: true },
  { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'label' },
  { id: 'col_amount', key: 'amount', label: 'Amount', type: 'number', role: 'y' },
  { id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'x' },
];

const TABLE: TableMeta = {
  id: 'tbl_paste',
  name: 'Paste',
  file: 'tables/tbl_paste.jsonl',
  schemaVersion: 1,
  columns: COLUMNS,
  primaryKey: 'col_id',
  rowCount: 3,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const ROWS: Row[] = [
  { id: 'row_a', values: ['alpha', 'First', 10, 100] },
  { id: 'row_b', values: ['beta', 'Second', 20, 200] },
  { id: 'row_c', values: ['gamma', 'Third', 30, 300] },
];

const VIEW: ViewDef = {
  id: 'viw_paste',
  kind: 'table',
  refId: TABLE.id,
  title: 'Paste',
  tableView: {
    tableId: TABLE.id,
    styleId: 'builtin.report-light',
    columnOrder: COLUMNS.map((entry) => entry.id),
    widths: {},
    hiddenColumnIds: [],
    sort: [],
    frozenColumnCount: 1,
  },
};

const WORKSPACE: WorkspaceInfo = {
  formatVersion: 1,
  id: 'ws_paste',
  name: 'Paste',
  root: 'C:\\tmp\\Paste.cstudio',
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
    return `paste${String(index)}`;
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
      tables: { tbl_paste: { table: TABLE, rows: ROWS } },
      views: { viw_paste: VIEW },
      layout: { type: 'pane', viewIds: ['viw_paste'], activeViewId: 'viw_paste' },
      ui: { activeTableId: 'tbl_paste', activeViewId: 'viw_paste' },
    },
  });
  const logger: AppLogger = { error: vi.fn(), warn: vi.fn() };
  const bus = createCommandBus(store, { logger });
  bus.register(createPasteCommand({ now: () => new Date(NOW), uuid: uuidSequence() }));
  return { store, bus, logger };
}

interface PasteOverrides {
  anchor?: { rowId: string | null; columnId: string };
  columnIds?: string[];
  matrix?: string[][];
  newColumns?: ColumnDef[];
}

function paste(
  bus: ReturnType<typeof createCommandBus>,
  overrides: PasteOverrides = {},
): ReturnType<typeof bus.dispatch> {
  return bus.dispatch('table.paste', {
    tableId: TABLE.id,
    anchor: { rowId: 'row_a', columnId: 'col_id' },
    columnIds: COLUMNS.map((entry) => entry.id),
    matrix: [
      ['alpha', 'Renamed', '1,234.5', '2026-02-03'],
      ['beta', 'Second', '20', '2026-01-02'],
      ['gamma', 'Third', '30', '2026-01-03'],
      ['delta', 'Delta', '40', '2026-01-04'],
      ['epsilon', 'Epsilon', '50', '2026-01-05'],
    ],
    ...overrides,
  });
}

describe('table.paste', () => {
  it('updates rows, appends rows and records reversible patches', () => {
    const { store, bus, logger } = setup();
    const before = store.getState();
    const outcome = paste(bus);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const after = store.getState();
    const data = after.tables['tbl_paste'];
    expect(data?.rows).toHaveLength(5);
    expect(data?.rows[0]?.values).toEqual([
      'alpha',
      'Renamed',
      1234.5,
      new Date(2026, 1, 3).getTime(),
    ]);
    expect(data?.rows[3]?.values[0]).toBe('delta');
    expect(data?.rows[3]?.id).toBe('row_paste1');
    expect(data?.table.rowCount).toBe(5);
    expect(data?.table.updatedAt).toBe(NOW);
    expect(after.workspace?.updatedAt).toBe(NOW);
    expect(after.views['viw_paste']?.tableView?.columnOrder).toEqual(
      COLUMNS.map((entry) => entry.id),
    );
    expect(after.ui.dirtyTables.map((entry) => entry.tableId)).toEqual(['tbl_paste']);
    expect(logger.error).not.toHaveBeenCalled();

    const restored = applyPatches(after, outcome.result.inversePatches);
    expect(restored.tables).toEqual(before.tables);
    expect(restored.views).toEqual(before.views);
    expect(restored.workspace).toEqual(before.workspace);
  });

  it('adds new columns to the schema, every view and every row atomically', () => {
    const { store, bus } = setup();
    const outcome = paste(bus, {
      anchor: { rowId: 'row_a', columnId: 'col_name' },
      matrix: [['Renamed', '1', '2026-02-03', 'x', 'y']],
      newColumns: [
        { id: 'col_extra1', key: 'extra1', label: 'Extra 1', type: 'text', role: 'none' },
        { id: 'col_extra2', key: 'extra2', label: 'Extra 2', type: 'text', role: 'none' },
      ],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const data = store.getState().tables['tbl_paste'];
    expect(data?.table.columns.map((entry) => entry.id)).toEqual([
      ...COLUMNS.map((entry) => entry.id),
      'col_extra1',
      'col_extra2',
    ]);
    expect(data?.rows[0]?.values).toEqual([
      'alpha',
      'Renamed',
      1,
      new Date(2026, 1, 3).getTime(),
      'x',
      'y',
    ]);
    expect(data?.rows[1]?.values.slice(-2)).toEqual(['', '']);
    expect(data?.rows[2]?.values.slice(-2)).toEqual(['', '']);
    expect(store.getState().views['viw_paste']?.tableView?.columnOrder).toEqual([
      ...COLUMNS.map((entry) => entry.id),
      'col_extra1',
      'col_extra2',
    ]);
  });

  it('generates a primary key for an appended row with a blank key', () => {
    const { store, bus } = setup();
    const outcome = paste(bus, {
      anchor: { rowId: 'row_c', columnId: 'col_id' },
      matrix: [
        ['gamma', 'Third!'],
        ['', 'New'],
      ],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const rows = store.getState().tables['tbl_paste']?.rows;
    expect(rows).toHaveLength(4);
    expect(rows?.[2]?.values[1]).toBe('Third!');
    expect(rows?.[3]?.id).toBe('row_paste1');
    expect(rows?.[3]?.values[0]).toBe('row_paste1');
    expect(rows?.[3]?.values[1]).toBe('New');
  });

  it('rejects invalid cells without changing the document', () => {
    const { store, bus, logger } = setup();
    const before = store.getState();
    const outcome = paste(bus, {
      matrix: [['alpha', 'Renamed', 'not-a-number', '2026-02-03']],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.error.code).toBe('E_TYPE');
    expect(store.getState().tables).toBe(before.tables);
    expect(store.getState().views).toBe(before.views);
    expect(store.getState().workspace).toBe(before.workspace);
    expect(store.getState().ui.error).toEqual(outcome.error);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed payloads before touching state', () => {
    const { store, bus } = setup();
    const before = store.getState();
    const outcome = bus.dispatch('table.paste', { tableId: TABLE.id });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_VALIDATION');
    }
    expect(store.getState().tables).toBe(before.tables);
  });

  it('rejects a matrix that needs columns without column definitions', () => {
    const { store, bus } = setup();
    const before = store.getState();
    const outcome = paste(bus, {
      anchor: { rowId: 'row_a', columnId: 'col_day' },
      matrix: [['2026-01-01', 'x', 'y']],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_VALIDATION');
      expect(outcome.error.detail).toContain('needsColumns=2');
    }
    expect(store.getState().tables).toBe(before.tables);
  });
});
