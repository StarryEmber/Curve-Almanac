import { applyPatches } from 'immer';
import { describe, expect, it, vi } from 'vitest';

import type { ColumnDef, Row, TableMeta, ViewDef, WorkspaceManifest } from '@curve/domain';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import { createImportCommand } from './import';

import type { AppLogger } from '../logging';
import type { WorkspaceInfo } from '../state/types';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';
const NOW = '2026-01-01T12:00:00.000Z';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

const TABLE: TableMeta = {
  id: 'tbl_import',
  name: 'Import',
  file: 'tables/tbl_import.jsonl',
  schemaVersion: 1,
  columns: [
    column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true }),
    column({ id: 'col_name', key: 'name', label: 'Name', type: 'text' }),
    column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number' }),
  ],
  primaryKey: 'col_id',
  rowCount: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const ROWS: Row[] = [{ id: 'row_old', values: ['old', 'Old', 1] }];

const VIEW: ViewDef = {
  id: 'viw_import',
  kind: 'table',
  refId: 'tbl_import',
  title: 'Import',
  tableView: {
    tableId: 'tbl_import',
    styleId: 'builtin.report-light',
    columnOrder: ['col_id', 'col_name', 'col_amount'],
    widths: {},
    hiddenColumnIds: [],
    sort: [],
    frozenColumnCount: 0,
  },
};

