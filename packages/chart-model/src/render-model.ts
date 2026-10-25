/**
 * Chart-agnostic RenderModel (T4.1/T4.2, SPEC §11.1–§11.3, ADR-040/ADR-041).
 *
 * `@curve/chart-model` turns one table snapshot + one `ChartSpec` into the
 * RenderModel consumed by `@curve/chart-echarts`. It must stay pure and free of
 * ECharts/React/Electron imports; the only workspace dependencies are
 * `@curve/domain` and `@curve/table-engine` (filter/sort semantics live there,
 * ADR-032). LTTB downsampling also happens here (never in the adapter).
 */

import type {
  Cell,
  ChartKind,
  ChartMapping,
  ChartSpec,
  ColumnDef,
  Row,
  TableMeta,
  ValidationIssueCode,
} from '@curve/domain';
import {
  applyFilter,
  applySort,
  validateFilterPredicate,
  validateSortSpecs,
} from '@curve/table-engine';

import { resolveChartBackground, resolvePalette } from './palettes';
import { sampleSeriesIndices } from './sampling';

import type { SamplingOptions } from './sampling';

/** SPEC §11.1 / §11.2: at most this many series are rendered. */
export const MAX_CHART_SERIES = 20;

/** Text used for a long-layout series whose value is empty (SPEC §11.1). */
export const EMPTY_SERIES_NAME = '(空)';

/** One plotted series; `id` is stable across renders (SPEC §11.3). */
export interface RenderSeries {
  id: string;
  name: string;
  values: (number | null)[];
  color?: string;
}

/** Shared x axis of a RenderModel. */
export interface RenderXAxis {
  values: (number | string)[];
  type: 'number' | 'time' | 'category';
  label?: string;
  unit?: string;
}

/** Rendering options copied from `ChartSpec.options`. */
export interface RenderStyle {
  palette: string[];
  background: string;
  showGrid: boolean;
  lineWidth: number;
  smooth: boolean;
  showSymbol: boolean;
  legend: 'top' | 'right' | 'bottom' | 'none';
  numberDigits: number;
  yStartAtZero: boolean;
}

/** Sampling/scale metadata; warnings are always showable (SPEC §11.3). */
export interface RenderMeta {
  sampled: boolean;
  sourcePoints: number;
  renderedPoints: number;
  warnings: string[];
}

/** SPEC §11.3 RenderModel contract. */
export interface RenderModel {
  kind: ChartKind;
  x: RenderXAxis;
  series: RenderSeries[];
  style: RenderStyle;
  meta: RenderMeta;
}

/** Structured mapping/query failure; mirrors the other domain issue shapes. */
export interface ChartIssue {
  path: string;
  code: ValidationIssueCode;
  message: string;
}

/** Theme/locale context for one resolve call. */
export interface ChartResolveOptions {
  /** BCP 47 locale used by text filter comparisons. */
  locale?: string;
  /** App theme used when the chart background is `auto`. */
  theme?: 'light' | 'dark';
  /** Explicit canvas colour; wins over everything else. */
  background?: string;
}

export type ChartResolveResult =
  { ok: true; model: RenderModel } | { ok: false; issues: ChartIssue[] };

const X_TYPES: ReadonlySet<string> = new Set(['number', 'date', 'text']);
const SERIES_TYPES: ReadonlySet<string> = new Set(['text', 'enum']);

/** True when the column may be used as the chart x axis (SPEC §11.1). */
export function canBeChartX(column: ColumnDef): boolean {
  return X_TYPES.has(column.type) && (column.role === 'x' || column.role === 'none');
}

/** True when the column may be used as a chart y axis (SPEC §11.1). */
export function canBeChartY(column: ColumnDef): boolean {
  return column.type === 'number' && (column.role === 'y' || column.role === 'none');
}

/** True when the column may split long-layout series (SPEC §11.1). */
export function canBeChartSeries(column: ColumnDef): boolean {
  return SERIES_TYPES.has(column.type) && (column.role === 'series' || column.role === 'none');
}

function findColumn(table: TableMeta, columnId: string): ColumnDef | undefined {
  return table.columns.find((column) => column.id === columnId);
}

