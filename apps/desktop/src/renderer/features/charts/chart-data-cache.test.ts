import { describe, expect, it } from 'vitest';

import type { ResolvedChartData } from '@curve/chart-model';
import type { ChartOptions, ChartSpec, ColumnDef, Row, TableMeta } from '@curve/domain';

import {
  CHART_DATA_CACHE_CAPACITY,
  chartDataKey,
  createChartDataCache,
  hasCachedChartData,
  resolveChartDataCached,
} from './chart-data-cache';

const ISO = '2026-01-01T00:00:00.000Z';

const COLUMNS: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_time', key: 'time', label: 'Time', type: 'number', role: 'x' },
  { id: 'col_a', key: 'a', label: 'Sensor A', type: 'number', role: 'y' },
  { id: 'col_b', key: 'b', label: 'Sensor B', type: 'number', role: 'y' },
];

const TABLE: TableMeta = {
  id: 'tbl_cache',
  name: 'Cache',
  file: 'tables/tbl_cache.jsonl',
  schemaVersion: 1,
  columns: COLUMNS,
  primaryKey: 'col_id',
  rowCount: 3,
  createdAt: ISO,
  updatedAt: ISO,
};

const ROWS: Row[] = [
  { id: 'row_1', values: ['r1', 1, 10, 100] },
  { id: 'row_2', values: ['r2', 2, 20, 200] },
  { id: 'row_3', values: ['r3', 3, 30, 300] },
];

const OPTIONS: ChartOptions = {
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
    id: 'cht_cache',
    title: 'Cache chart',
    kind: 'line',
    tableId: TABLE.id,
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
    sort: [],
    options: OPTIONS,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

function dataOf(result: ReturnType<typeof resolveChartDataCached>): ResolvedChartData {
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join('; '));
  }
  return result.data;
}

