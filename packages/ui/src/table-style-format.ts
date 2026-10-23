/**
 * Table-style-aware cell presentation (SPEC §10.2, T3.2).
 *
 * Pure functions only: the grid passes the visible rows and the resolved style
 * in, and receives text, alignment and decoration decisions back. Column
 * overrides never mutate `ColumnDef` or the persisted manifest.
 */

import { formatCellValue } from '@curve/domain';
import type { Cell, ColumnDef, ColumnStyleOverride, Row, TableStyle } from '@curve/domain';

export type CellAlign = 'left' | 'center' | 'right';

/** What `GridCell` needs to draw; number/date overrides still render as text. */
export type CellRenderMode = 'text' | 'badge' | 'bar';

export type BadgeTone = 0 | 1 | 2 | 3;

export interface BarRange {
  min: number;
  max: number;
}

export interface StyledCellOptions {
  /** BCP 47 locale, usually the app's i18n locale. */
  locale?: string;
  trueLabel?: string;
  falseLabel?: string;
}

export interface StyledCellPresentation {
  text: string;
  align: CellAlign;
  render: CellRenderMode;
  /** Set only for `bar` cells with a numeric range. */
  barRatio: number | null;
  /** Set only for enum badges. */
  badgeTone: BadgeTone | null;
}

const DECIMAL_MAX_FRACTION_DIGITS = 20;

/** Small bounded cache: visible cells are reformatted on every scroll frame. */
const formatterCache = new Map<string, Intl.NumberFormat>();
const FORMATTER_CACHE_LIMIT = 64;

function numberFormatter(
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.NumberFormat(locale, options);
  if (formatterCache.size >= FORMATTER_CACHE_LIMIT) {
    formatterCache.clear();
  }
  formatterCache.set(key, formatter);
  return formatter;
}

function formatNumber(
  value: number,
  column: ColumnDef,
  style: TableStyle,
  locale: string | undefined,
): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  const override = style.columnOverrides[column.id]?.numberFormat;
  const digits = override?.digits ?? column.precision;
  const requested = override?.style ?? 'decimal';
  const options: Intl.NumberFormatOptions = { useGrouping: true };

  if (digits === undefined && requested === 'decimal') {
    // Preserve the value's own precision when the column has no precision.
    options.maximumFractionDigits = DECIMAL_MAX_FRACTION_DIGITS;
  } else if (digits !== undefined) {
    options.minimumFractionDigits = digits;
    options.maximumFractionDigits = digits;
  }

  if (requested === 'currency' && override?.currency !== undefined && override.currency !== '') {
    options.style = 'currency';
    options.currency = override.currency;
  } else if (requested === 'percent') {
    options.style = 'percent';
  } else {
    options.style = 'decimal';
  }

  try {
    return numberFormatter(locale, options).format(value);
  } catch {
    // Invalid persisted currency codes must not break rendering.
    const fallback: Intl.NumberFormatOptions = { useGrouping: true, style: 'decimal' };
    if (digits !== undefined) {
      fallback.minimumFractionDigits = digits;
      fallback.maximumFractionDigits = digits;
    } else {
      fallback.maximumFractionDigits = DECIMAL_MAX_FRACTION_DIGITS;
    }
    return numberFormatter(locale, fallback).format(value);
  }
}

/** Formats one value for display; never writes back into the model. */
export function formatStyledCellValue(
  value: Cell,
  column: ColumnDef,
  style: TableStyle,
  options: StyledCellOptions = {},
): string {
  if (value === null) {
    return '';
  }

  const override: ColumnStyleOverride | undefined = style.columnOverrides[column.id];

  switch (column.type) {
    case 'text':
      return String(value);
    case 'number':
      return typeof value === 'number'
        ? formatNumber(value, column, style, options.locale)
        : String(value);
    case 'date':
      return formatCellValue(value, column, {
        ...(options.locale === undefined ? {} : { locale: options.locale }),
        dateFormat: override?.dateFormat ?? 'date',
      });
    case 'boolean':
      return formatCellValue(value, column, {
        ...(options.trueLabel === undefined ? {} : { trueLabel: options.trueLabel }),
        ...(options.falseLabel === undefined ? {} : { falseLabel: options.falseLabel }),
      });
    case 'enum':
      return formatCellValue(value, column);
  }
}

/** Default alignment is right for numeric/date columns and left for the rest. */
export function resolveCellAlign(column: ColumnDef, style: TableStyle): CellAlign {
  const override = style.columnOverrides[column.id];
  if (override?.align !== undefined) {
    return override.align;
  }
  return column.type === 'number' || column.type === 'date' ? 'right' : 'left';
}

/** `auto` uses a badge for enums, plain formatted text otherwise. */
export function resolveCellRender(column: ColumnDef, style: TableStyle): CellRenderMode {
  const requested = style.columnOverrides[column.id]?.cellRender ?? 'auto';
  if (requested === 'badge') {
    return column.type === 'enum' ? 'badge' : 'text';
  }
  if (requested === 'bar') {
    return column.type === 'number' ? 'bar' : 'text';
  }
  if (requested === 'auto') {
    return column.type === 'enum' ? 'badge' : 'text';
  }
  return 'text';
}

/** The header label for a column, honouring a style-only label override. */
export function columnDisplayLabel(column: ColumnDef, style: TableStyle): string {
  return style.columnOverrides[column.id]?.label ?? column.label;
}

/**
 * Min/max for every `bar` column over the rows the caller passes in (the
 * current filtered/sorted result). Returns an empty map when no bar is used.
 */
export function computeBarRanges(
  rows: readonly Row[],
  columns: readonly ColumnDef[],
  style: TableStyle,
): Record<string, BarRange> {
  const ranges: Record<string, BarRange> = {};
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const indexById = new Map(columns.map((column, index) => [column.id, index]));

  for (const columnId of Object.keys(style.columnOverrides)) {
    const column = columnById.get(columnId);
    const index = indexById.get(columnId);
    if (column === undefined || index === undefined) {
      continue;
    }
    if (resolveCellRender(column, style) !== 'bar') {
      continue;
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      const value = row.values[index];
      if (typeof value === 'number' && Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    if (min !== Number.POSITIVE_INFINITY) {
      ranges[columnId] = { min, max };
    }
  }

  return ranges;
}

/** Normalises a numeric value into 0..1; a flat range renders a zero-width bar. */
export function barRatioForValue(value: Cell, range: BarRange | undefined): number | null {
  if (range === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (range.max === range.min) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - range.min) / (range.max - range.min)));
}

/** Stable FNV-1a hash to one of the four style-derived badge tones. */
export function enumBadgeTone(value: string): BadgeTone {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 4) as BadgeTone;
}

/** Convenience for the grid: everything `GridCell` needs for one value. */
export function presentStyledCell(
  value: Cell,
  column: ColumnDef,
  style: TableStyle,
  barRanges: Readonly<Record<string, BarRange>>,
  options: StyledCellOptions = {},
): StyledCellPresentation {
  const render = resolveCellRender(column, style);
  const barRatio = render === 'bar' ? barRatioForValue(value, barRanges[column.id]) : null;
  const badgeTone =
    render === 'badge' && typeof value === 'string' && value.length > 0
      ? enumBadgeTone(value)
      : null;

  return {
    text: formatStyledCellValue(value, column, style, options),
    align: resolveCellAlign(column, style),
    render,
    barRatio,
    badgeTone,
  };
}
