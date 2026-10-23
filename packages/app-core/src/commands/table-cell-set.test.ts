import { applyPatches } from 'immer';
import { describe, expect, it, vi } from 'vitest';

import { createAppError } from '@curve/domain';
import type { Row, TableMeta } from '@curve/domain';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import { createTableCellSetCommand } from './table-cell-set';

import type { AppLogger } from '../logging';
import type { WorkspaceInfo } from '../state/types';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const NOW = '2026-01-01T12:00:00.000Z';

const TABLE: TableMeta = {
  id: 'tbl_test',
  name: 'Test',
  file: 'tables/tbl_test.jsonl',
  schemaVersion: 1,
  columns: [
    { id: 'col_id', key: 'id', label: 'Id', type: 'text', role: 'none' },
    { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y', precision: 1 },
  ],
  primaryKey: 'col_id',
  rowCount: 2,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const ROWS: Row[] = [
  { id: 'row_1', values: ['a', 1] },
  { id: 'row_2', values: ['b', 2] },
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

interface Setup {
  store: ReturnType<typeof createAppStore>;
  bus: ReturnType<typeof createCommandBus>;
  logger: AppLogger;
}

function setup(): Setup {
  const store = createAppStore({
    initialState: {
      workspace: WORKSPACE,
      tables: { tbl_test: { table: TABLE, rows: ROWS } },
      ui: { activeTableId: 'tbl_test' },
    },
  });
  const logger: AppLogger = { error: vi.fn(), warn: vi.fn() };
  const bus = createCommandBus(store, { logger });
  bus.register(createTableCellSetCommand({ now: () => new Date(NOW) }));
  return { store, bus, logger };
}

function dispatchCell(
  bus: ReturnType<typeof createCommandBus>,
  value: unknown,
  overrides: Partial<{ tableId: string; rowId: string; columnId: string }> = {},
): ReturnType<typeof bus.dispatch> {
  return bus.dispatch('table.cell.set', {
    tableId: TABLE.id,
    rowId: 'row_2',
    columnId: 'col_value',
    value,
    ...overrides,
  });
}

describe('command bus and table.cell.set', () => {
  it('registers commands, rejects duplicates and unknown names', () => {
    const { bus, store } = setup();
    expect(bus.has('table.cell.set')).toBe(true);
    expect(bus.names()).toEqual(['table.cell.set']);
    expect(() => bus.register(createTableCellSetCommand())).toThrow(/already registered/);

    const unknown = bus.dispatch('table.nope', {});
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error.code).toBe('E_VALIDATION');
    }
    expect(store.getState().ui.error?.code).toBe('E_VALIDATION');
  });

  it('coerces a numeric cell, replaces only the target row and records reversible patches', () => {
    const { store, bus, logger } = setup();
    store.getState().actions.setError(createAppError('E_UNKNOWN', 'stale error'));
    const before = store.getState();

    const outcome = dispatchCell(bus, '1,234.5');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const { patches, inversePatches, mergeKey, next } = outcome.result;
    expect(mergeKey).toBe('table.cell.set:tbl_test:row_2:col_value');
    expect(patches.length).toBeGreaterThan(0);
    // T2.7/ADR-033: the edit publishes one atomic `rows` replacement instead of
    // an element patch, so Immer never finalizes the whole 100k-row array.
    const rowsPatch = patches.find(
      (patch) => patch.path[0] === 'tables' && patch.path[2] === 'rows',
    );
    expect(rowsPatch?.path).toEqual(['tables', 'tbl_test', 'rows']);
    expect(Array.isArray(rowsPatch?.value)).toBe(true);
    expect(patches.some((patch) => patch.path.length === 2 && patch.path[0] === 'tables')).toBe(
      false,
    );

    const after = store.getState();
    const table = after.tables['tbl_test'];
    expect(table?.rows[0]).toBe(ROWS[0]);
    expect(table?.rows[1]).not.toBe(ROWS[1]);
    expect(table?.rows[1]?.values).toEqual(['b', 1234.5]);
    expect(table?.table.updatedAt).toBe(NOW);
    expect(after.workspace?.updatedAt).toBe(NOW);
    expect(after.ui.error).toBeNull();
    expect(after.ui.dirtyTables.map((entry) => entry.tableId)).toEqual(['tbl_test']);
    expect(logger.error).not.toHaveBeenCalled();

    const patched = applyPatches(before, patches);
    expect(patched.tables).toEqual(next.tables);
    expect(patched.workspace).toEqual(next.workspace);

    const restored = applyPatches(after, inversePatches);
    expect(restored.tables).toEqual(before.tables);
    expect(restored.workspace).toEqual(before.workspace);
    expect(restored.ui.dirtyTables).toEqual(after.ui.dirtyTables);
  });

  it('does not publish or mark dirty when the coerced value is unchanged', () => {
    const { store, bus } = setup();
    const before = store.getState();
    const outcome = dispatchCell(bus, 2);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.result.patches).toEqual([]);
    expect(outcome.result.inversePatches).toEqual([]);
    const after = store.getState();
    expect(after.tables).toBe(before.tables);
    expect(after.ui.dirtyTables).toEqual([]);
  });

  const failures: Array<{
    name: string;
    value: unknown;
    overrides: Partial<{ tableId: string; rowId: string; columnId: string }>;
    code: string;
  }> = [
    {
      name: 'an unknown table',
      value: 1,
      overrides: { tableId: 'tbl_missing' },
      code: 'E_TABLE_NOT_FOUND',
    },
    {
      name: 'an unknown row',
      value: 1,
      overrides: { rowId: 'row_missing' },
      code: 'E_TABLE_NOT_FOUND',
    },
    {
      name: 'an unknown column',
      value: 1,
      overrides: { columnId: 'col_missing' },
      code: 'E_VALIDATION',
    },
    { name: 'a non-numeric number', value: 'abc', overrides: {}, code: 'E_TYPE' },
    {
      name: 'an empty primary key',
      value: '',
      overrides: { columnId: 'col_id' },
      code: 'E_VALIDATION',
    },
    {
      name: 'a duplicate primary key',
      value: 'a',
      overrides: { columnId: 'col_id' },
      code: 'E_DUPLICATE_KEY',
    },
    {
      name: 'an invalid id',
      value: 1,
      overrides: { tableId: 'not-a-table' },
      code: 'E_VALIDATION',
    },
  ];

  for (const failure of failures) {
    it(`rejects ${failure.name} without changing document state`, () => {
      const { store, bus, logger } = setup();
      const before = store.getState();
      const outcome = dispatchCell(bus, failure.value, failure.overrides);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) {
        return;
      }
      expect(outcome.error.code).toBe(failure.code);
      const after = store.getState();
      expect(after.tables).toBe(before.tables);
      expect(after.workspace).toBe(before.workspace);
      expect(after.views).toBe(before.views);
      expect(after.layout).toBe(before.layout);
      expect(after.ui.error).toEqual(outcome.error);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  }

  it('rejects malformed payloads before touching state', () => {
    const { store, bus } = setup();
    const before = store.getState();
    const outcome = bus.dispatch('table.cell.set', { tableId: TABLE.id });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.error.code).toBe('E_VALIDATION');
    expect(store.getState().tables).toBe(before.tables);
    expect(store.getState().ui.error).toEqual(outcome.error);
  });
});