describe('createChartDataCache', () => {
  it('starts empty and reports its size', () => {
    const cache = createChartDataCache();
    expect(cache.size).toBe(0);
    expect(cache.get('missing', ROWS)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used snapshot at capacity', () => {
    const cache = createChartDataCache(2);
    const first = dataOf(resolveChartDataCached(cache, TABLE, ROWS, makeChart()));
    const second = dataOf(
      resolveChartDataCached(
        cache,
        TABLE,
        ROWS,
        makeChart({ sort: [{ columnId: 'col_a', direction: 'desc' }] }),
      ),
    );
    const keyFirst = chartDataKey(TABLE, ROWS, makeChart());
    const keySecond = chartDataKey(
      TABLE,
      ROWS,
      makeChart({ sort: [{ columnId: 'col_a', direction: 'desc' }] }),
    );
    expect(cache.size).toBe(2);
    // Touch both so the second becomes the least recently used entry.
    expect(cache.get(keySecond, ROWS)).toBe(second);
    expect(cache.get(keyFirst, ROWS)).toBe(first);
    const third = dataOf(
      resolveChartDataCached(
        cache,
        TABLE,
        ROWS,
        makeChart({ mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_b'] } }),
      ),
    );
    expect(cache.size).toBe(2);
    expect(cache.get(keySecond, ROWS)).toBeUndefined();
    expect(cache.get(keyFirst, ROWS)).toBe(first);
    expect(third).not.toBe(first);
    expect(CHART_DATA_CACHE_CAPACITY).toBe(2);
  });

  it('never serves a snapshot for a different row array', () => {
    const cache = createChartDataCache();
    const chart = makeChart();
    dataOf(resolveChartDataCached(cache, TABLE, ROWS, chart));
    const key = chartDataKey(TABLE, ROWS, chart);
    const edited = ROWS.map((row) => ({ ...row, values: [...row.values] }));
    expect(cache.get(key, edited)).toBeUndefined();

    const resolved = dataOf(resolveChartDataCached(cache, TABLE, edited, chart));
    expect(cache.get(key, edited)).toBe(resolved);
  });

  it('clears every entry', () => {
    const cache = createChartDataCache();
    dataOf(resolveChartDataCached(cache, TABLE, ROWS, makeChart()));
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('chartDataKey', () => {
  it('ignores presentation fields and keeps data fields', () => {
    const base = makeChart();
    const key = chartDataKey(TABLE, ROWS, base);

    const styled = makeChart({
      kind: 'bar',
      options: {
        ...OPTIONS,
        paletteId: 'vivid',
        background: 'dark',
        smooth: true,
        showSymbol: true,
        lineWidth: 5,
        legend: 'right',
        showGrid: false,
        numberDigits: 4,
        yStartAtZero: true,
        yLabel: 'Load',
        xLabel: 'Timestamp',
      },
    });
    expect(chartDataKey(TABLE, ROWS, styled)).toBe(key);
    expect(chartDataKey(TABLE, ROWS, makeChart({ title: 'Renamed' }))).toBe(key);

    expect(
      chartDataKey(TABLE, ROWS, makeChart({ sort: [{ columnId: 'col_a', direction: 'desc' }] })),
    ).not.toBe(key);
    expect(
      chartDataKey(
        TABLE,
        ROWS,
        makeChart({ filter: { kind: 'compare', columnId: 'col_a', op: 'gt', value: 10 } }),
      ),
    ).not.toBe(key);
    expect(
      chartDataKey(
        TABLE,
        ROWS,
        makeChart({
          options: { ...OPTIONS, sampling: { enabled: false, threshold: 5_000, target: 2_000 } },
        }),
      ),
    ).not.toBe(key);
    expect(chartDataKey(TABLE, ROWS, makeChart(), 'zh-CN')).not.toBe(key);
    expect(chartDataKey(TABLE, ROWS.slice(0, 2), base)).not.toBe(key);
  });

  it('changes when column metadata that reaches the model changes', () => {
    const base = makeChart();
    const renamed: TableMeta = {
      ...TABLE,
      columns: COLUMNS.map((column) =>
        column.id === 'col_a' ? { ...column, label: 'Sensor Alpha' } : column,
      ),
    };
    expect(chartDataKey(renamed, ROWS, base)).not.toBe(chartDataKey(TABLE, ROWS, base));
  });
});

describe('resolveChartDataCached', () => {
  it('reuses the resolved data for a style-only change', () => {
    const cache = createChartDataCache();
    const first = dataOf(resolveChartDataCached(cache, TABLE, ROWS, makeChart()));
    const second = dataOf(
      resolveChartDataCached(
        cache,
        TABLE,
        ROWS,
        makeChart({ kind: 'bar', options: { ...OPTIONS, paletteId: 'vivid', lineWidth: 4 } }),
      ),
    );
    expect(second).toBe(first);
    expect(second.series[0]?.values).toBe(first.series[0]?.values);
  });

  it('re-resolves after a filter, sort or row change', () => {
    const cache = createChartDataCache();
    const first = dataOf(resolveChartDataCached(cache, TABLE, ROWS, makeChart()));
    const filtered = dataOf(
      resolveChartDataCached(
        cache,
        TABLE,
        ROWS,
        makeChart({ filter: { kind: 'compare', columnId: 'col_a', op: 'gt', value: 10 } }),
      ),
    );
    expect(filtered).not.toBe(first);
    expect(filtered.x.values).toEqual([2, 3]);

    const sorted = dataOf(
      resolveChartDataCached(
        cache,
        TABLE,
        ROWS,
        makeChart({ sort: [{ columnId: 'col_a', direction: 'desc' }] }),
      ),
    );
    expect(sorted.x.values).toEqual([3, 2, 1]);
  });

  it('does not cache validation failures', () => {
    const cache = createChartDataCache();
    const broken = makeChart({
      mapping: { layout: 'wide', xColumnId: 'col_gone', yColumnIds: [] },
    });
    expect(resolveChartDataCached(cache, TABLE, ROWS, broken).ok).toBe(false);
    expect(cache.size).toBe(0);
    expect(hasCachedChartData(cache, TABLE, ROWS, broken)).toBe(false);
  });

  it('reports a hit only after a successful resolve', () => {
    const cache = createChartDataCache();
    const chart = makeChart();
    expect(hasCachedChartData(cache, TABLE, ROWS, chart)).toBe(false);
    resolveChartDataCached(cache, TABLE, ROWS, chart);
    expect(hasCachedChartData(cache, TABLE, ROWS, chart)).toBe(true);
  });
});