function requireColumn(table: TableMeta, columnId: string): ColumnDef {
  const column = findColumn(table, columnId);
  if (column === undefined) {
    // validateChartMapping already rejected missing columns on this call.
    throw new Error(`Chart column "${columnId}" is missing from table "${table.id}".`);
  }
  return column;
}

function missingColumnIssue(table: TableMeta, path: string, columnId: string): ChartIssue {
  return {
    path,
    code: 'E_REQUIRED',
    message: `Chart column "${columnId}" is not part of table "${table.name}".`,
  };
}

function validateXColumn(table: TableMeta, columnId: string, issues: ChartIssue[]): void {
  const path = 'mapping.xColumnId';
  const column = findColumn(table, columnId);
  if (column === undefined) {
    issues.push(missingColumnIssue(table, path, columnId));
    return;
  }
  if (!X_TYPES.has(column.type)) {
    issues.push({
      path,
      code: 'E_TYPE',
      message: `Chart x column "${column.label}" must be number, date or text.`,
    });
  }
  if (column.role !== 'x' && column.role !== 'none') {
    issues.push({
      path,
      code: 'E_VALIDATION',
      message: `Chart x column "${column.label}" must have role x or none.`,
    });
  }
}

function validateYColumn(
  table: TableMeta,
  columnId: string,
  path: string,
  issues: ChartIssue[],
): void {
  const column = findColumn(table, columnId);
  if (column === undefined) {
    issues.push(missingColumnIssue(table, path, columnId));
    return;
  }
  if (column.type !== 'number') {
    issues.push({
      path,
      code: 'E_TYPE',
      message: `Chart y column "${column.label}" must be number.`,
    });
  }
  if (column.role !== 'y' && column.role !== 'none') {
    issues.push({
      path,
      code: 'E_VALIDATION',
      message: `Chart y column "${column.label}" must have role y or none.`,
    });
  }
}

function validateSeriesColumn(table: TableMeta, columnId: string, issues: ChartIssue[]): void {
  const path = 'mapping.seriesColumnId';
  const column = findColumn(table, columnId);
  if (column === undefined) {
    issues.push(missingColumnIssue(table, path, columnId));
    return;
  }
  if (!SERIES_TYPES.has(column.type)) {
    issues.push({
      path,
      code: 'E_TYPE',
      message: `Chart series column "${column.label}" must be text or enum.`,
    });
  }
  if (column.role !== 'series' && column.role !== 'none') {
    issues.push({
      path,
      code: 'E_VALIDATION',
      message: `Chart series column "${column.label}" must have role series or none.`,
    });
  }
}

/**
 * Validates one chart mapping against a table snapshot (SPEC §11.1).
 *
 * Returns every problem at once so the inspector can highlight each field; it
 * never throws for untrusted input.
 */
export function validateChartMapping(table: TableMeta, mapping: ChartMapping): ChartIssue[] {
  const issues: ChartIssue[] = [];
  validateXColumn(table, mapping.xColumnId, issues);

  if (mapping.layout === 'wide') {
    if (mapping.yColumnIds.length === 0) {
      issues.push({
        path: 'mapping.yColumnIds',
        code: 'E_REQUIRED',
        message: 'A chart needs at least one y column.',
      });
    }
    const seen = new Set<string>();
    mapping.yColumnIds.forEach((columnId, index) => {
      const path = `mapping.yColumnIds[${String(index)}]`;
      validateYColumn(table, columnId, path, issues);
      if (seen.has(columnId)) {
        issues.push({
          path,
          code: 'E_DUPLICATE_KEY',
          message: `Chart y column "${columnId}" is selected more than once.`,
        });
      }
      seen.add(columnId);
    });
    return issues;
  }

  validateSeriesColumn(table, mapping.seriesColumnId, issues);
  validateYColumn(table, mapping.yColumnId, 'mapping.yColumnId', issues);
  return issues;
}

