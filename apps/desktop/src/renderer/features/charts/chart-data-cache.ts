/**
 * Row-derived chart data cache (T4.6, ADR-045).
 *
 * `resolveChartData` is the expensive half of a chart resolve (filter, sort,
 * mapping and LTTB over up to 100k rows). Palette, background and line styling
 * are applied by `renderChartModel` and therefore never need the row scan. This
 * module keeps the last resolved snapshots for the renderer so that
 *
 * - a style-only inspector commit reuses data instead of re-filtering 100k rows;
 * - the chart view and the new-chart wizard preview do not resolve the same
 *   table twice;
 * - a row edit (`rows` gets a new array from Immer) can never read stale data:
 *   a hit requires both the data key **and** the `rows` reference to match.
 *
 * The cache deliberately lives in the renderer, not in `@curve/chart-model`:
 * ADR-040 keeps that package pure and stateless. Capacity is small and the
 * lifetime follows the component, so closing a view releases the snapshots.
 */

import { resolveChartData } from '@curve/chart-model';
import type { ChartDataResult, ChartResolveOptions, ResolvedChartData } from '@curve/chart-model';
import type { ChartSpec, Row, TableMeta } from '@curve/domain';

/** ADR-045: one live chart plus its wizard preview fit; older entries fall out. */
export const CHART_DATA_CACHE_CAPACITY = 2;

interface CacheEntry {
  key: string;
  /** Identity guard: Immer produces a new array on every row change. */
  rows: readonly Row[];
  data: ResolvedChartData;
}

export interface ChartDataCache {
  /** Number of retained snapshots (never above the configured capacity). */
  readonly size: number;
  /** Returns the data only when both the key and the `rows` reference match. */
  get(key: string, rows: readonly Row[]): ResolvedChartData | undefined;
  set(key: string, rows: readonly Row[], data: ResolvedChartData): void;
  clear(): void;
}

/**
 * Bounded least-recently-used cache. Insertion/lookup are linear over at most a
 * handful of entries (capacity is a constant), which keeps the structure
 * dependency-free and easy to reason about.
 */
export function createChartDataCache(capacity = CHART_DATA_CACHE_CAPACITY): ChartDataCache {
  const limit = Math.max(1, Math.floor(capacity));
  const entries: CacheEntry[] = [];

  return {
    get size(): number {
      return entries.length;
    },

    get(key: string, rows: readonly Row[]): ResolvedChartData | undefined {
      const index = entries.findIndex((entry) => entry.key === key && entry.rows === rows);
      if (index < 0) {
        return undefined;
      }
      const [entry] = entries.splice(index, 1);
      if (entry === undefined) {
        return undefined;
      }
      // Most recently used first, so `set` can evict from the tail.
      entries.unshift(entry);
      return entry.data;
    },

    set(key: string, rows: readonly Row[], data: ResolvedChartData): void {
      const existing = entries.findIndex((entry) => entry.key === key && entry.rows === rows);
      if (existing >= 0) {
        entries.splice(existing, 1);
      }
      entries.unshift({ key, rows, data });
      if (entries.length > limit) {
        entries.length = limit;
      }
    },

    clear(): void {
      entries.length = 0;
    },
  };
}

/**
 * Everything the resolved data depends on, in a stable order.
 *
 * Column labels/types/roles/units/precision and enum option labels are part of
 * the signature because they reach the series names and axis label. Style
 * fields (`paletteId`, `background`, `lineWidth`, `smooth`, `showSymbol`,
 * `legend`, `showGrid`, `numberDigits`, `yStartAtZero`, `yLabel`, `kind`) and
 * the `xLabel` override are deliberately absent: `renderChartModel` applies
 * them without touching the row scan.
 */
function columnSignature(table: TableMeta): string {
  return table.columns
    .map((column) =>
      [
        column.id,
        column.label,
        column.type,
        column.role,
        column.unit ?? '',
        column.precision === undefined ? '' : String(column.precision),
        column.enumOptions === undefined ? '' : JSON.stringify(column.enumOptions),
      ].join('\u001f'),
    )
    .join('\u001e');
}

/** Cache key for the row-derived part of one chart resolve. */
export function chartDataKey(
  table: TableMeta,
  rows: readonly Row[],
  spec: ChartSpec,
  locale?: string,
): string {
  return JSON.stringify([
    table.id,
    columnSignature(table),
    rows.length,
    spec.mapping,
    spec.filter ?? null,
    spec.sort,
    spec.options.sampling,
    locale ?? null,
  ]);
}

/** True when the row-derived data for this input is already cached. */
export function hasCachedChartData(
  cache: ChartDataCache,
  table: TableMeta,
  rows: readonly Row[],
  spec: ChartSpec,
  options: ChartResolveOptions = {},
): boolean {
  return cache.get(chartDataKey(table, rows, spec, options.locale), rows) !== undefined;
}

/**
 * Resolves the data half through the cache.
 *
 * A miss runs the full `resolveChartData` once and stores the snapshot; failures
 * are never cached (validation issues are cheap and must stay live).
 */
export function resolveChartDataCached(
  cache: ChartDataCache,
  table: TableMeta,
  rows: readonly Row[],
  spec: ChartSpec,
  options: ChartResolveOptions = {},
): ChartDataResult {
  const key = chartDataKey(table, rows, spec, options.locale);
  const cached = cache.get(key, rows);
  if (cached !== undefined) {
    return { ok: true, data: cached };
  }
  const result = resolveChartData(table, rows, spec, options);
  if (result.ok) {
    cache.set(key, rows, result.data);
  }
  return result;
}
