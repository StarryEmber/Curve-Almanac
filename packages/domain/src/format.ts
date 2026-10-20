import type { Cell, ColumnDef } from './types';

/** How a date cell is rendered when no column override is present. */
export type DateDisplayFormat = 'date' | 'date-time' | 'time' | 'iso';

export interface FormatCellOptions {
  /** BCP 47 locale; `undefined` uses the runtime default. */
  locale?: string;
  dateFormat?: DateDisplayFormat;
  /** Labels for boolean cells; the UI passes localised text. */
  trueLabel?: string;
  falseLabel?: string;
}

/**
 * Renders a cell for tables, tooltips and CSV export (SPEC §8.1, §10.2).
 *
 * This is the *formatting baseline*: it never round-trips back into a model
 * value, and it does not look at user styles. `@curve/ui` layers column
 * overrides and table styles on top of it.
 */
export function formatCellValue(
  value: Cell,
  column: ColumnDef,
  options: FormatCellOptions = {},
): string {
  const { locale, dateFormat = 'date', trueLabel = 'true', falseLabel = 'false' } = options;
  if (value === null) {
    return '';
  }

  switch (column.type) {
    case 'text':
      return String(value);
    case 'number':
      return typeof value === 'number' ? formatNumber(value, column, locale) : String(value);
    case 'date':
      return typeof value === 'number' ? formatDate(value, locale, dateFormat) : String(value);
    case 'boolean':
      return value === true ? trueLabel : value === false ? falseLabel : String(value);
    case 'enum':
      return typeof value === 'string' ? enumLabel(value, column) : String(value);
  }
}

function formatNumber(value: number, column: ColumnDef, locale: string | undefined): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  if (column.precision === undefined) {
    return String(value);
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: column.precision,
    maximumFractionDigits: column.precision,
  }).format(value);
}

function formatDate(value: number, locale: string | undefined, format: DateDisplayFormat): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  if (format === 'iso') {
    return date.toISOString();
  }

  const options: Intl.DateTimeFormatOptions =
    format === 'time'
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : format === 'date-time'
        ? {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }
        : { year: 'numeric', month: '2-digit', day: '2-digit' };

  return new Intl.DateTimeFormat(locale, options).format(date);
}

function enumLabel(value: string, column: ColumnDef): string {
  const option = column.enumOptions?.find((candidate) => candidate.value === value);
  return option?.label ?? value;
}
