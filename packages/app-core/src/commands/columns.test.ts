import { describe, expect, it } from 'vitest';

import type { ChartSpec, ColumnDef, Row, TableMeta, TableStyle, ViewDef } from '@curve/domain';
import { createEmptyManifest } from '@curve/persistence';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import {
  createColumnAddCommand,
  createColumnDeleteCommand,
  createColumnReorderCommand,
  createColumnUpdateCommand,
} from './columns';
import { createTableMetaUpdateCommand } from './tables';

import type { AppLogger } from '../logging';
import type { AppState } from '../state/types';

const NOW = new Date('2026-10-21T00:00:00.000Z');
const logger: AppLogger = { error: () => undefined, warn: () => undefined };

function workspaceState(): AppState['workspace'] {
  const manifest = createEmptyManifest({
    name: 'Demo',
    appVersion: '0.1.0',
    now: NOW,
    uuid: () => 'ws',
  });
  return {
    formatVersion: 1,
    id: manifest.id,
    name: manifest.name,
    root: 'C:\\tmp\\Demo.cstudio',
    appVersion: manifest.appVersion,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    settings: manifest.settings,
    warnings: [],
  };
}

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Readings',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
      { id: 'col_time', key: 'time', label: 'Time', type: 'date', role: 'x' },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    ],
    primaryKey: 'col_id',
    rowCount: 2,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function makeRows(): Row[] {
  return [
    { id: 'row_1', values: ['a', 1_735_689_600_000, 21.5] },
    { id: 'row_2', values: ['b', 1_735_689_660_000, 23.1] },
  ];
}

function makeView(): ViewDef {
  return {
    id: 'viw_1',
    kind: 'table',
    refId: 'tbl_1',
    title: 'Readings',
    tableView: {
      tableId: 'tbl_1',
      styleId: 'builtin.report-light',
      columnOrder: ['col_id', 'col_time', 'col_value'],
      widths: { col_time: 160, col_value: 120 },
      hiddenColumnIds: ['col_time'],
      sort: [{ columnId: 'col_time', direction: 'asc' }],
      filter: {
        kind: 'all',
        children: [
          { kind: 'compare', columnId: 'col_time', op: 'gt', value: 0 },
          { kind: 'compare', columnId: 'col_value', op: 'lt', value: 100 },
        ],
      },
      frozenColumnCount: 2,
    },
  };
}