const WORKSPACE: WorkspaceInfo = {
  formatVersion: 1,
  id: 'ws_import',
  name: 'Import',
  root: 'C:\\tmp\\Import.cstudio',
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

function imported(values: unknown[], id = 'row_new'): Row {
  return { id, values: values as Row['values'] };
}

function setup(): {
  store: ReturnType<typeof createAppStore>;
  bus: ReturnType<typeof createCommandBus>;
  logger: AppLogger;
} {
  const store = createAppStore({
    initialState: {
      workspace: WORKSPACE,
      tables: { tbl_import: { table: TABLE, rows: ROWS } },
      views: { viw_import: VIEW },
      ui: { activeTableId: 'tbl_import', activeViewId: 'viw_import' },
    },
  });
  const logger: AppLogger = { error: vi.fn(), warn: vi.fn() };
  const bus = createCommandBus(store, { logger });
  bus.register(createImportCommand({ now: () => new Date(NOW) }));
  return { store, bus, logger };
}

describe('table.import', () => {
  it('appends typed rows and records one reversible patch set', () => {
    const { store, bus, logger } = setup();
    const before = store.getState();
    const outcome = bus.dispatch('table.import', {
      tableId: TABLE.id,
      mode: 'append',
      rows: [imported(['a', 'A', 2]), imported(['b', 'B', 3], 'row_b')],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const after = store.getState();
    const data = after.tables['tbl_import'];
    expect(data?.rows).toHaveLength(3);
    expect(data?.rows[0]).toBe(ROWS[0]);
    expect(data?.rows[1]).toEqual({ id: 'row_new', values: ['a', 'A', 2] });
    expect(data?.table.rowCount).toBe(3);
    expect(data?.table.updatedAt).toBe(NOW);
    expect(after.workspace?.updatedAt).toBe(NOW);
    expect(after.ui.dirtyTables.map((entry) => entry.tableId)).toEqual(['tbl_import']);
    expect(logger.error).not.toHaveBeenCalled();

    const restored = applyPatches(after, outcome.result.inversePatches);
    expect(restored.tables).toEqual(before.tables);
    expect(restored.workspace).toEqual(before.workspace);
  });

  it('replaces all rows and does not pad the removed rows', () => {
    const { store, bus } = setup();
    const outcome = bus.dispatch('table.import', {
      tableId: TABLE.id,
      mode: 'replace',
      rows: [imported(['a', 'A', 2]), imported(['b', 'B', 3], 'row_b')],
    });

    expect(outcome.ok).toBe(true);
    const rows = store.getState().tables['tbl_import']?.rows;
    expect(rows?.map((row) => row.id)).toEqual(['row_new', 'row_b']);
    expect(store.getState().tables['tbl_import']?.table.rowCount).toBe(2);
  });

  it('adds optional columns, pads existing rows and updates every table view order', () => {
    const { store, bus } = setup();
    const extra = column({ id: 'col_extra', key: 'extra', label: 'Extra', type: 'text' });
    const outcome = bus.dispatch('table.import', {
      tableId: TABLE.id,
      mode: 'append',
      rows: [imported(['a', 'A', 2, 'x'])],
      newColumns: [extra],
    });

    expect(outcome.ok).toBe(true);
    const data = store.getState().tables['tbl_import'];
    expect(data?.table.columns.map((column) => column.id)).toEqual([
      'col_id',
      'col_name',
      'col_amount',
      'col_extra',
    ]);
    expect(data?.rows[0]?.values).toEqual(['old', 'Old', 1, '']);
    expect(data?.rows[1]?.values).toEqual(['a', 'A', 2, 'x']);
    expect(store.getState().views['viw_import']?.tableView?.columnOrder).toEqual([
      'col_id',
      'col_name',
      'col_amount',
      'col_extra',
    ]);
  });

  it('generates a blank primary key from the new row id', () => {
    const { store, bus } = setup();
    const outcome = bus.dispatch('table.import', {
      tableId: TABLE.id,
      mode: 'append',
      rows: [imported(['', 'A', 2])],
    });

    expect(outcome.ok).toBe(true);
    expect(store.getState().tables['tbl_import']?.rows[1]?.values[0]).toBe('row_new');
  });

  it('rejects duplicate keys, bad shapes, required new columns and over-cap counts atomically', () => {
    const { store, bus } = setup();
    const cases: Array<{ payload: unknown; code: string }> = [
      {
        payload: {
          tableId: TABLE.id,
          mode: 'append',
          rows: [imported(['old', 'Duplicate', 1])],
        },
        code: 'E_DUPLICATE_KEY',
      },
      {
        payload: {
          tableId: TABLE.id,
          mode: 'append',
          rows: [{ id: 'row_bad', values: ['a', 'A'] }],
        },
        code: 'E_VALIDATION',
      },
      {
        payload: {
          tableId: TABLE.id,
          mode: 'append',
          rows: [imported(['a', 'A', 2, 'x'])],
          newColumns: [
            column({ id: 'col_extra', key: 'extra', label: 'Extra', type: 'text', required: true }),
          ],
        },
        code: 'E_VALIDATION',
      },
      {
        payload: { tableId: TABLE.id, mode: 'replace', rows: [] },
        code: 'E_VALIDATION',
      },
    ];

    for (const entry of cases) {
      const before = store.getState();
      const outcome = bus.dispatch('table.import', entry.payload);
      expect(outcome).toMatchObject({ ok: false, error: { code: entry.code } });
      expect(store.getState().tables).toBe(before.tables);
    }
  });

  it('rejects a final row count above the 200k cap', () => {
    const { store, bus } = setup();
    const oneColumn = column({ id: 'col_id', key: 'id', label: 'ID', type: 'text' });
    const table = { ...TABLE, columns: [oneColumn], primaryKey: 'col_id', rowCount: 200_000 };
    const rows = Array.from({ length: 200_000 }, (_, index) => ({
      id: `row_${String(index)}`,
      values: [`id${String(index)}`],
    }));
    store.setState({ tables: { tbl_import: { table, rows } } });

    const outcome = bus.dispatch('table.import', {
      tableId: TABLE.id,
      mode: 'append',
      rows: [{ id: 'row_new', values: ['new'] }],
    });

    expect(outcome).toMatchObject({ ok: false, error: { code: 'E_TABLE_LIMIT' } });
    expect(store.getState().tables['tbl_import']?.rows).toHaveLength(200_000);
  });

  it('rejects an import into a table that does not exist', () => {
    const { bus } = setup();
    const outcome = bus.dispatch('table.import', {
      tableId: 'tbl_missing',
      mode: 'append',
      rows: [imported(['a', 'A', 2])],
    });

    expect(outcome).toMatchObject({ ok: false, error: { code: 'E_TABLE_NOT_FOUND' } });
  });
});

// Keep the manifest type referenced so the fixture above stays in sync with the
// schema if the manifest shape changes.
const manifestTypeProbe: WorkspaceManifest | null = null;
void manifestTypeProbe;
