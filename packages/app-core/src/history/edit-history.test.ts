import { describe, expect, it, vi } from 'vitest';

import { createTableStyle } from '@curve/domain';
import type { LayoutNode, Row, TableMeta, ViewDef } from '@curve/domain';

import { createCommandBus } from '../commands/bus';
import { createChartCreateCommand, createNewChartPayload } from '../commands/charts';
import { createPasteCommand } from '../commands/paste';
import { createRowInsertCommand } from '../commands/rows';
import { createStyleCreateCommand, createStyleUpdateCommand } from '../commands/styles';
import { createTableCellSetCommand } from '../commands/table-cell-set';
import { createViewLayoutCommand } from '../commands/views';
import {
  createEditHistory,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HISTORY_MAX_BYTES,
} from '../history/edit-history';
import { createAppStore } from '../state/store';

import type { CommandResult } from '../commands/types';
import type { AppLogger } from '../logging';
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
  ],
  primaryKey: 'col_id',
  rowCount: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const ROWS: Row[] = [{ id: 'row_1', values: ['alpha', 1] }];

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

const logger: AppLogger = { error: () => undefined, warn: () => undefined };

function setup(): {
  store: ReturnType<typeof createAppStore>;
  bus: ReturnType<typeof createCommandBus>;
  dispatch: (value: number) => CommandResult;
  dispatchPaste: (matrix: string[][], newColumns?: TableMeta['columns']) => CommandResult;
  history: ReturnType<typeof createEditHistory>;
  onChanged: ReturnType<typeof vi.fn>;
  onStateChange: ReturnType<typeof vi.fn>;
  advance: (ms: number) => void;
} {
  const store = createAppStore({
    initialState: {
      workspace: WORKSPACE,
      tables: { tbl_test: { table: TABLE, rows: ROWS } },
    },
  });
  let clock = 1_000;
  const onChanged = vi.fn();
  const onStateChange = vi.fn();
  const history: ReturnType<typeof createEditHistory> = createEditHistory({
    store,
    now: () => clock,
    onChanged: (tableId) => {
      onChanged(tableId);
      store.getState().actions.markDirty(tableId);
    },
    onStateChange,
  });
  const bus = createCommandBus(store, {
    logger,
    onCommand: (result) => {
      history.record(result);
    },
  });
  bus.register(createTableCellSetCommand({ now: () => new Date('2026-01-01T12:00:00.000Z') }));
  bus.register(
    createPasteCommand({
      now: () => new Date('2026-01-01T12:00:00.000Z'),
      uuid: () => 'pasted',
    }),
  );
  bus.register(createViewLayoutCommand({ now: () => new Date('2026-01-01T12:00:00.000Z') }));
  bus.register(
    createRowInsertCommand({
      now: () => new Date('2026-01-01T12:00:00.000Z'),
      uuid: () => 'inserted',
    }),
  );

  const dispatch = (value: number): CommandResult => {
    const outcome = bus.dispatch('table.cell.set', {
      tableId: 'tbl_test',
      rowId: 'row_1',
      columnId: 'col_value',
      value,
    });
    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.result;
  };

  const dispatchPaste = (matrix: string[][], newColumns?: TableMeta['columns']): CommandResult => {
    const outcome = bus.dispatch('table.paste', {
      tableId: 'tbl_test',
      anchor: { rowId: 'row_1', columnId: 'col_id' },
      columnIds: TABLE.columns.map((column) => column.id),
      matrix,
      ...(newColumns === undefined ? {} : { newColumns }),
    });
    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.result;
  };

  return {
    store,
    bus,
    dispatch,
    dispatchPaste,
    history,
    onChanged,
    onStateChange,
    advance: (ms) => {
      clock += ms;
    },
  };
}
describe('edit history', () => {
  it('merges edits to the same cell within 800ms into one undo entry', () => {
    const { store, dispatch, history, advance } = setup();

    dispatch(10);
    advance(100);
    dispatch(20);
    advance(100);
    dispatch(30);

    expect(history.size()).toBe(1);
    expect(history.canUndo()).toBe(true);

    expect(history.undo()).toBe(true);
    expect(store.getState().tables['tbl_test']?.rows[0]?.values[1]).toBe(1);
    expect(history.canRedo()).toBe(true);

    expect(history.redo()).toBe(true);
    expect(store.getState().tables['tbl_test']?.rows[0]?.values[1]).toBe(30);
  });

  it('starts a new entry after the merge window and after a different cell', () => {
    const { store, dispatch, history, advance } = setup();

    dispatch(10);
    advance(801);
    dispatch(20);

    expect(history.size()).toBe(2);
    history.undo();
    expect(store.getState().tables['tbl_test']?.rows[0]?.values[1]).toBe(10);
    history.undo();
    expect(store.getState().tables['tbl_test']?.rows[0]?.values[1]).toBe(1);
  });

  it('drops the redo branch when a new edit arrives and caps the stack', () => {
    const { dispatch, history, advance } = setup();

    dispatch(10);
    history.undo();
    expect(history.canRedo()).toBe(true);
    advance(900);
    dispatch(20);
    expect(history.canRedo()).toBe(false);

    for (let index = 0; index < 120; index += 1) {
      advance(900);
      dispatch(100 + index);
    }
    expect(history.size()).toBe(100);
  });

  it('notifies after undo/redo so the save queue can persist the restored value', () => {
    const { dispatch, history, onChanged } = setup();
    dispatch(10);
    onChanged.mockClear();

    history.undo();
    expect(onChanged).toHaveBeenCalledWith('tbl_test');
    history.redo();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('records a paste as one entry and undoes updated and appended rows together', () => {
    const { store, dispatchPaste, history } = setup();
    dispatchPaste([
      ['alpha', '10'],
      ['beta', '20'],
    ]);
    expect(history.size()).toBe(1);
    expect(store.getState().tables['tbl_test']?.rows).toHaveLength(2);

    history.undo();
    expect(store.getState().tables['tbl_test']?.rows).toHaveLength(1);
    expect(store.getState().tables['tbl_test']?.rows[0]?.values).toEqual(['alpha', 1]);
    expect(store.getState().tables['tbl_test']?.table.rowCount).toBe(1);

    history.redo();
    expect(store.getState().tables['tbl_test']?.rows).toHaveLength(2);
    expect(store.getState().tables['tbl_test']?.rows[1]?.values).toEqual(['beta', 20]);
  });

  it('undoes a paste that added a column, including the schema change', () => {
    const { store, dispatchPaste, history } = setup();
    dispatchPaste(
      [['alpha', '5', 'x']],
      [{ id: 'col_extra', key: 'extra', label: 'Extra', type: 'text', role: 'none' }],
    );
    expect(store.getState().tables['tbl_test']?.table.columns).toHaveLength(3);
    expect(store.getState().tables['tbl_test']?.rows[0]?.values).toEqual(['alpha', 5, 'x']);

    history.undo();
    expect(store.getState().tables['tbl_test']?.table.columns).toHaveLength(2);
    expect(store.getState().tables['tbl_test']?.rows[0]?.values).toEqual(['alpha', 1]);
  });

  it('does not merge a paste with an adjacent cell edit', () => {
    const { dispatch, dispatchPaste, history, advance } = setup();
    dispatch(10);
    advance(100);
    dispatchPaste([['alpha', '20']]);
    advance(100);
    dispatch(30);
    expect(history.size()).toBe(3);

    history.undo();
    expect(history.size()).toBe(2);
    history.undo();
    expect(history.size()).toBe(1);
    history.undo();
    expect(history.size()).toBe(0);
  });

  it('records a row insert as one entry and restores the row count', () => {
    const { store, bus, history } = setup();

    const inserted = bus.dispatch('table.rows.insert', {
      tableId: 'tbl_test',
      index: 1,
      rows: [{ values: ['beta', 2] }],
    });
    expect(inserted.ok).toBe(true);
    expect(store.getState().tables['tbl_test']?.rows).toHaveLength(2);
    expect(store.getState().tables['tbl_test']?.table.rowCount).toBe(2);
    expect(history.snapshot()).toMatchObject({ undoAction: 'table.rows.insert', undoDepth: 1 });

    expect(history.undo()).toBe(true);
    expect(store.getState().tables['tbl_test']?.rows).toHaveLength(1);
    expect(store.getState().tables['tbl_test']?.table.rowCount).toBe(1);
    expect(history.redo()).toBe(true);
    expect(store.getState().tables['tbl_test']?.rows[1]?.values).toEqual(['beta', 2]);
  });

  it('clears both stacks', () => {
    const { dispatch, history } = setup();
    dispatch(10);
    history.undo();
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });
});

describe('workspace-scoped history', () => {
  it('records style.update and restores it through undo/redo', () => {
    const style = createTableStyle({ id: 'sty_test', name: 'Original' });
    const store = createAppStore({
      initialState: { workspace: WORKSPACE, tableStyles: { sty_test: style } },
    });
    const onChanged = vi.fn();
    const onWorkspaceChanged = vi.fn();
    const history = createEditHistory({
      store,
      now: () => 1_000,
      onChanged,
      onWorkspaceChanged,
    });
    const bus = createCommandBus(store, {
      logger,
      onCommand: (result) => {
        history.record(result);
      },
    });
    bus.register(createStyleUpdateCommand({ now: () => new Date('2026-01-01T12:00:00.000Z') }));

    const dispatched = bus.dispatch('style.update', {
      style: { ...style, name: 'Updated' },
    });
    expect(dispatched.ok).toBe(true);
    expect(history.size()).toBe(1);
    expect(store.getState().tableStyles['sty_test']?.name).toBe('Updated');

    expect(history.undo()).toBe(true);
    expect(store.getState().tableStyles['sty_test']?.name).toBe('Original');
    expect(onWorkspaceChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();

    expect(history.redo()).toBe(true);
    expect(store.getState().tableStyles['sty_test']?.name).toBe('Updated');
    expect(onWorkspaceChanged).toHaveBeenCalledTimes(2);
  });

  it('records style.create with its applied view as one workspace entry', () => {
    const view: ViewDef = {
      id: 'viw_test',
      kind: 'table',
      refId: 'tbl_test',
      title: 'Test',
      tableView: {
        tableId: 'tbl_test',
        styleId: 'builtin.report-light',
        columnOrder: [],
        widths: {},
        hiddenColumnIds: [],
        sort: [],
        frozenColumnCount: 0,
      },
    };
    const store = createAppStore({
      initialState: { workspace: WORKSPACE, views: { viw_test: view } },
    });
    const onWorkspaceChanged = vi.fn();
    const history = createEditHistory({
      store,
      now: () => 1_000,
      onWorkspaceChanged,
    });
    const bus = createCommandBus(store, {
      logger,
      onCommand: (result) => {
        history.record(result);
      },
    });
    bus.register(createStyleCreateCommand({ now: () => new Date('2026-01-01T12:00:00.000Z') }));
    const created = createTableStyle({ id: 'sty_created', name: 'Created' });

    const dispatched = bus.dispatch('style.create', { style: created, viewId: 'viw_test' });
    expect(dispatched.ok).toBe(true);
    expect(history.size()).toBe(1);
    expect(store.getState().tableStyles['sty_created']).toBeDefined();

    expect(history.undo()).toBe(true);
    expect(store.getState().tableStyles['sty_created']).toBeUndefined();
    expect(store.getState().views['viw_test']?.tableView?.styleId).toBe('builtin.report-light');
    expect(onWorkspaceChanged).toHaveBeenCalledTimes(1);
  });
});

describe('history caps and UI snapshots', () => {
  it('publishes command names and depths for the Edit menu', () => {
    const { dispatch, history, onStateChange } = setup();
    dispatch(10);

    expect(history.snapshot()).toEqual({
      canUndo: true,
      canRedo: false,
      undoAction: 'table.cell.set',
      redoAction: null,
      undoDepth: 1,
      redoDepth: 0,
    });
    expect(onStateChange).toHaveBeenLastCalledWith(history.snapshot());

    history.undo();
    expect(history.snapshot()).toMatchObject({
      canUndo: false,
      canRedo: true,
      undoAction: null,
      redoAction: 'table.cell.set',
      redoDepth: 1,
    });
    history.clear();
    expect(history.snapshot()).toEqual({
      canUndo: false,
      canRedo: false,
      undoAction: null,
      redoAction: null,
      undoDepth: 0,
      redoDepth: 0,
    });
  });

  it('keeps the latest 100 edits consistent through 100 undo and redo steps', () => {
    const { dispatch, history, advance, store } = setup();

    for (let index = 0; index < 120; index += 1) {
      advance(900);
      dispatch(100 + index);
    }
    expect(history.size()).toBe(DEFAULT_HISTORY_LIMIT);

    for (let index = 0; index < DEFAULT_HISTORY_LIMIT; index += 1) {
      history.undo();
    }
    // The first 20 entries were dropped; the retained stack starts at value 120.
    expect(store.getState().tables['tbl_test']?.rows[0]?.values[1]).toBe(119);

    for (let index = 0; index < DEFAULT_HISTORY_LIMIT; index += 1) {
      history.redo();
    }
    expect(store.getState().tables['tbl_test']?.rows[0]?.values[1]).toBe(219);
  });

  it('drops the oldest entries when the estimated byte cap is exceeded', () => {
    const store = createAppStore();
    const history = createEditHistory({ store, maxBytes: 1_800 });
    const makeResult = (): CommandResult => {
      const patch = {
        op: 'replace' as const,
        path: ['workspace'],
        value: 'x'.repeat(300),
      };
      return {
        name: 'test.command',
        payload: {},
        next: store.getState(),
        patches: [patch],
        inversePatches: [patch],
      };
    };

    history.record(makeResult());
    history.record(makeResult());
    history.record(makeResult());

    expect(history.size()).toBe(1);
    expect(history.sizeBytes()).toBeLessThanOrEqual(1_800);
    expect(history.canUndo()).toBe(true);
  });

  it('uses the SPEC 256 MB cap and 100-entry limit by default', () => {
    expect(DEFAULT_HISTORY_LIMIT).toBe(100);
    expect(DEFAULT_HISTORY_MAX_BYTES).toBe(256 * 1024 * 1024);
  });

  it('estimates a 100k-row cell edit as an array reference, not a full stringify', () => {
    const rows: Row[] = Array.from({ length: 100_000 }, (_, index) => ({
      id: `row_${String(index)}`,
      values: [`key-${String(index)}`, index],
    }));
    const table: TableMeta = { ...TABLE, rowCount: rows.length };
    const store = createAppStore({
      initialState: { workspace: WORKSPACE, tables: { tbl_test: { table, rows } } },
    });
    const history = createEditHistory({ store });
    const bus = createCommandBus(store, {
      logger,
      onCommand: (result) => {
        history.record(result);
      },
    });
    bus.register(createTableCellSetCommand({ now: () => new Date('2026-01-01T12:00:00.000Z') }));

    const outcome = bus.dispatch('table.cell.set', {
      tableId: 'tbl_test',
      rowId: 'row_50000',
      columnId: 'col_value',
      value: 1234,
    });
    expect(outcome.ok).toBe(true);
    expect(history.size()).toBe(1);
    // Forward and inverse each retain one 100k-element array (~800 KB each).
    expect(history.sizeBytes()).toBeGreaterThan(1_000_000);
    expect(history.sizeBytes()).toBeLessThan(3_000_000);
  });
});

describe('layout history', () => {
  function tableView(tableId: string, styleId = 'builtin.report-light'): ViewDef['tableView'] {
    return {
      tableId,
      styleId,
      columnOrder: ['col_id', 'col_value'],
      widths: {},
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: 0,
    };
  }

  it('ignores tab-focus layout changes and records structural layout changes', () => {
    const { store, bus, dispatch, history } = setup();
    const viewA: ViewDef = {
      id: 'viw_a',
      kind: 'table',
      refId: 'tbl_test',
      title: 'A',
      tableView: tableView('tbl_test'),
    };
    const viewB: ViewDef = {
      id: 'viw_b',
      kind: 'table',
      refId: 'tbl_test',
      title: 'B',
      tableView: tableView('tbl_test'),
    };
    store.setState({
      views: { viw_a: viewA, viw_b: viewB },
      layout: { type: 'pane', viewIds: ['viw_a', 'viw_b'], activeViewId: 'viw_a' },
    });

    dispatch(10);
    history.undo();
    expect(history.canRedo()).toBe(true);

    // Selecting another tab only changes activeViewId; it must not clear redo.
    const focused: LayoutNode = {
      type: 'pane',
      viewIds: ['viw_a', 'viw_b'],
      activeViewId: 'viw_b',
    };
    const select = bus.dispatch('view.layout', { layout: focused, activePanePath: 'root' });
    expect(select.ok).toBe(true);
    expect(history.size()).toBe(0);
    expect(history.canRedo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect(store.getState().tables['tbl_test']?.rows[0]?.values[1]).toBe(10);
    history.clear();

    // Splitting is a document layout change and is one reversible entry.
    const split: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'pane', viewIds: ['viw_a'], activeViewId: 'viw_a' },
      second: { type: 'pane', viewIds: ['viw_b'], activeViewId: 'viw_b' },
    };
    const structural = bus.dispatch('view.layout', { layout: split, activePanePath: 'root.0' });
    expect(structural.ok).toBe(true);
    expect(history.size()).toBe(1);
    expect(history.snapshot().undoAction).toBe('view.layout');
    expect(store.getState().layout).toEqual(split);

    expect(history.undo()).toBe(true);
    expect(store.getState().layout).toEqual(focused);
    expect(history.redo()).toBe(true);
    expect(store.getState().layout).toEqual(split);
  });
});

describe('chart history', () => {
  it('records chart.create and restores the chart, view and layout through undo/redo', () => {
    const store = createAppStore({
      initialState: {
        workspace: WORKSPACE,
        tables: { [TABLE.id]: { table: TABLE, rows: ROWS } },
        layout: { type: 'pane', viewIds: [], activeViewId: null },
      },
    });
    const onChanged = vi.fn();
    const onWorkspaceChanged = vi.fn();
    const history = createEditHistory({
      store,
      now: () => 1_000,
      onChanged,
      onWorkspaceChanged,
    });
    const bus = createCommandBus(store, {
      logger,
      onCommand: (result) => {
        history.record(result);
      },
    });
    bus.register(createChartCreateCommand({ now: () => new Date('2026-01-01T12:00:00.000Z') }));
    const payload = createNewChartPayload({
      table: TABLE,
      title: 'Readings chart',
      kind: 'line',
      mapping: { layout: 'wide', xColumnId: 'col_id', yColumnIds: ['col_value'] },
      now: new Date('2026-01-01T12:00:00.000Z'),
      uuid: () => 'history',
    });

    expect(bus.dispatch('chart.create', payload).ok).toBe(true);
    expect(history.size()).toBe(1);
    expect(store.getState().views['viw_history']).toBeDefined();
    expect(store.getState().layout).toMatchObject({ viewIds: ['viw_history'] });

    expect(history.undo()).toBe(true);
    expect(store.getState().charts['cht_history']).toBeUndefined();
    expect(store.getState().views['viw_history']).toBeUndefined();
    expect(store.getState().layout).toMatchObject({ viewIds: [], activeViewId: null });
    expect(onWorkspaceChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();

    expect(history.redo()).toBe(true);
    expect(store.getState().charts['cht_history']).toBeDefined();
    expect(store.getState().layout).toMatchObject({ viewIds: ['viw_history'] });
    expect(onWorkspaceChanged).toHaveBeenCalledTimes(2);
  });
});
