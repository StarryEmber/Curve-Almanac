import { describe, expect, it, vi } from 'vitest';

import type { Row, TableMeta } from '@curve/domain';

import { createCommandBus } from '../commands/bus';
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

  return {
    store,
    dispatch,
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
