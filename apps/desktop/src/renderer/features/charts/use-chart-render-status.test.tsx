// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ChartOptions, ChartSpec, ColumnDef, Row, TableMeta } from '@curve/domain';

import { CHART_DEFER_RESOLVE_ROW_THRESHOLD, useChartRenderStatus } from './use-chart-render-status';

import type { ChartRenderInput } from './chart-view-model';
import type { ChartRenderSnapshot } from './use-chart-render-status';
import type { ReactElement } from 'react';

const ISO = '2026-01-01T00:00:00.000Z';

const COLUMNS: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_time', key: 'time', label: 'Time', type: 'number', role: 'x' },
  { id: 'col_a', key: 'a', label: 'Sensor A', type: 'number', role: 'y' },
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

function makeTable(rows: number): TableMeta {
  return {
    id: 'tbl_hook',
    name: 'Hook',
    file: 'tables/tbl_hook.jsonl',
    schemaVersion: 1,
    columns: COLUMNS,
    primaryKey: 'col_id',
    rowCount: rows,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: `row_${String(index)}`,
    values: [`r${String(index)}`, index, index * 2],
  }));
}

function makeChart(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    id: 'cht_hook',
    title: 'Hook chart',
    kind: 'line',
    tableId: 'tbl_hook',
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
    sort: [],
    options: OPTIONS,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

/** Records every snapshot the hook produced, so tests can detect loading flashes. */
const probes: ChartRenderSnapshot[] = [];

function Harness({ input }: { input: ChartRenderInput }): ReactElement {
  const snapshot = useChartRenderStatus(input);
  const key = `${snapshot.status === null ? 'resolving' : snapshot.status.kind}|${String(snapshot.pending)}`;
  if (probes.at(-1) === undefined || probes.at(-1)?.status?.kind !== snapshot.status?.kind) {
    probes.push(snapshot);
  }
  return (
    <output
      data-testid="probe"
      data-key={key}
      data-status={snapshot.status === null ? 'resolving' : snapshot.status.kind}
      data-pending={snapshot.pending ? 'true' : 'false'}
      data-ms={String(Math.round(snapshot.resolveMs))}
    />
  );
}

function probe(): HTMLElement {
  return screen.getByTestId('probe');
}

function mount(input: ChartRenderInput): ReturnType<typeof render> {
  return render(<Harness input={input} />);
}

function rerender(view: ReturnType<typeof render>, input: ChartRenderInput): void {
  view.rerender(<Harness input={input} />);
}

const SMALL_TABLE = makeTable(3);
const SMALL_ROWS = makeRows(3);
const BIG_TABLE = makeTable(CHART_DEFER_RESOLVE_ROW_THRESHOLD + 1);
const BIG_ROWS = makeRows(CHART_DEFER_RESOLVE_ROW_THRESHOLD + 1);

afterEach(() => {
  cleanup();
  probes.length = 0;
});

describe('useChartRenderStatus', () => {
  it('resolves a small table synchronously and exposes the resolve timing', () => {
    mount({ chart: makeChart(), table: SMALL_TABLE, rows: SMALL_ROWS, locale: 'zh-CN' });
    expect(probe().getAttribute('data-status')).toBe('ready');
    expect(probe().getAttribute('data-pending')).toBe('false');
    expect(Number(probe().getAttribute('data-ms'))).toBeGreaterThanOrEqual(0);
    expect(probes).toHaveLength(1);
  });

  it('shows a resolving state for a big table, then the ready model', async () => {
    mount({ chart: makeChart(), table: BIG_TABLE, rows: BIG_ROWS });
    expect(probe().getAttribute('data-status')).toBe('resolving');
    expect(probe().getAttribute('data-pending')).toBe('true');

    await waitFor(() => {
      expect(probe().getAttribute('data-status')).toBe('ready');
    });
    expect(probe().getAttribute('data-pending')).toBe('false');
    expect(Number(probe().getAttribute('data-ms'))).toBeGreaterThanOrEqual(0);
    expect(
      probes.map((entry) => (entry.status === null ? 'resolving' : entry.status.kind)),
    ).toEqual(['resolving', 'ready']);
  });

  it('never flashes the resolving state for a style-only change (cache hit)', async () => {
    const view = mount({ chart: makeChart(), table: BIG_TABLE, rows: BIG_ROWS });
    await waitFor(() => {
      expect(probe().getAttribute('data-status')).toBe('ready');
    });
    probes.length = 0;

    rerender(view, {
      chart: makeChart({
        kind: 'bar',
        options: { ...OPTIONS, paletteId: 'vivid', lineWidth: 4, yLabel: 'Load' },
      }),
      table: BIG_TABLE,
      rows: BIG_ROWS,
    });

    expect(probe().getAttribute('data-status')).toBe('ready');
    expect(probe().getAttribute('data-pending')).toBe('false');
    expect(probes.some((entry) => entry.status === null)).toBe(false);
  });

  it('defers again when the rows change (cache miss)', async () => {
    const view = mount({ chart: makeChart(), table: BIG_TABLE, rows: BIG_ROWS });
    await waitFor(() => {
      expect(probe().getAttribute('data-status')).toBe('ready');
    });

    const edited = BIG_ROWS.map((row, index) =>
      index === 0 ? { ...row, values: [...row.values] } : row,
    );
    rerender(view, { chart: makeChart(), table: BIG_TABLE, rows: edited });
    expect(probe().getAttribute('data-pending')).toBe('true');
    await waitFor(() => {
      expect(probe().getAttribute('data-pending')).toBe('false');
    });
    expect(probe().getAttribute('data-status')).toBe('ready');
  });

  it('keeps missing chart/table states synchronous', () => {
    mount({ chart: undefined, table: BIG_TABLE, rows: BIG_ROWS });
    expect(probe().getAttribute('data-status')).toBe('missing-chart');
    expect(probe().getAttribute('data-pending')).toBe('false');

    cleanup();
    probes.length = 0;
    mount({ chart: makeChart(), table: undefined, rows: BIG_ROWS });
    expect(probe().getAttribute('data-status')).toBe('missing-table');
    expect(probe().getAttribute('data-pending')).toBe('false');
  });

  it('cancels a pending resolve when the input changes again', async () => {
    const view = mount({ chart: makeChart(), table: BIG_TABLE, rows: BIG_ROWS });
    expect(probe().getAttribute('data-status')).toBe('resolving');

    rerender(view, { chart: makeChart(), table: SMALL_TABLE, rows: SMALL_ROWS });
    await act(async () => {
      await Promise.resolve();
    });
    expect(probe().getAttribute('data-status')).toBe('ready');

    // The cancelled big-table resolve must not overwrite the small model later.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(probe().getAttribute('data-status')).toBe('ready');
    expect(probe().getAttribute('data-pending')).toBe('false');
  });
});
