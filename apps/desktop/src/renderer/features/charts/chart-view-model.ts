/**
 * Chart view state derivation (T4.4).
 *
 * Pure helpers shared by the chart view, the remap panel and the new-chart
 * wizard: mapping/layout construction, missing-column detection, invalid-mapping
 * classification and RenderModel resolution. Components only render this state.
 */

import { defaultChartOptions, findMissingChartColumns } from '@curve/app-core';
import {
  canBeChartSeries,
  canBeChartX,
  canBeChartY,
  resolveSeries,
  validateChartMapping,
} from '@curve/chart-model';
import type { ChartIssue, RenderModel } from '@curve/chart-model';
import type {
  ChartKind,
  ChartMapping,
  ChartOptions,
  ChartSpec,
  ColumnDef,
  Row,
  TableMeta,
} from '@curve/domain';

/** Fixed timestamp for the wizard preview chart (never persisted). */
export const CHART_PREVIEW_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export type ChartRenderStatus =
  | { kind: 'ready'; model: RenderModel }
  | { kind: 'missing-chart' }
  | { kind: 'missing-table' }
  | { kind: 'missing-columns'; columnIds: readonly string[] }
  | { kind: 'invalid'; issues: readonly ChartIssue[] }
  | { kind: 'error'; message: string };

export interface ChartRenderInput {
  chart: ChartSpec | undefined;
  table: TableMeta | undefined;
  rows: readonly Row[];
  locale?: string;
  theme?: 'light' | 'dark';
}

function firstCompatible(
  table: TableMeta,
  accepts: (column: ColumnDef) => boolean,
): ColumnDef | undefined {
  return table.columns.find(accepts);
}

/**
 * Prefers a column whose persisted role already names the chart slot, then any
 * type-compatible column. A text primary key with role `none` therefore never
 * wins over the table's dedicated `x`/`series`/`y` column.
 */
function preferredCompatible(
  table: TableMeta,
  accepts: (column: ColumnDef) => boolean,
  role: ColumnDef['role'],
): ColumnDef | undefined {
  return (
    table.columns.find((column) => column.role === role && accepts(column)) ??
    firstCompatible(table, accepts)
  );
}

function compatibleColumn(
  table: TableMeta,
  columnId: string,
  accepts: (column: ColumnDef) => boolean,
): ColumnDef | undefined {
  return table.columns.find((column) => column.id === columnId && accepts(column));
}

/**
 * Builds the best mapping for `layout`, reusing compatible selections from
 * `current` and falling back to the first compatible column. Returns `null`
 * when the table cannot express the layout at all (for example no number
 * column for a wide chart, or no text/enum series column for a long chart).
 *
 * Used by the wizard (no `current`) and by the inspector's layout switch so a
 * layout change never produces a schema-invalid `ChartMapping`.
 */
export function buildChartMapping(
  table: TableMeta,
  layout: ChartMapping['layout'],
  current?: ChartMapping,
): ChartMapping | null {
  const xColumn = compatibleColumn(table, current?.xColumnId ?? '', canBeChartX);
  const xColumnId = xColumn?.id ?? preferredCompatible(table, canBeChartX, 'x')?.id;
  if (xColumnId === undefined) {
    return null;
  }

  if (layout === 'wide') {
    const kept =
      current?.layout === 'wide'
        ? current.yColumnIds.filter(
            (columnId) => compatibleColumn(table, columnId, canBeChartY) !== undefined,
          )
        : [];
    const fallback = preferredCompatible(table, canBeChartY, 'y');
    const yColumnIds = kept.length > 0 ? kept : fallback === undefined ? [] : [fallback.id];
    return yColumnIds.length === 0 ? null : { layout: 'wide', xColumnId, yColumnIds };
  }

  const seriesColumn =
    current?.layout === 'long'
      ? compatibleColumn(table, current.seriesColumnId, canBeChartSeries)
      : undefined;
  const seriesColumnId =
    seriesColumn?.id ?? preferredCompatible(table, canBeChartSeries, 'series')?.id;
  const keptY =
    current?.layout === 'long'
      ? compatibleColumn(table, current.yColumnId, canBeChartY)
      : undefined;
  const yColumnId = keptY?.id ?? preferredCompatible(table, canBeChartY, 'y')?.id;
  if (seriesColumnId === undefined || yColumnId === undefined) {
    return null;
  }
  return { layout: 'long', xColumnId, seriesColumnId, yColumnId };
}

/** True when `layout` can be selected for this table (SPEC §11.1). */
export function canUseChartLayout(table: TableMeta, layout: ChartMapping['layout']): boolean {
  return buildChartMapping(table, layout) !== null;
}

/**
 * Classifies a chart view for rendering.
 *
 * Order matters: a deleted mapped column is reported as `missing-columns` (so
 * the remap panel can name it) before the generic type/role validation, and
 * any resolve failure falls back to a catchable `error` instead of crashing the
 * view (SPEC §6.6.4 "must not crash").
 */
export function chartRenderStatus(input: ChartRenderInput): ChartRenderStatus {
  const { chart, table, rows } = input;
  if (chart === undefined) {
    return { kind: 'missing-chart' };
  }
  if (table === undefined) {
    return { kind: 'missing-table' };
  }
  const missing = findMissingChartColumns(chart, table);
  if (missing.length > 0) {
    return { kind: 'missing-columns', columnIds: missing };
  }
  const mappingIssues = validateChartMapping(table, chart.mapping);
  if (mappingIssues.length > 0) {
    return { kind: 'invalid', issues: mappingIssues };
  }
  try {
    const resolved = resolveSeries(table, rows, chart, {
      ...(input.locale === undefined ? {} : { locale: input.locale }),
      ...(input.theme === undefined ? {} : { theme: input.theme }),
    });
    return resolved.ok
      ? { kind: 'ready', model: resolved.model }
      : { kind: 'invalid', issues: resolved.issues };
  } catch (thrown) {
    return {
      kind: 'error',
      message: thrown instanceof Error ? thrown.message : String(thrown),
    };
  }
}

/** A throwaway ChartSpec for the wizard preview (same options as a real chart). */
export interface PreviewChartInput {
  tableId: string;
  title: string;
  kind: ChartKind;
  mapping: ChartMapping;
  options?: Partial<ChartOptions>;
  filter?: ChartSpec['filter'];
  sort?: ChartSpec['sort'];
}

export function createPreviewChart(input: PreviewChartInput): ChartSpec {
  return {
    id: 'cht_preview',
    title: input.title.trim() === '' ? 'Chart' : input.title.trim(),
    kind: input.kind,
    tableId: input.tableId,
    mapping: input.mapping,
    ...(input.filter === undefined ? {} : { filter: input.filter }),
    sort: input.sort ?? [],
    options: { ...defaultChartOptions(), ...input.options },
    version: 1,
    createdAt: CHART_PREVIEW_TIMESTAMP,
    updatedAt: CHART_PREVIEW_TIMESTAMP,
  };
}
