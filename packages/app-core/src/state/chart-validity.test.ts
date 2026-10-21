import { describe, expect, it } from 'vitest';

import type { ChartSpec, TableMeta } from '@curve/domain';

import {
  chartReferencesColumn,
  findMissingChartColumns,
  listChartColumnReferences,
} from './chart-validity';

const TIMESTAMP = '2026-10-20T05:00:00.000Z';

function makeTable(): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Readings',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' },
      { id: 'col_time', key: 'time', label: 'Time', type: 'date', role: 'x' },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
      { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' },
    ],
    primaryKey: 'col_id',
    rowCount: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function makeChart(overrides: Partial<ChartSpec> = {}): ChartSpec {
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
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

describe('chart column references', () => {
  it('lists wide mapping references', () => {
    expect(listChartColumnReferences(makeChart())).toEqual([
      { columnId: 'col_time', role: 'x' },
      { columnId: 'col_value', role: 'y' },
    ]);
  });

  it('lists long mapping, sort and filter references', () => {
    const chart = makeChart({
      mapping: {
        layout: 'long',
        xColumnId: 'col_time',
        seriesColumnId: 'col_site',
        yColumnId: 'col_value',
      },
      sort: [{ columnId: 'col_time', direction: 'asc' }],
      filter: {
        kind: 'all',
        children: [
          { kind: 'compare', columnId: 'col_value', op: 'gt', value: 0 },
          { kind: 'compare', columnId: 'col_site', op: 'eq', value: 'north' },
        ],
      },
    });

    expect(listChartColumnReferences(chart).map((reference) => reference.role)).toEqual([
      'x',
      'series',
      'y',
      'sort',
      'filter',
      'filter',
    ]);
  });

  it('reports missing columns once each', () => {
    const table = makeTable();
    const chart = makeChart({
      mapping: { layout: 'wide', xColumnId: 'col_gone', yColumnIds: ['col_value', 'col_gone'] },
      sort: [{ columnId: 'col_value', direction: 'asc' }],
    });

    expect(findMissingChartColumns(chart, table)).toEqual(['col_gone']);
    expect(findMissingChartColumns(chart, undefined)).toEqual([]);
    expect(chartReferencesColumn(chart, 'col_gone')).toBe(true);
    expect(chartReferencesColumn(chart, 'col_value')).toBe(true);
    expect(chartReferencesColumn(chart, 'col_site')).toBe(false);
  });

  it('returns no missing columns for a fully mapped chart', () => {
    expect(findMissingChartColumns(makeChart(), makeTable())).toEqual([]);
  });
});
