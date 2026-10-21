import { describe, expect, it } from 'vitest';

import { createAppError } from '@curve/domain';
import type { ChartSpec, Row, TableMeta, ViewDef } from '@curve/domain';

import { selectCurrentTable } from './selectors';
import { createAppStore } from './store';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

const table: TableMeta = {
  id: 'tbl_1',
  name: 'Table',
  file: 'tables/tbl_1.jsonl',
  schemaVersion: 1,
  columns: [{ id: 'col_id', key: 'id', label: 'Id', type: 'text', role: 'none' }],
  primaryKey: 'col_id',
  rowCount: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const rows: Row[] = [{ id: 'row_1', values: ['a'] }];

const tableView: ViewDef = {
  id: 'viw_1',
  kind: 'table',
  refId: 'tbl_1',
  title: 'Table view',
};

const chart: ChartSpec = {
  id: 'cht_1',
  title: 'Chart',
  kind: 'line',
  tableId: 'tbl_1',
  mapping: { layout: 'wide', xColumnId: 'col_id', yColumnIds: ['col_id'] },
  sort: [],
  options: {
    smooth: false,
    showSymbol: false,
    lineWidth: 2,
    paletteId: 'default',
    background: 'auto',
    showGrid: true,
    legend: 'top',
    yStartAtZero: false,
    numberDigits: 2,
    sampling: { enabled: false, threshold: 1000, target: 2000 },
  },
  version: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const chartView: ViewDef = {
  id: 'viw_chart',
  kind: 'chart',
  refId: 'cht_1',
  title: 'Chart view',
};

function seededStore(): ReturnType<typeof createAppStore> {
  return createAppStore({
    now: () => 123,
    initialState: {
      tables: { tbl_1: { table, rows } },
      views: { viw_1: tableView, viw_chart: chartView },
      charts: { cht_1: chart },
      ui: { activeTableId: 'tbl_1' },
    },
  });
}

describe('app-core store actions', () => {
  it('starts empty and merges partial initial UI state with defaults', () => {
    const store = createAppStore();
    expect(store.getState().workspace).toBeNull();
    expect(store.getState().tables).toEqual({});
    expect(store.getState().ui).toEqual({
      activeTableId: null,
      activeViewId: null,
      error: null,
      dirtyTables: [],
      save: { status: 'idle', pending: 0, error: null },
      editIssue: null,
    });
    expect(selectCurrentTable(store.getState())).toBeNull();

    const seeded = createAppStore({ initialState: { ui: { activeTableId: 'tbl_1' } } });
    expect(seeded.getState().ui.activeTableId).toBe('tbl_1');
    expect(seeded.getState().ui.error).toBeNull();
    expect(seeded.getState().layout).toEqual({
      type: 'pane',
      viewIds: [],
      activeViewId: null,
    });
  });

  it('selects only existing tables and resolves table/chart views', () => {
    const store = seededStore();
    const actions = store.getState().actions;

    actions.setActiveTable('tbl_missing');
    expect(store.getState().ui.activeTableId).toBe('tbl_1');

    actions.setActiveTable(null);
    expect(store.getState().ui.activeTableId).toBeNull();

    actions.setActiveTable('tbl_1');
    actions.setActiveView('viw_1');
    expect(store.getState().ui.activeViewId).toBe('viw_1');
    expect(store.getState().ui.activeTableId).toBe('tbl_1');

    actions.setActiveView('viw_chart');
    expect(store.getState().ui.activeViewId).toBe('viw_chart');
    expect(store.getState().ui.activeTableId).toBe('tbl_1');

    actions.setActiveView('viw_missing');
    expect(store.getState().ui.activeViewId).toBe('viw_chart');

    actions.setActiveView(null);
    expect(store.getState().ui.activeViewId).toBeNull();
    expect(store.getState().ui.activeTableId).toBe('tbl_1');
  });

  it('tracks dirty tables in first-mark order and exposes the injected clock', () => {
    const store = seededStore();
    const actions = store.getState().actions;

    actions.markDirty('tbl_missing');
    expect(store.getState().ui.dirtyTables).toEqual([]);

    const first = actions.markDirty('tbl_1');
    expect(first).toBeUndefined();
    expect(store.getState().ui.dirtyTables).toEqual([
      { tableId: 'tbl_1', revision: 1, markedAt: 123 },
    ]);

    actions.markDirty('tbl_1');
    expect(store.getState().ui.dirtyTables[0]?.revision).toBe(2);

    actions.clearDirty('tbl_missing');
    expect(store.getState().ui.dirtyTables).toHaveLength(1);

    actions.clearDirty('tbl_1');
    expect(store.getState().ui.dirtyTables).toEqual([]);

    actions.markDirty('tbl_1');
    actions.clearAllDirty();
    expect(store.getState().ui.dirtyTables).toEqual([]);
  });

  it('stores and clears the single AppError surface', () => {
    const store = createAppStore();
    const actions = store.getState().actions;
    const error = createAppError('E_VALIDATION', 'Bad value');

    actions.setError(error);
    expect(store.getState().ui.error).toEqual(error);

    actions.clearError();
    expect(store.getState().ui.error).toBeNull();

    // Clearing twice is a no-op and must not throw.
    actions.clearError();
    expect(store.getState().ui.error).toBeNull();
  });

  it('stores save and edit issues as UI-only state', () => {
    const store = createAppStore();
    const actions = store.getState().actions;
    const error = createAppError('E_FS_WRITE', 'disk full');

    actions.setSaveState({ status: 'error', pending: 0, error });
    expect(store.getState().ui.save).toEqual({ status: 'error', pending: 0, error });

    actions.setEditIssue({
      reason: 'type',
      code: 'E_TYPE',
      columnId: 'col_value',
      rowNumber: 2,
      message: 'expects a number',
    });
    expect(store.getState().ui.editIssue?.rowNumber).toBe(2);

    actions.setEditIssue(null);
    expect(store.getState().ui.editIssue).toBeNull();
  });
});
