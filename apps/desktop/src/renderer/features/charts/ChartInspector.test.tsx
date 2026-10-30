// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AppCore } from '@curve/app-core';
import type { ChartSpec, ColumnDef, TableMeta } from '@curve/domain';

import { AppCoreProvider } from '../../app-core/use-app-core';
import { I18nProvider } from '../../i18n';
import { activateRendererPlugins } from '../../plugins';

import { ChartInspector } from './ChartInspector';

import type { RendererCore } from '../../app-core/renderer-core';

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
  rowCount: 3,
  createdAt: ISO,
  updatedAt: ISO,
};

function makeChart(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    id: 'cht_test',
    title: 'Readings chart',
    kind: 'line',
    tableId: TABLE.id,
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
    sort: [],
    options: {
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
    },
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

interface Harness {
  updateChart: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
}

function mount(chart: ChartSpec): Harness {
  const updateChart = vi.fn(async () => ({ ok: true as const, data: undefined }));
  const setError = vi.fn();
  const appCore = {
    actions: { updateChart },
    store: { getState: () => ({ actions: { setError } }) },
  } as unknown as AppCore;
  const core = {
    core: appCore,
    tableIo: { terminate: vi.fn() },
    query: { terminate: vi.fn() },
  } as unknown as RendererCore;
  render(
    <AppCoreProvider core={core}>
      <I18nProvider initialLocale="zh-CN">
        <ChartInspector chart={chart} table={TABLE} rowCount={3} />
      </I18nProvider>
    </AppCoreProvider>,
  );
  return { updateChart, setError };
}

function lastCommitted(updateChart: ReturnType<typeof vi.fn>): ChartSpec {
  const calls = updateChart.mock.calls;
  const call = calls[calls.length - 1];
  if (call === undefined) {
    throw new Error('updateChart was not called');
  }
  return call[0] as ChartSpec;
}

afterEach(() => {
  cleanup();
});

beforeAll(async () => {
  // T6.3: the kind selector reads the registry's builtin chart kinds.
  await activateRendererPlugins();
});

describe('ChartInspector', () => {
  it('shows the chart data source in the data tab', () => {
    mount(makeChart());
    expect(screen.getByTestId('chart-inspector-table').textContent).toBe('Readings');
    expect(screen.getByTestId('chart-inspector-rows').textContent).toBe('3 行');
    expect(screen.getByTestId('chart-filter-summary').textContent).toBe('无筛选');
  });

  it('clears a chart filter through one command', async () => {
    const chart = makeChart({
      filter: { kind: 'compare', columnId: 'col_a', op: 'gt', value: 10 },
    });
    const { updateChart } = mount(chart);
    expect(screen.getByTestId('chart-filter-summary').textContent).toBe('已配置筛选');
    fireEvent.click(screen.getByTestId('chart-filter-clear'));
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(1);
    });
    expect('filter' in lastCommitted(updateChart)).toBe(false);
  });

  it('adds sort levels', async () => {
    const { updateChart } = mount(makeChart());

    fireEvent.change(screen.getByTestId('chart-sort-add'), { target: { value: 'col_time' } });
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(1);
    });
    expect(lastCommitted(updateChart).sort).toEqual([{ columnId: 'col_time', direction: 'asc' }]);
  });

  it('flips and removes an existing sort level', async () => {
    const { updateChart } = mount(
      makeChart({
        sort: [
          { columnId: 'col_time', direction: 'asc' },
          { columnId: 'col_a', direction: 'desc' },
        ],
      }),
    );
    fireEvent.click(screen.getByTestId('chart-sort-direction-0'));
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(1);
    });
    expect(lastCommitted(updateChart).sort[0]).toEqual({
      columnId: 'col_time',
      direction: 'desc',
    });

    fireEvent.click(screen.getByTestId('chart-sort-remove-1'));
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(2);
    });
    expect(lastCommitted(updateChart).sort).toEqual([{ columnId: 'col_time', direction: 'asc' }]);
  });

  it('changes the mapping through the shared mapping editor', async () => {
    const { updateChart } = mount(makeChart());
    fireEvent.click(screen.getByRole('tab', { name: '映射' }));
    fireEvent.change(screen.getByTestId('chart-mapping-x'), { target: { value: 'col_id' } });
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(1);
    });
    expect(lastCommitted(updateChart).mapping).toEqual({
      layout: 'wide',
      xColumnId: 'col_id',
      yColumnIds: ['col_a'],
    });
  });

  it('commits appearance controls one interaction at a time', async () => {
    const { updateChart } = mount(makeChart());
    fireEvent.click(screen.getByRole('tab', { name: '外观' }));

    fireEvent.change(screen.getByTestId('chart-palette'), { target: { value: 'vivid' } });
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(1);
    });
    expect(lastCommitted(updateChart).options.paletteId).toBe('vivid');

    fireEvent.change(screen.getByTestId('chart-background'), { target: { value: 'dark' } });
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(2);
    });
    expect(lastCommitted(updateChart).options.background).toBe('dark');

    fireEvent.change(screen.getByTestId('chart-legend'), { target: { value: 'none' } });
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(3);
    });
    expect(lastCommitted(updateChart).options.legend).toBe('none');

    fireEvent.click(screen.getByTestId('chart-show-grid'));
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(4);
    });
    expect(lastCommitted(updateChart).options.showGrid).toBe(false);

    fireEvent.click(screen.getByTestId('chart-smooth'));
    fireEvent.click(screen.getByTestId('chart-show-symbol'));
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(6);
    });
    expect(lastCommitted(updateChart).options.showSymbol).toBe(true);
  });

  it('commits valid numbers on blur and rejects out-of-range values', async () => {
    const { updateChart } = mount(makeChart());
    fireEvent.click(screen.getByRole('tab', { name: '外观' }));
    const input = screen.getByTestId('chart-line-width');

    fireEvent.change(input, { target: { value: '4' } });
    expect(updateChart).not.toHaveBeenCalled();
    fireEvent.blur(input);
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(1);
    });
    expect(lastCommitted(updateChart).options.lineWidth).toBe(4);

    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.blur(input);
    expect(screen.getByText('请输入 1–6 的整数。')).toBeTruthy();
    expect(updateChart).toHaveBeenCalledTimes(1);
  });

  it('commits axis labels and options', async () => {
    const { updateChart } = mount(makeChart());
    fireEvent.click(screen.getByRole('tab', { name: '坐标轴' }));

    const xLabel = screen.getByTestId('chart-x-label');
    expect(xLabel.getAttribute('placeholder')).toBe('Time');
    fireEvent.change(xLabel, { target: { value: 'Elapsed' } });
    fireEvent.blur(xLabel);
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(1);
    });
    expect(lastCommitted(updateChart).options.xLabel).toBe('Elapsed');

    const yLabel = screen.getByTestId('chart-y-label');
    fireEvent.change(yLabel, { target: { value: 'Load' } });
    fireEvent.blur(yLabel);
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(2);
    });
    expect(lastCommitted(updateChart).options.yLabel).toBe('Load');

    const digits = screen.getByTestId('chart-number-digits');
    fireEvent.change(digits, { target: { value: '0' } });
    fireEvent.blur(digits);
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(3);
    });
    expect(lastCommitted(updateChart).options.numberDigits).toBe(0);

    fireEvent.click(screen.getByTestId('chart-y-start-at-zero'));
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(4);
    });
    expect(lastCommitted(updateChart).options.yStartAtZero).toBe(true);
  });

  it('removes an optional axis label instead of storing an empty string', async () => {
    const { updateChart } = mount(
      makeChart({ options: { ...makeChart().options, xLabel: 'Old' } }),
    );
    fireEvent.click(screen.getByRole('tab', { name: '坐标轴' }));
    const xLabel = screen.getByTestId('chart-x-label');
    fireEvent.change(xLabel, { target: { value: '' } });
    fireEvent.blur(xLabel);
    await waitFor(() => {
      expect(updateChart).toHaveBeenCalledTimes(1);
    });
    expect('xLabel' in lastCommitted(updateChart).options).toBe(false);
  });

  it('opens the filter dialog from the data tab', () => {
    mount(makeChart());
    fireEvent.click(screen.getByTestId('chart-filter-edit'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('surfaces command failures through the shared error surface', async () => {
    const { updateChart, setError } = mount(makeChart());
    const error = { code: 'E_VALIDATION' as const, message: 'nope' };
    updateChart.mockResolvedValueOnce({ ok: false, error });
    fireEvent.click(screen.getByRole('tab', { name: '映射' }));
    fireEvent.change(screen.getByTestId('chart-mapping-x'), { target: { value: 'col_id' } });
    await waitFor(() => {
      expect(setError).toHaveBeenCalledWith(error);
    });
  });
});
