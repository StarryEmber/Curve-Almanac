/**
 * Deferred chart resolution hook (T4.6, ADR-045).
 *
 * `chartRenderStatus` is synchronous: on a 100k-row table the filter/sort/LTTB
 * pass costs tens of milliseconds (bench: `chart.resolve-sample.100k`). Running
 * that inside the render of every mapping/layout switch freezes the inspector.
 *
 * Policy (ADR-045 §3):
 *
 * - small tables, missing chart/table and cached data resolve immediately, so
 *   the first paint and unit tests stay synchronous;
 * - a big table (> `CHART_DEFER_RESOLVE_ROW_THRESHOLD` rows) without cached data
 *   first commits `{ pending: true }` (the view renders a loading status), then
 *   resolves in a `setTimeout(0)` so the browser can paint and deliver pending
 *   input events before the main thread is busy;
 * - a style-only change is a cache hit and therefore never deferred.
 *
 * The hook owns its small data cache, so closing the view releases the
 * snapshots (ADR-045 §2).
 */

import { useEffect, useState } from 'react';

import type { ChartSpec, Row, TableMeta } from '@curve/domain';

import { createChartDataCache, hasCachedChartData } from './chart-data-cache';
import { chartRenderStatus } from './chart-view-model';

import type { ChartDataCache } from './chart-data-cache';
import type { ChartRenderInput, ChartRenderStatus } from './chart-view-model';

/**
 * Rows above this boundary resolve off the render path with a loading state.
 * Matches `QUERY_WORKER_ROW_THRESHOLD` (ADR-032): the same "main thread can
 * still absorb it, but not interactively" line.
 */
export const CHART_DEFER_RESOLVE_ROW_THRESHOLD = 20_000;

/** View-facing snapshot: `status === null` means the first resolve is running. */
export interface ChartRenderSnapshot {
  status: ChartRenderStatus | null;
  pending: boolean;
  /** Whole milliseconds of the last resolve; ≈0 on a cache hit. */
  resolveMs: number;
}

interface RenderedInput {
  chart: ChartSpec | undefined;
  table: TableMeta | undefined;
  rows: readonly Row[];
  locale: string | undefined;
  theme: 'light' | 'dark' | undefined;
}

interface InternalSnapshot extends ChartRenderSnapshot {
  /** The input that produced `status`; `null` while the first resolve is pending. */
  input: RenderedInput | null;
}

function renderedInputOf(input: ChartRenderInput): RenderedInput {
  return {
    chart: input.chart,
    table: input.table,
    rows: input.rows,
    locale: input.locale,
    theme: input.theme,
  };
}

function sameInput(left: RenderedInput | null, right: RenderedInput): boolean {
  return (
    left !== null &&
    left.chart === right.chart &&
    left.table === right.table &&
    left.rows === right.rows &&
    left.locale === right.locale &&
    left.theme === right.theme
  );
}

function resolveOptionsOf(input: ChartRenderInput): { locale?: string; theme?: 'light' | 'dark' } {
  return {
    ...(input.locale === undefined ? {} : { locale: input.locale }),
    ...(input.theme === undefined ? {} : { theme: input.theme }),
  };
}

/** True when resolving now would block the main thread on a big row set. */
function shouldDefer(input: ChartRenderInput, cache: ChartDataCache): boolean {
  const { chart, table, rows } = input;
  if (chart === undefined || table === undefined) {
    return false;
  }
  if (rows.length <= CHART_DEFER_RESOLVE_ROW_THRESHOLD) {
    return false;
  }
  return !hasCachedChartData(cache, table, rows, chart, resolveOptionsOf(input));
}

function compute(input: ChartRenderInput, cache: ChartDataCache): ChartRenderSnapshot {
  const started = performance.now();
  const status = chartRenderStatus(input, { cache });
  return { status, pending: false, resolveMs: performance.now() - started };
}

function initialSnapshot(input: ChartRenderInput, cache: ChartDataCache): InternalSnapshot {
  if (shouldDefer(input, cache)) {
    return { status: null, pending: true, resolveMs: 0, input: null };
  }
  return { ...compute(input, cache), input: renderedInputOf(input) };
}

/**
 * Resolves one chart view, deferring big-table work behind a loading state.
 *
 * `input.rows` must keep its reference between renders when the rows did not
 * change (pass a shared empty array for a missing table); the hook compares
 * identities to avoid re-resolving.
 */
export function useChartRenderStatus(input: ChartRenderInput): ChartRenderSnapshot {
  const [cache] = useState<ChartDataCache>(() => createChartDataCache());
  const { chart, table, rows, locale, theme } = input;
  const [state, setState] = useState<InternalSnapshot>(() => initialSnapshot(input, cache));

  useEffect(() => {
    const current: RenderedInput = { chart, table, rows, locale, theme };
    if (sameInput(state.input, current)) {
      return undefined;
    }
    const nextInput: ChartRenderInput = {
      chart,
      table,
      rows,
      ...(locale === undefined ? {} : { locale }),
      ...(theme === undefined ? {} : { theme }),
    };
    const finish = (): void => {
      setState({ ...compute(nextInput, cache), input: current });
    };
    if (!shouldDefer(nextInput, cache)) {
      finish();
      return undefined;
    }
    // Commit the loading state first; the resolve runs in a fresh task.
    setState((previous) => (previous.pending ? previous : { ...previous, pending: true }));
    const timer = setTimeout(finish, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [cache, chart, locale, rows, state.input, table, theme]);

  return { status: state.status, pending: state.pending, resolveMs: state.resolveMs };
}
