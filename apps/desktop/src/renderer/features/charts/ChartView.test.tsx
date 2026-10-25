// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppStore } from '@curve/app-core';
import type { AppCore } from '@curve/app-core';
import type { RenderModel } from '@curve/chart-model';
import type { ChartSpec, ColumnDef, Row, TableMeta, ViewDef } from '@curve/domain';

import { AppCoreProvider } from '../../app-core/use-app-core';
import { I18nProvider } from '../../i18n';
import { ThemeProvider } from '../../theme/ThemeProvider';

import { ChartView } from './ChartView';

import type { RendererCore } from '../../app-core/renderer-core';

vi.mock('@curve/chart-echarts', () => ({
  isEmptyModel: (model: RenderModel): boolean =>
    model.series.length === 0 || model.x.values.length === 0 || model.meta.sourcePoints === 0,
  createChartRenderer: () => ({
    state: 'idle',
    render: () => ({ ok: true, state: 'ready' }),
    update: () => ({ ok: true, state: 'ready' }),
    resize: () => undefined,
    toPNG: () => ({ ok: false, error: { code: 'E_EXPORT_FAILED', message: 'n/a' } }),
    dispose: () => undefined,
  }),
}));

const ISO = '2026-01-01T00:00:00.000Z';

const COLUMNS: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_time', key: 'time', label: 'Time', type: 'number', role: 'x' },
  { id: 'col_a', key: 'a', label: 'Sensor A', type: 'number', role: 'y' },
  { id: 'col_b', key: 'b', label: 'Sensor B', type: 'number', role: 'y' },
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
  { id: 'row_1', values: ['r1', 1, 10, 100] },
  { id: 'row_2', values: ['r2', 2, 20, 200] },
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

const VIEW: ViewDef = {
  id: 'viw_chart',
  kind: 'chart',
  refId: 'cht_test',
  title: 'Readings chart',
};

function mount(
  chart: ChartSpec,
  rows: Row[] = ROWS,
  table: TableMeta | null = TABLE,
): { updateChart: ReturnType<typeof vi.fn> } {
  const updateChart = vi.fn(async (next: ChartSpec) => {
    store.setState((state) => ({ charts: { ...state.charts, [next.id]: next } }));
    return { ok: true as const, data: undefined };
  });
  const store = createAppStore({
    initialState: {
      charts: { [chart.id]: chart },
      tables: table === null ? {} : { [table.id]: { table, rows } },
    },
  });
  const appCore = { store, actions: { updateChart } } as unknown as AppCore;
  const core = {
    core: appCore,
    tableIo: { terminate: vi.fn() },
    query: { terminate: vi.fn() },
  } as unknown as RendererCore;
  render(
    <AppCoreProvider core={core}>
      <I18nProvider initialLocale="zh-CN">
        <ThemeProvider initialMode="light">
          <ChartView view={VIEW} />
        </ThemeProvider>
      </I18nProvider>
    </AppCoreProvider>,
  );
  return { updateChart };
}

afterEach(() => {
  cleanup();
});

describe('ChartView', () => {
  it('renders the resolved RenderModel contract for a wide chart', () => {
    mount(makeChart());
    const view = screen.getByTestId('chart-view');
    expect(view.getAttribute('data-chart-state')).toBe('ready');
    expect(view.getAttribute('data-chart-kind')).toBe('line');
    expect(view.getAttribute('data-chart-layout')).toBe('wide');
    expect(view.getAttribute('data-chart-x-type')).toBe('number');
    expect(view.getAttribute('data-chart-x-label')).toBe('Time');
    expect(view.getAttribute('data-chart-series-count')).toBe('2');
    expect(view.getAttribute('data-chart-series')).toBe('Sensor A|Sensor B');
    expect(view.getAttribute('data-chart-source-points')).toBe('4');
    expect(view.getAttribute('data-chart-sampled')).toBe('false');
    expect(view.getAttribute('data-chart-legend')).toBe('top');
    expect(view.getAttribute('data-chart-show-grid')).toBe('true');
    expect(view.getAttribute('data-chart-line-width')).toBe('2');
    expect(view.getAttribute('data-chart-number-digits')).toBe('2');
    expect(screen.getByTestId('chart-title').textContent).toBe('Readings chart');
    expect(screen.getByTestId('chart-canvas')).toBeTruthy();
    expect(screen.queryByTestId('chart-sampled-badge')).toBeNull();
  });

  it('shows a sampled badge and sampled point counts', () => {
    mount(
      makeChart({
        options: { ...OPTIONS, sampling: { enabled: true, threshold: 1, target: 1 } },
      }),
    );
    const view = screen.getByTestId('chart-view');
    expect(view.getAttribute('data-chart-sampled')).toBe('true');
    expect(screen.getByTestId('chart-sampled-badge').textContent).toBe('已采样');
    expect(screen.getByTestId('chart-summary').textContent).toContain('4 → 2 点');
  });

  it('keeps model warnings visible', () => {
    mount(makeChart(), [...ROWS, { id: 'row_3', values: ['r3', null, 30, 300] }]);
    expect(screen.getByTestId('chart-view').getAttribute('data-chart-source-points')).toBe('4');
    expect(screen.getByTestId('chart-warnings').textContent).toContain('skipped');
  });

  it('reports a missing table', () => {
    mount(makeChart(), ROWS, null);
    expect(screen.getByTestId('chart-view').getAttribute('data-chart-state')).toBe('missing-table');
    expect(screen.getByTestId('chart-error').textContent).toContain('数据表已不存在');
  });

  it('offers an actionable remap for deleted columns and recovers', async () => {
    const { updateChart } = mount(
      makeChart({
        mapping: { layout: 'wide', xColumnId: 'col_gone', yColumnIds: ['col_gone'] },
      }),
    );
    const view = screen.getByTestId('chart-view');
    expect(view.getAttribute('data-chart-state')).toBe('missing-columns');
    expect(screen.getByTestId('chart-error').textContent).toContain('列已删除：col_gone');
    expect(screen.getByTestId('chart-remap')).toBeTruthy();

    fireEvent.change(screen.getByTestId('chart-remap-x'), { target: { value: 'col_time' } });
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(1);
    });
    // Still broken: the dangling Y column needs its own repair.
    expect(screen.getByTestId('chart-view').getAttribute('data-chart-state')).toBe(
      'missing-columns',
    );

    fireEvent.click(screen.getByTestId('chart-remap-y-col_gone'));
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('chart-view').getAttribute('data-chart-state')).toBe('ready');
    });
    expect(screen.getByTestId('chart-view').getAttribute('data-chart-series-count')).toBe('1');
  });
});