function makeChart(): ChartSpec {
  return {
    id: 'cht_1',
    title: 'Chart',
    kind: 'line',
    tableId: 'tbl_1',
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_value'] },
    sort: [],
    options: {
      smooth: false,
      showSymbol: true,
      lineWidth: 2,
      paletteId: 'default',
      background: 'auto',
      showGrid: true,
      legend: 'top',
      yStartAtZero: false,
      numberDigits: 1,
      sampling: { enabled: true, threshold: 2000, target: 1000 },
    },
    version: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function makeStyle(): TableStyle {
  return {
    id: 'sty_1',
    name: 'Finance',
    builtin: false,
    tokens: {
      density: 'normal',
      fontFamily: 'system-ui',
      fontSize: 12,
      header: {
        background: '#ffffff',
        foreground: '#000000',
        bold: true,
        borderColor: '#cccccc',
      },
      body: {
        background: '#ffffff',
        alternateBackground: '#eeeeee',
        foreground: '#000000',
        borderColor: '#cccccc',
        grid: 'all',
      },
      selection: { background: '#dddddd', foreground: '#000000' },
      radius: 4,
      cellPaddingX: 8,
      cellPaddingY: 4,
      zebra: false,
    },
    columnOverrides: { col_time: { label: 'Time override' } },
    conditionalRules: [
      {
        id: 'rule_1',
        enabled: true,
        target: { kind: 'cell', columnId: 'col_time' },
        when: { kind: 'compare', columnId: 'col_time', op: 'gt', value: 0 },
        style: { background: '#ff0000' },
      },
    ],
  };
}

function setup(overrides: { table?: TableMeta; rows?: Row[] } = {}) {
  const store = createAppStore({
    initialState: {
      workspace: workspaceState(),
      tables: {
        tbl_1: { table: overrides.table ?? makeTable(), rows: overrides.rows ?? makeRows() },
      },
      views: { viw_1: makeView() },
      charts: { cht_1: makeChart() },
      tableStyles: { sty_1: makeStyle() },
      layout: { type: 'pane', viewIds: ['viw_1'], activeViewId: 'viw_1' },
      ui: { activeTableId: 'tbl_1', activeViewId: 'viw_1' },
    },
  });
  const bus = createCommandBus(store, { logger });
  bus.register(createColumnAddCommand({ now: () => NOW }));
  bus.register(createColumnUpdateCommand({ now: () => NOW }));
  bus.register(createColumnDeleteCommand({ now: () => NOW }));
  bus.register(createColumnReorderCommand({ now: () => NOW }));
  bus.register(createTableMetaUpdateCommand({ now: () => NOW }));
  return { store, bus };
}

function column(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: 'col_note',
    key: 'note',
    label: 'Note',
    type: 'text',
    role: 'none',
    ...overrides,
  };
}

describe('table.column.add', () => {
  it('adds a column, appends null values and inserts it into every table view', () => {
    const { store, bus } = setup();
    const outcome = bus.dispatch('table.column.add', {
      tableId: 'tbl_1',
      column: column(),
      index: 1,
    });

    expect(outcome.ok).toBe(true);
    const state = store.getState();
    const data = state.tables['tbl_1'];
    expect(data?.table.columns.map((entry) => entry.id)).toEqual([
      'col_id',
      'col_note',
      'col_time',
      'col_value',
    ]);
    expect(data?.rows.map((row) => row.values)).toEqual([
      ['a', null, 1_735_689_600_000, 21.5],
      ['b', null, 1_735_689_660_000, 23.1],
    ]);
    expect(state.views['viw_1']?.tableView?.columnOrder).toEqual([
      'col_id',
      'col_note',
      'col_time',
      'col_value',
    ]);
    expect(data?.table.updatedAt).toBe(NOW.toISOString());
    expect(state.workspace?.updatedAt).toBe(NOW.toISOString());
  });

  it('appends at the end by default', () => {
    const { store, bus } = setup();
    expect(bus.dispatch('table.column.add', { tableId: 'tbl_1', column: column() }).ok).toBe(true);

    expect(store.getState().views['viw_1']?.tableView?.columnOrder.at(-1)).toBe('col_note');
  });

  it('rejects a duplicate key and an unknown table without changing state', () => {
    const { store, bus } = setup();
    const before = store.getState();

    expect(
      bus.dispatch('table.column.add', {
        tableId: 'tbl_1',
        column: column({ key: 'value' }),
      }).ok,
    ).toBe(false);
    expect(
      bus.dispatch('table.column.add', {
        tableId: 'tbl_missing',
        column: column(),
      }).ok,
    ).toBe(false);
    expect(store.getState().tables).toBe(before.tables);
    expect(store.getState().views).toBe(before.views);
  });
});

describe('table.column.delete', () => {
  it('removes values and cleans columnOrder/widths/hidden/sort/filter/frozen state', () => {
    const { store, bus } = setup();
    const beforeChart = store.getState().charts['cht_1'];
    const beforeStyles = store.getState().tableStyles;

    const outcome = bus.dispatch('table.column.delete', {
      tableId: 'tbl_1',
      columnId: 'col_time',
    });

    expect(outcome.ok).toBe(true);
    const state = store.getState();
    const data = state.tables['tbl_1'];
    expect(data?.table.columns.map((entry) => entry.id)).toEqual(['col_id', 'col_value']);
    expect(data?.rows.map((row) => row.values)).toEqual([
      ['a', 21.5],
      ['b', 23.1],
    ]);
    const view = state.views['viw_1']?.tableView;
    expect(view?.columnOrder).toEqual(['col_id', 'col_value']);
    expect(view?.widths).toEqual({ col_value: 120 });
    expect(view?.hiddenColumnIds).toEqual([]);
    expect(view?.sort).toEqual([]);
    expect(view?.filter).toEqual({
      kind: 'all',
      children: [{ kind: 'compare', columnId: 'col_value', op: 'lt', value: 100 }],
    });
    expect(view?.frozenColumnCount).toBe(1);
    // Charts and styles keep their references and enter the invalid state later.
    expect(state.charts['cht_1']).toEqual(beforeChart);
    expect(state.tableStyles).toBe(beforeStyles);
    expect(state.tableStyles['sty_1']?.columnOverrides['col_time']).toEqual({
      label: 'Time override',
    });
  });

  it('refuses to delete the primary key', () => {
    const { store, bus } = setup();
    const before = store.getState();

    const outcome = bus.dispatch('table.column.delete', {
      tableId: 'tbl_1',
      columnId: 'col_id',
    });

    expect(outcome.ok).toBe(false);
    expect(store.getState().tables).toBe(before.tables);
    expect(store.getState().views).toBe(before.views);
  });
});

describe('table.column.update', () => {
  it('converts row values with the new column type in one command', () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_value', key: 'value', label: 'Value', type: 'text', role: 'y' },
      ],
    });
    const { store, bus } = setup({
      table,
      rows: [
        { id: 'row_1', values: ['a', '1,234.5'] },
        { id: 'row_2', values: ['b', ''] },
      ],
    });

    const outcome = bus.dispatch('table.column.update', {
      tableId: 'tbl_1',
      column: { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    });

    expect(outcome.ok).toBe(true);
    const data = store.getState().tables['tbl_1'];
    expect(data?.table.columns[1]?.type).toBe('number');
    expect(data?.rows.map((row) => row.values[1])).toEqual([1234.5, null]);
    expect(data?.table.updatedAt).toBe(NOW.toISOString());
  });

  it('leaves the document untouched when a conversion fails', () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_value', key: 'value', label: 'Value', type: 'text', role: 'y' },
      ],
    });
    const { store, bus } = setup({
      table,
      rows: [{ id: 'row_1', values: ['a', 'not a number'] }],
    });
    const before = store.getState();

    const outcome = bus.dispatch('table.column.update', {
      tableId: 'tbl_1',
      column: { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_TYPE');
    }
    expect(store.getState().tables).toBe(before.tables);
  });

  it('updates metadata without touching view state', () => {
    const { store, bus } = setup();
    const beforeView = store.getState().views['viw_1'];

    const outcome = bus.dispatch('table.column.update', {
      tableId: 'tbl_1',
      column: { id: 'col_time', key: 'time', label: 'Timestamp', type: 'date', role: 'x' },
    });

    expect(outcome.ok).toBe(true);
    expect(store.getState().tables['tbl_1']?.table.columns[1]?.label).toBe('Timestamp');
    expect(store.getState().views['viw_1']).toBe(beforeView);
  });
});

