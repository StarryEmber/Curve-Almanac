import { describe, expect, it } from 'vitest';

import type { ChartSpec, ColumnDef, TableMeta, ViewDef } from '@curve/domain';
import { createEmptyManifest } from '@curve/persistence';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import {
  DEFAULT_CHART_OPTIONS,
  createChartCreateCommand,
  createChartDeleteCommand,
  createChartUpdateCommand,
  createNewChartPayload,
  duplicateChartTitle,
} from './charts';

import type { AppLogger } from '../logging';
import type { AppState } from '../state/types';

const NOW = new Date('2026-10-25T00:00:00.000Z');
const LATER = new Date('2026-10-26T12:00:00.000Z');
const logger: AppLogger = { error: () => undefined, warn: () => undefined };

const COLUMNS: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_time', key: 'time', label: 'Time', type: 'number', role: 'x' },
  { id: 'col_a', key: 'a', label: 'Sensor A', type: 'number', role: 'y' },
  { id: 'col_b', key: 'b', label: 'Sensor B', type: 'number', role: 'y' },
  { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' },
  { id: 'col_flag', key: 'flag', label: 'Flag', type: 'boolean', role: 'none' },
];

const TABLE: TableMeta = {
  id: 'tbl_chart',
  name: 'Readings',
  file: 'tables/tbl_chart.jsonl',
  schemaVersion: 1,
  columns: COLUMNS,
  primaryKey: 'col_id',
  rowCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function tableView(): ViewDef {
  return {
    id: 'viw_table',
    kind: 'table',
    refId: TABLE.id,
    title: 'Readings',
    tableView: {
      tableId: TABLE.id,
      styleId: 'builtin.report-light',
      columnOrder: COLUMNS.map((column) => column.id),
      widths: {},
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: 1,
    },
  };
}

function workspaceState(): NonNullable<AppState['workspace']> {
  const manifest = createEmptyManifest({
    name: 'Chart Demo',
    appVersion: '0.1.0',
    now: NOW,
    uuid: () => 'ws',
  });
  return {
    formatVersion: 1,
    id: manifest.id,
    name: manifest.name,
    root: 'C:\\tmp\\Chart Demo.cstudio',
    appVersion: manifest.appVersion,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    settings: manifest.settings,
    warnings: [],
  };
}

function setup() {
  const store = createAppStore({
    initialState: {
      workspace: workspaceState(),
      tables: { [TABLE.id]: { table: TABLE, rows: [] } },
      views: { viw_table: tableView() },
      layout: { type: 'pane', viewIds: ['viw_table'], activeViewId: 'viw_table' },
      ui: { activeTableId: TABLE.id, activeViewId: 'viw_table' },
    },
  });
  const bus = createCommandBus(store, { logger });
  bus.register(createChartCreateCommand({ now: () => LATER }));
  bus.register(createChartUpdateCommand({ now: () => LATER }));
  bus.register(createChartDeleteCommand({ now: () => LATER }));
  return { store, bus };
}

function widePayload() {
  return createNewChartPayload({
    table: TABLE,
    title: '  Readings chart  ',
    kind: 'line',
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a', 'col_b'] },
    now: NOW,
    uuid: () => 'created',
  });
}

function chartOf(state: AppState, chartId: string): ChartSpec {
  const chart = state.charts[chartId];
  if (chart === undefined) {
    throw new Error(`chart ${chartId} is missing`);
  }
  return chart;
}

describe('createNewChartPayload', () => {
  it('builds a chart and its view with the default options', () => {
    const payload = widePayload();
    expect(payload.chart.id).toBe('cht_created');
    expect(payload.chart.title).toBe('Readings chart');
    expect(payload.chart.tableId).toBe(TABLE.id);
    expect(payload.chart.kind).toBe('line');
    expect(payload.chart.options).toEqual({
      ...DEFAULT_CHART_OPTIONS,
      sampling: { ...DEFAULT_CHART_OPTIONS.sampling },
    });
    expect(payload.chart.version).toBe(1);
    expect(payload.chart.createdAt).toBe(NOW.toISOString());
    expect(payload.view).toEqual({
      id: 'viw_created',
      kind: 'chart',
      refId: 'cht_created',
      title: 'Readings chart',
    });
  });

  it('merges option overrides and keeps sampling defaults', () => {
    const payload = createNewChartPayload({
      table: TABLE,
      title: 'Custom',
      kind: 'bar',
      mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
      options: {
        paletteId: 'vivid',
        legend: 'none',
        lineWidth: 4,
        sampling: { enabled: false, threshold: 10, target: 5 },
      },
      filter: { kind: 'compare', columnId: 'col_a', op: 'gt', value: 1 },
      sort: [{ columnId: 'col_time', direction: 'desc' }],
      now: NOW,
      uuid: () => 'custom',
    });
    expect(payload.chart.options.paletteId).toBe('vivid');
    expect(payload.chart.options.legend).toBe('none');
    expect(payload.chart.options.lineWidth).toBe(4);
    expect(payload.chart.options.showGrid).toBe(DEFAULT_CHART_OPTIONS.showGrid);
    expect(payload.chart.options.sampling).toEqual({ enabled: false, threshold: 10, target: 5 });
    expect(payload.chart.filter).toEqual({
      kind: 'compare',
      columnId: 'col_a',
      op: 'gt',
      value: 1,
    });
    expect(payload.chart.sort).toEqual([{ columnId: 'col_time', direction: 'desc' }]);
  });

  it('rejects empty and overlong titles', () => {
    const base = {
      table: TABLE,
      kind: 'line' as const,
      mapping: { layout: 'wide' as const, xColumnId: 'col_time', yColumnIds: ['col_a'] },
      now: NOW,
    };
    expect(() => createNewChartPayload({ ...base, title: '   ' })).toThrow(/title/);
    expect(() => createNewChartPayload({ ...base, title: 'x'.repeat(81) })).toThrow(/title/);
  });

  it('does not alias the caller mapping or filter', () => {
    const mapping = {
      layout: 'wide' as const,
      xColumnId: 'col_time',
      yColumnIds: ['col_a', 'col_b'],
    };
    const filter = { kind: 'compare' as const, columnId: 'col_a', op: 'gt' as const, value: 0 };
    const payload = createNewChartPayload({
      table: TABLE,
      title: 'Alias',
      kind: 'line',
      mapping,
      filter,
      sort: [{ columnId: 'col_time', direction: 'asc' }],
      now: NOW,
      uuid: () => 'alias',
    });
    mapping.yColumnIds.push('col_b');
    expect(payload.chart.mapping).toEqual({
      layout: 'wide',
      xColumnId: 'col_time',
      yColumnIds: ['col_a', 'col_b'],
    });
    if (payload.chart.filter?.kind !== 'compare') {
      throw new Error('expected a compare filter');
    }
    filter.value = 99;
    expect(payload.chart.filter.value).toBe(0);
    payload.chart.sort[0] = { columnId: 'col_id', direction: 'desc' };
    expect(payload.chart.sort).toHaveLength(1);
  });
});

describe('chart.create', () => {
  it('adds the chart, its view and the layout tab in one command', () => {
    const { store, bus } = setup();
    const payload = widePayload();
    const before = store.getState().workspace?.updatedAt;

    const outcome = bus.dispatch('chart.create', payload);
    expect(outcome.ok).toBe(true);
    const state = store.getState();
    expect(state.charts['cht_created']?.title).toBe('Readings chart');
    expect(state.views['viw_created']?.kind).toBe('chart');
    expect(state.views['viw_created']?.refId).toBe('cht_created');
    expect(state.layout).toMatchObject({ activeViewId: 'viw_created' });
    expect(state.ui.activeViewId).toBe('viw_created');
    expect(state.ui.activeTableId).toBe(TABLE.id);
    expect(state.workspace?.updatedAt).toBe(LATER.toISOString());
    expect(before).not.toBe(state.workspace?.updatedAt);
  });

  it('rejects an invalid mapping instead of persisting a broken chart', () => {
    const { store, bus } = setup();
    const invalidMappings = [
      { layout: 'wide' as const, xColumnId: 'col_time', yColumnIds: ['col_flag'] },
      { layout: 'wide' as const, xColumnId: 'col_time', yColumnIds: ['col_a', 'col_a'] },
      { layout: 'wide' as const, xColumnId: 'col_flag', yColumnIds: ['col_a'] },
      {
        layout: 'long' as const,
        xColumnId: 'col_time',
        seriesColumnId: 'col_a',
        yColumnId: 'col_b',
      },
    ];
    for (const mapping of invalidMappings) {
      const outcome = bus.dispatch('chart.create', {
        chart: { ...widePayload().chart, mapping },
        view: widePayload().view,
      });
      expect(outcome.ok).toBe(false);
    }
    expect(Object.keys(store.getState().charts)).toEqual([]);
    expect(Object.keys(store.getState().views)).toEqual(['viw_table']);
  });

  it('rejects duplicate ids, a missing table and a malformed view', () => {
    const { store, bus } = setup();
    expect(bus.dispatch('chart.create', widePayload()).ok).toBe(true);
    expect(bus.dispatch('chart.create', widePayload()).ok).toBe(false);
    expect(
      bus.dispatch('chart.create', {
        ...widePayload(),
        chart: { ...widePayload().chart, id: 'cht_other', tableId: 'tbl_missing' },
        view: { ...widePayload().view, refId: 'cht_other' },
      }).ok,
    ).toBe(false);
    expect(
      bus.dispatch('chart.create', {
        ...widePayload(),
        chart: { ...widePayload().chart, id: 'cht_second' },
        view: { ...widePayload().view, refId: 'cht_second', kind: 'table' },
      }).ok,
    ).toBe(false);
    expect(store.getState().charts['cht_second']).toBeUndefined();
  });
});

describe('chart.update', () => {
  it('replaces the definition and stamps updatedAt while keeping createdAt', () => {
    const { store, bus } = setup();
    expect(bus.dispatch('chart.create', widePayload()).ok).toBe(true);
    const created = chartOf(store.getState(), 'cht_created');
    const next: ChartSpec = {
      ...created,
      title: 'Renamed',
      kind: 'bar',
      options: { ...created.options, paletteId: 'colorblind', lineWidth: 5 },
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    expect(bus.dispatch('chart.update', { chart: next }).ok).toBe(true);
    const updated = chartOf(store.getState(), 'cht_created');
    expect(updated.title).toBe('Renamed');
    expect(updated.kind).toBe('bar');
    expect(updated.options.paletteId).toBe('colorblind');
    expect(updated.options.lineWidth).toBe(5);
    expect(updated.createdAt).toBe(NOW.toISOString());
    expect(updated.updatedAt).toBe(LATER.toISOString());
    // The chart tab mirrors the chart title in the same command.
    expect(store.getState().views['viw_created']?.title).toBe('Renamed');
  });

  it('allows repairing a chart whose mapped column was deleted', () => {
    const { store, bus } = setup();
    expect(bus.dispatch('chart.create', widePayload()).ok).toBe(true);
    const created = chartOf(store.getState(), 'cht_created');
    const deletedColumn: ChartSpec = {
      ...created,
      mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_gone', 'col_b'] },
      sort: [{ columnId: 'col_gone', direction: 'asc' }],
    };
    expect(bus.dispatch('chart.update', { chart: deletedColumn }).ok).toBe(true);
    expect(chartOf(store.getState(), 'cht_created').mapping).toEqual({
      layout: 'wide',
      xColumnId: 'col_time',
      yColumnIds: ['col_gone', 'col_b'],
    });

    const repaired: ChartSpec = {
      ...chartOf(store.getState(), 'cht_created'),
      mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
      sort: [],
    };
    expect(bus.dispatch('chart.update', { chart: repaired }).ok).toBe(true);
    expect(chartOf(store.getState(), 'cht_created').mapping).toEqual({
      layout: 'wide',
      xColumnId: 'col_time',
      yColumnIds: ['col_a'],
    });
  });

  it('rejects unknown charts, missing tables and malformed payloads', () => {
    const { store, bus } = setup();
    expect(bus.dispatch('chart.create', widePayload()).ok).toBe(true);
    const created = chartOf(store.getState(), 'cht_created');
    expect(bus.dispatch('chart.update', { chart: { ...created, id: 'cht_missing' } }).ok).toBe(
      false,
    );
    expect(bus.dispatch('chart.update', { chart: { ...created, tableId: 'tbl_missing' } }).ok).toBe(
      false,
    );
    expect(
      bus.dispatch('chart.update', {
        chart: { ...created, options: { ...created.options, lineWidth: 99 } },
      }).ok,
    ).toBe(false);
    expect(chartOf(store.getState(), 'cht_created').options.lineWidth).toBe(2);
  });
});

describe('chart.delete', () => {
  it('removes the chart and every chart view that referenced it', () => {
    const { store, bus } = setup();
    expect(bus.dispatch('chart.create', widePayload()).ok).toBe(true);
    expect(bus.dispatch('chart.create', widePayload()).ok).toBe(false);
    const state = store.getState();
    expect(state.layout).toMatchObject({ viewIds: ['viw_table', 'viw_created'] });

    expect(bus.dispatch('chart.delete', { chartId: 'cht_created' }).ok).toBe(true);
    const after = store.getState();
    expect(after.charts['cht_created']).toBeUndefined();
    expect(after.views['viw_created']).toBeUndefined();
    expect(after.views['viw_table']).toBeDefined();
    expect(after.layout).toMatchObject({ viewIds: ['viw_table'], activeViewId: 'viw_table' });
    expect(after.ui.activeViewId).toBe('viw_table');
  });

  it('rejects unknown chart ids and malformed payloads', () => {
    const { bus } = setup();
    expect(bus.dispatch('chart.delete', { chartId: 'cht_missing' }).ok).toBe(false);
    expect(bus.dispatch('chart.delete', { chartId: 'tbl_chart' }).ok).toBe(false);
  });
});

describe('duplicateChartTitle', () => {
  it('adds the next free suffix and handles existing copies', () => {
    expect(duplicateChartTitle('Sales', [])).toBe('Sales (2)');
    expect(duplicateChartTitle('Sales', ['Sales'])).toBe('Sales (2)');
    expect(duplicateChartTitle('Sales (2)', ['Sales', 'Sales (2)'])).toBe('Sales (3)');
    expect(duplicateChartTitle('   ', [])).toBe('Chart (2)');
  });
});
