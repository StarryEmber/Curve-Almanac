import { describe, expect, it } from 'vitest';

import type { ChartSpec, ColumnDef, Row, TableMeta } from '@curve/domain';

import {
  CHART_PREVIEW_TIMESTAMP,
  buildChartMapping,
  canUseChartLayout,
  chartRenderStatus,
  createPreviewChart,
} from './chart-view-model';

const ISO = '2026-01-01T00:00:00.000Z';

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
  rowCount: 2,
  createdAt: ISO,
  updatedAt: ISO,
};

const ROWS: Row[] = [
  { id: 'row_1', values: ['r1', 1, 10, 100, 'east', true] },
  { id: 'row_2', values: ['r2', 2, 20, 200, 'west', false] },
];

const OPTIONS: ChartSpec['options'] = {
  smooth: false,
  showSymbol: false,
  lineWidth: 2,
  paletteId: 'default',
  background: 'auto',
  showGrid: true,
  legend: 'top',
  yStartAtZero: false,
  numberDigits: 2,
  sampling: { enabled: true, threshold: 5_000, target: 2_000 },
};

function makeChart(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    id: 'cht_test',
    title: 'Readings chart',
    kind: 'line',
    tableId: TABLE.id,
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a', 'col_b'] },
    sort: [],
    options: OPTIONS,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

describe('buildChartMapping', () => {
  it('defaults to the first compatible columns', () => {
    expect(buildChartMapping(TABLE, 'wide')).toEqual({
      layout: 'wide',
      xColumnId: 'col_time',
      yColumnIds: ['col_a'],
    });
    expect(buildChartMapping(TABLE, 'long')).toEqual({
      layout: 'long',
      xColumnId: 'col_time',
      seriesColumnId: 'col_site',
      yColumnId: 'col_a',
    });
  });

  it('keeps compatible selections when switching layout', () => {
    const wide = buildChartMapping(TABLE, 'wide', {
      layout: 'wide',
      xColumnId: 'col_time',
      yColumnIds: ['col_a', 'col_b'],
    });
    expect(wide).toEqual({
      layout: 'wide',
      xColumnId: 'col_time',
      yColumnIds: ['col_a', 'col_b'],
    });

    const long = buildChartMapping(TABLE, 'long', wide ?? undefined);
    expect(long).toEqual({
      layout: 'long',
      xColumnId: 'col_time',
      seriesColumnId: 'col_site',
      yColumnId: 'col_a',
    });

    const back = buildChartMapping(TABLE, 'wide', long ?? undefined);
    expect(back).toEqual({ layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] });
  });

  it('falls back to the first compatible column for dangling selections', () => {
    expect(
      buildChartMapping(TABLE, 'wide', {
        layout: 'wide',
        xColumnId: 'col_gone',
        yColumnIds: ['col_gone'],
      }),
    ).toEqual({ layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] });
  });

  it('returns null when the table cannot express the layout', () => {
    const noSeries: TableMeta = {
      ...TABLE,
      columns: COLUMNS.filter((column) => column.type !== 'text'),
    };
    expect(buildChartMapping(noSeries, 'long')).toBeNull();
    expect(canUseChartLayout(noSeries, 'long')).toBe(false);
    expect(canUseChartLayout(noSeries, 'wide')).toBe(true);

    const textOnly: TableMeta = {
      ...TABLE,
      columns: COLUMNS.filter((column) => column.type !== 'number'),
    };
    expect(buildChartMapping(textOnly, 'wide')).toBeNull();
    expect(canUseChartLayout(textOnly, 'wide')).toBe(false);
  });
});

describe('chartRenderStatus', () => {
  it('reports a missing chart or table', () => {
    expect(chartRenderStatus({ chart: undefined, table: TABLE, rows: ROWS })).toEqual({
      kind: 'missing-chart',
    });
    expect(chartRenderStatus({ chart: makeChart(), table: undefined, rows: ROWS })).toEqual({
      kind: 'missing-table',
    });
  });

  it('reports deleted mapped columns before generic validation', () => {
    const chart = makeChart({
      mapping: { layout: 'wide', xColumnId: 'col_gone', yColumnIds: ['col_a'] },
    });
    expect(chartRenderStatus({ chart, table: TABLE, rows: ROWS })).toEqual({
      kind: 'missing-columns',
      columnIds: ['col_gone'],
    });
  });

  it('reports type-incompatible mappings as invalid', () => {
    const chart = makeChart({
      mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_id'] },
    });
    const status = chartRenderStatus({ chart, table: TABLE, rows: ROWS });
    expect(status.kind).toBe('invalid');
    if (status.kind !== 'invalid') {
      return;
    }
    expect(status.issues).toHaveLength(1);
    expect(status.issues[0]?.path).toBe('mapping.yColumnIds[0]');
    expect(status.issues[0]?.code).toBe('E_TYPE');
  });

  it('resolves a ready model with the y label and warnings', () => {
    const chart = makeChart({ options: { ...OPTIONS, yLabel: 'Load' } });
    const status = chartRenderStatus({ chart, table: TABLE, rows: ROWS, theme: 'dark' });
    expect(status.kind).toBe('ready');
    if (status.kind !== 'ready') {
      return;
    }
    expect(status.model.series.map((series) => series.name)).toEqual(['Sensor A', 'Sensor B']);
    expect(status.model.series[0]?.values).toEqual([10, 20]);
    expect(status.model.x.unit).toBeUndefined();
    expect(status.model.y).toEqual({ label: 'Load' });
    expect(status.model.style.background).toBe('#1e1e1e');
    expect(status.model.meta.sourcePoints).toBe(4);
  });

  it('returns a ready empty model for an empty row set', () => {
    const status = chartRenderStatus({ chart: makeChart(), table: TABLE, rows: [] });
    expect(status.kind).toBe('ready');
    if (status.kind !== 'ready') {
      return;
    }
    expect(status.model.x.values).toEqual([]);
    expect(status.model.meta.sourcePoints).toBe(0);
  });

  it('turns an unexpected resolve failure into an error status', () => {
    const exploding = new Proxy(ROWS, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          return () => {
            throw new Error('boom');
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const status = chartRenderStatus({ chart: makeChart(), table: TABLE, rows: exploding });
    expect(status).toEqual({ kind: 'error', message: 'boom' });
  });
});

describe('createPreviewChart', () => {
  it('fills ids, timestamps and default options', () => {
    const chart = createPreviewChart({
      tableId: TABLE.id,
      title: '  Preview  ',
      kind: 'bar',
      mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
    });
    expect(chart.id).toBe('cht_preview');
    expect(chart.title).toBe('Preview');
    expect(chart.kind).toBe('bar');
    expect(chart.version).toBe(1);
    expect(chart.createdAt).toBe(CHART_PREVIEW_TIMESTAMP);
    expect(chart.options.sampling).toEqual({ enabled: true, threshold: 5_000, target: 2_000 });
  });

  it('falls back to a non-empty title and applies option overrides', () => {
    const chart = createPreviewChart({
      tableId: TABLE.id,
      title: '   ',
      kind: 'line',
      mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
      options: { paletteId: 'vivid' },
    });
    expect(chart.title).toBe('Chart');
    expect(chart.options.paletteId).toBe('vivid');
  });
});
