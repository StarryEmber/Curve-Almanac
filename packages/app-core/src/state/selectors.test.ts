import { describe, expect, it } from 'vitest';

import { createAppError } from '@curve/domain';
import type { Row, TableMeta } from '@curve/domain';

import {
  EMPTY_ROWS,
  selectActiveView,
  selectCurrentTable,
  selectDirtyTables,
  selectVisibleRows,
} from './selectors';
import { createAppStore } from './store';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function makeTable(rowCount: number): TableMeta {
  return {
    id: 'tbl_100k',
    name: '100k',
    file: 'tables/tbl_100k.jsonl',
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'Id', type: 'text', role: 'none' },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    ],
    primaryKey: 'col_id',
    rowCount,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function makeRows(rowCount: number): Row[] {
  return Array.from({ length: rowCount }, (_, index) => ({
    id: `row_${String(index).padStart(6, '0')}`,
    values: [`sensor-${index}`, index],
  }));
}

describe('app-core selectors', () => {
  it('returns stable empty values before a workspace is open', () => {
    const store = createAppStore();
    expect(selectCurrentTable(store.getState())).toBeNull();
    expect(selectVisibleRows(store.getState())).toBe(EMPTY_ROWS);
    expect(selectDirtyTables(store.getState())).toEqual([]);
    expect(selectActiveView(store.getState())).toBeNull();
    expect(Object.isFrozen(EMPTY_ROWS)).toBe(true);
  });

  it('returns the same 100k row array on repeated selector calls (memo hit)', () => {
    const rowCount = 100_000;
    const rows = makeRows(rowCount);
    const table = makeTable(rowCount);
    const store = createAppStore({
      initialState: {
        tables: { tbl_100k: { table, rows } },
        ui: { activeTableId: 'tbl_100k' },
      },
    });

    const first = selectVisibleRows(store.getState());
    expect(first).toBe(rows);
    expect(first).toHaveLength(rowCount);

    // An unrelated UI update must not invalidate the row-array reference.
    store.getState().actions.setError(createAppError('E_UNKNOWN', 'unrelated'));
    const second = selectVisibleRows(store.getState());
    expect(second).toBe(first);
    expect(selectCurrentTable(store.getState())?.rows).toBe(first);

    // Warm calls stay allocation-free and keep the same reference.
    for (let index = 0; index < 1_000; index += 1) {
      expect(selectVisibleRows(store.getState())).toBe(first);
    }

    expect(selectDirtyTables(store.getState())).toBe(store.getState().ui.dirtyTables);
  });
});