/** Builds the unique display name for one series (SPEC §11.1 "重名加序号"). */
function uniqueSeriesName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base} (${String(suffix)})`)) {
    suffix += 1;
  }
  const name = `${base} (${String(suffix)})`;
  used.add(name);
  return name;
}

function paletteColor(palette: readonly string[], index: number): string {
  const color = palette[index % palette.length];
  if (color === undefined) {
    throw new Error('The chart palette is empty.');
  }
  return color;
}

function seriesKeyOf(cell: Cell): string {
  return cell === null ? '' : String(cell);
}

function seriesNameOf(cell: Cell, column: ColumnDef): string {
  if (cell === null) {
    return EMPTY_SERIES_NAME;
  }
  if (column.type === 'enum') {
    const option = column.enumOptions?.find((entry) => entry.value === String(cell));
    return option?.label ?? String(cell);
  }
  return String(cell);
}

/** Number/date cells are plotted as numbers; everything else is a gap. */
function numericValue(cell: Cell): number | null {
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return cell;
  }
  return null;
}

/** Numeric x cell; rows with other cells are dropped by `collectRows`. */
function numericX(cell: Cell): number {
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return cell;
  }
  throw new Error('Invalid x value reached the RenderModel.');
}

/** Stable ascending sort used when the chart has no explicit `sort`. */
function sortRowsByX(rows: readonly Row[], xIndex: number): Row[] {
  return rows
    .map((row, index) => ({ row, index, value: numericX(row.values[xIndex] ?? null) }))
    .sort((left, right) => {
      const compared = left.value - right.value;
      return compared === 0 ? left.index - right.index : compared;
    })
    .map((entry) => entry.row);
}

function countDuplicates(values: readonly (number | string)[]): number {
  const seen = new Set<number | string>();
  let duplicates = 0;
  for (const value of values) {
    if (seen.has(value)) {
      duplicates += 1;
    } else {
      seen.add(value);
    }
  }
  return duplicates;
}

function xAxisType(column: ColumnDef): RenderXAxis['type'] {
  if (column.type === 'date') {
    return 'time';
  }
  return column.type === 'text' ? 'category' : 'number';
}

function renderXValue(cell: Cell, column: ColumnDef): number | string {
  if (column.type === 'text') {
    return cell === null ? '' : String(cell);
  }
  return numericX(cell);
}

interface ResolvedRows {
  rows: Row[];
  skipped: number;
}

function collectRows(table: TableMeta, rows: readonly Row[], xColumn: ColumnDef): ResolvedRows {
  const xIndex = table.columns.findIndex((column) => column.id === xColumn.id);
  const kept: Row[] = [];
  let skipped = 0;
  for (const row of rows) {
    const cell = row.values[xIndex] ?? null;
    if (xColumn.type === 'text') {
      kept.push(row);
      continue;
    }
    if (typeof cell === 'number' && Number.isFinite(cell)) {
      kept.push(row);
    } else {
      skipped += 1;
    }
  }
  return { rows: kept, skipped };
}

/** Numeric coordinate used by LTTB; category axes keep their point index (ADR-041). */
function samplingCoordinates(
  xValues: readonly (number | string)[],
  type: RenderXAxis['type'],
): number[] {
  if (type === 'category') {
    return xValues.map((_value, index) => index);
  }
  return xValues.map((value) => {
    if (typeof value !== 'number') {
      // renderXValue only emits numbers for number/time axes.
      throw new Error('A number/time chart axis must hold numeric x values.');
    }
    return value;
  });
}

interface SampledModel {
  xValues: (number | string)[];
  series: RenderSeries[];
  renderedPoints: number;
}

/**
 * Downsamples every series independently and re-aligns them on one x axis
 * (SPEC §11.2.6–7, ADR-041).
 *
 * The RenderModel has a single shared `x.values`, so the sampled model keeps
 * the ascending union of the per-series retained indices: each sampled series
 * keeps only its own LTTB picks, while a series that stayed under the threshold
 * contributes every one of its real points. Returns `null` when no series was
 * downsampled, so the T4.1 model passes through untouched.
 */
function sampleModel(
  xValues: readonly (number | string)[],
  coordinates: readonly number[],
  series: readonly RenderSeries[],
  options: SamplingOptions,
): SampledModel | null {
  const retained = series.map((entry) => sampleSeriesIndices(coordinates, entry.values, options));
  if (retained.every((indices) => indices === null)) {
    return null;
  }

  const positions = new Set<number>();
  series.forEach((entry, seriesIndex) => {
    const indices = retained[seriesIndex];
    if (indices === null || indices === undefined) {
      entry.values.forEach((value, pointIndex) => {
        if (value !== null) {
          positions.add(pointIndex);
        }
      });
      return;
    }
    for (const pointIndex of indices) {
      positions.add(pointIndex);
    }
  });

  const ordered = [...positions].sort((left, right) => left - right);
  const retainedSets = retained.map((indices) => (indices === null ? null : new Set(indices)));
  let renderedPoints = 0;
  const sampledSeries = series.map((entry, seriesIndex) => {
    const keep = retainedSets[seriesIndex] ?? null;
    const values = ordered.map((pointIndex) => {
      const value = entry.values[pointIndex] ?? null;
      if (value === null || (keep !== null && !keep.has(pointIndex))) {
        return null;
      }
      renderedPoints += 1;
      return value;
    });
    return { ...entry, values };
  });

  return {
    xValues: ordered.map((pointIndex) => {
      const value = xValues[pointIndex];
      if (value === undefined) {
        throw new Error(`Chart sampling retained the out-of-range x index ${String(pointIndex)}.`);
      }
      return value;
    }),
    series: sampledSeries,
    renderedPoints,
  };
}

/**
 * Resolves one chart into its RenderModel (SPEC §11.3).
 *
 * Order of operations (SPEC §11.2): chart filter → drop unusable numeric x rows
 * → chart sort (or ascending x) → series grouping. Failures return structured
 * issues; warnings that still produce a chart go to `meta.warnings`.
 */
export function resolveSeries(
  table: TableMeta,
  rows: readonly Row[],
  spec: ChartSpec,
  options: ChartResolveOptions = {},
): ChartResolveResult {
  const issues: ChartIssue[] = [];
  if (spec.tableId !== table.id) {
    issues.push({
      path: 'spec.tableId',
      code: 'E_VALIDATION',
      message: `Chart "${spec.title}" belongs to table "${spec.tableId}", not "${table.id}".`,
    });
  }
  issues.push(...validateChartMapping(table, spec.mapping));
  if (spec.filter !== undefined) {
    issues.push(...validateFilterPredicate(table, spec.filter));
  }
  issues.push(...validateSortSpecs(table, spec.sort));
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const mapping = spec.mapping;
  const xColumn = requireColumn(table, mapping.xColumnId);
  const locale = options.locale;
  const filtered =
    spec.filter === undefined ? [...rows] : applyFilter(rows, table, spec.filter, { locale });
  const collected = collectRows(table, filtered, xColumn);
  const xIndex = table.columns.findIndex((column) => column.id === xColumn.id);

  const ordered =
    spec.sort.length > 0
      ? applySort(collected.rows, table, spec.sort, { locale })
      : xColumn.type === 'text'
        ? collected.rows
        : sortRowsByX(collected.rows, xIndex);

  const xValues = ordered.map((row) => renderXValue(row.values[xIndex] ?? null, xColumn));
  const palette = resolvePalette(spec.options.paletteId);
  const usedNames = new Set<string>();
  const warnings: string[] = [];

  if (collected.skipped > 0) {
    warnings.push(
      `${String(collected.skipped)} row(s) were skipped because the x value is missing or not a number.`,
    );
  }
  const duplicates = countDuplicates(xValues);
  if (duplicates > 0) {
    warnings.push(
      `The x column has ${String(duplicates)} duplicate value(s); points are connected in sorted row order.`,
    );
  }

  const series: RenderSeries[] = [];
  if (mapping.layout === 'wide') {
    const yColumns = mapping.yColumnIds.map((columnId) => requireColumn(table, columnId));
    const renderedColumns = yColumns.slice(0, MAX_CHART_SERIES);
    const nonNumeric = new Map<string, number>();
    const renderedSeries: { column: ColumnDef; values: (number | null)[] }[] = [];
    renderedColumns.forEach((column) => {
      const valueIndex = table.columns.findIndex((entry) => entry.id === column.id);
      const values = ordered.map((row) => {
        const cell = row.values[valueIndex] ?? null;
        const value = numericValue(cell);
        if (value === null && cell !== null) {
          nonNumeric.set(column.id, (nonNumeric.get(column.id) ?? 0) + 1);
        }
        return value;
      });
      renderedSeries.push({ column, values });
    });
    renderedSeries.forEach((entry, seriesIndex) => {
      series.push({
        id: entry.column.id,
        name: uniqueSeriesName(entry.column.label, usedNames),
        values: entry.values,
        color: paletteColor(palette, seriesIndex),
      });
    });
    for (const column of renderedColumns) {
      const count = nonNumeric.get(column.id) ?? 0;
      if (count > 0) {
        warnings.push(
          `Column "${column.label}" has ${String(count)} non-numeric value(s); they are rendered as gaps.`,
        );
      }
    }
    if (yColumns.length > MAX_CHART_SERIES) {
      warnings.push(
        `The chart has ${String(yColumns.length)} series; only the first ${String(MAX_CHART_SERIES)} are rendered.`,
      );
    }
  } else {
    const seriesColumn = requireColumn(table, mapping.seriesColumnId);
    const yColumn = requireColumn(table, mapping.yColumnId);
    const seriesIndex = table.columns.findIndex((column) => column.id === seriesColumn.id);
    const yIndex = table.columns.findIndex((column) => column.id === yColumn.id);
    const rowKeys = ordered.map((row) => seriesKeyOf(row.values[seriesIndex] ?? null));
    let nonNumericCount = 0;
    const yValues = ordered.map((row) => {
      const cell = row.values[yIndex] ?? null;
      const value = numericValue(cell);
      if (value === null && cell !== null) {
        nonNumericCount += 1;
      }
      return value;
    });
    const groupKeys: string[] = [];
    const firstCells = new Map<string, Cell>();
    for (const row of ordered) {
      const cell = row.values[seriesIndex] ?? null;
      const key = seriesKeyOf(cell);
      if (!firstCells.has(key)) {
        firstCells.set(key, cell);
        groupKeys.push(key);
      }
    }
    const renderedKeys = groupKeys.slice(0, MAX_CHART_SERIES);
    renderedKeys.forEach((key, seriesIndexValue) => {
      series.push({
        id: `${seriesColumn.id}:${key}`,
        name: uniqueSeriesName(seriesNameOf(firstCells.get(key) ?? null, seriesColumn), usedNames),
        values: yValues.map((value, rowIndex) => (rowKeys[rowIndex] === key ? value : null)),
        color: paletteColor(palette, seriesIndexValue),
      });
    });
    if (nonNumericCount > 0) {
      warnings.push(
        `Column "${yColumn.label}" has ${String(nonNumericCount)} non-numeric value(s); they are rendered as gaps.`,
      );
    }
    if (groupKeys.length > MAX_CHART_SERIES) {
      warnings.push(
        `The chart has ${String(groupKeys.length)} series; only the first ${String(MAX_CHART_SERIES)} are rendered.`,
      );
    }
  }

  const sourcePoints = series.reduce(
    (total, entry) => total + entry.values.filter((value) => value !== null).length,
    0,
  );
  const xAxis: RenderXAxis = {
    values: xValues,
    type: xAxisType(xColumn),
    label: spec.options.xLabel ?? xColumn.label,
  };
  if (xColumn.unit !== undefined) {
    xAxis.unit = xColumn.unit;
  }

  const sampling = spec.options.sampling;
  const sampled =
    sampling.enabled && sourcePoints > sampling.threshold
      ? sampleModel(xAxis.values, samplingCoordinates(xAxis.values, xAxis.type), series, sampling)
      : null;

  return {
    ok: true,
    model: {
      kind: spec.kind,
      x: sampled === null ? xAxis : { ...xAxis, values: sampled.xValues },
      series: sampled === null ? series : sampled.series,
      style: {
        palette,
        background: resolveChartBackground(spec.options.background, {
          theme: options.theme,
          background: options.background,
        }),
        showGrid: spec.options.showGrid,
        lineWidth: spec.options.lineWidth,
        smooth: spec.options.smooth,
        showSymbol: spec.options.showSymbol,
        legend: spec.options.legend,
        numberDigits: spec.options.numberDigits,
        yStartAtZero: spec.options.yStartAtZero,
      },
      meta: {
        sampled: sampled !== null,
        sourcePoints,
        renderedPoints: sampled === null ? sourcePoints : sampled.renderedPoints,
        warnings,
      },
    },
  };
}
