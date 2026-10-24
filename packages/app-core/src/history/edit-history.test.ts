import { describe, expect, it, vi } from 'vitest';

import { createTableStyle } from '@curve/domain';
import type { Row, TableMeta, ViewDef } from '@curve/domain';

import { createCommandBus } from '../commands/bus';
import { createPasteCommand } from '../commands/paste';
import { createStyleCreateCommand, createStyleUpdateCommand } from '../commands/styles';
import { createTableCellSetCommand } from '../commands/table-cell-set';
import { createEditHistory } from '../history/edit-history';
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
  dispatch: (value: number) => CommandResult;
  dispatchPaste: (matrix: string[][], newColumns?: TableMeta['columns']) => CommandResult;
  history: ReturnType<typeof createEditHistory>;
  onChanged: ReturnType<typeof vi.fn>;
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
  const history: ReturnType<typeof createEditHistory> = createEditHistory({
    store,
    now: () => clock,
    onChanged: (tableId) => {
      onChanged(tableId);
      store.getState().actions.markDirty(tableId);
    },
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
    dispatch,
    dispatchPaste,
    history,
    onChanged,
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