describe('table.column.reorder', () => {
  it('reorders the schema, rows and every view without dropping hidden/sort state', () => {
    const { store, bus } = setup();

    const outcome = bus.dispatch('table.column.reorder', {
      tableId: 'tbl_1',
      columnIds: ['col_value', 'col_id', 'col_time'],
    });

    expect(outcome.ok).toBe(true);
    const state = store.getState();
    const data = state.tables['tbl_1'];
    expect(data?.table.columns.map((entry) => entry.id)).toEqual([
      'col_value',
      'col_id',
      'col_time',
    ]);
    expect(data?.rows[0]?.values).toEqual([21.5, 'a', 1_735_689_600_000]);
    expect(state.views['viw_1']?.tableView?.columnOrder).toEqual([
      'col_value',
      'col_id',
      'col_time',
    ]);
    expect(state.views['viw_1']?.tableView?.hiddenColumnIds).toEqual(['col_time']);
    expect(state.views['viw_1']?.tableView?.sort).toEqual([
      { columnId: 'col_time', direction: 'asc' },
    ]);
  });

  it('rejects a non-permutation', () => {
    const { store, bus } = setup();
    const before = store.getState();

    expect(
      bus.dispatch('table.column.reorder', {
        tableId: 'tbl_1',
        columnIds: ['col_id', 'col_time'],
      }).ok,
    ).toBe(false);
    expect(store.getState().tables).toBe(before.tables);
  });
});

describe('table.meta.update primary key', () => {
  it('promotes a text column, marks it required and keeps rows unchanged', () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_code', key: 'code', label: 'Code', type: 'text', role: 'none' },
      ],
    });
    const { store, bus } = setup({
      table,
      rows: [
        { id: 'row_1', values: ['a', 'x'] },
        { id: 'row_2', values: ['b', 'y'] },
      ],
    });

    const outcome = bus.dispatch('table.meta.update', {
      tableId: 'tbl_1',
      primaryKey: 'col_code',
    });

    expect(outcome.ok).toBe(true);
    const state = store.getState();
    expect(state.tables['tbl_1']?.table.primaryKey).toBe('col_code');
    expect(state.tables['tbl_1']?.table.columns[1]?.required).toBe(true);
    expect(state.tables['tbl_1']?.rows.map((row) => row.values)).toEqual([
      ['a', 'x'],
      ['b', 'y'],
    ]);
    expect(state.workspace?.updatedAt).toBe(NOW.toISOString());
  });

  it('rejects duplicate or blank primary-key values without changing state', () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_code', key: 'code', label: 'Code', type: 'text', role: 'none' },
      ],
    });
    const { store, bus } = setup({
      table,
      rows: [
        { id: 'row_1', values: ['a', 'dup'] },
        { id: 'row_2', values: ['b', 'dup'] },
      ],
    });
    const before = store.getState();

    const outcome = bus.dispatch('table.meta.update', {
      tableId: 'tbl_1',
      primaryKey: 'col_code',
    });

    expect(outcome.ok).toBe(false);
    expect(store.getState().tables).toBe(before.tables);
  });

  it('still renames the table and its table views', () => {
    const { store, bus } = setup();

    expect(bus.dispatch('table.meta.update', { tableId: 'tbl_1', name: 'Renamed' }).ok).toBe(true);
    expect(store.getState().tables['tbl_1']?.table.name).toBe('Renamed');
    expect(store.getState().views['viw_1']?.title).toBe('Renamed');
  });
});
