/**
 * Locale-aware value formatting for tooltips and axes (T4.3, ADR-042 §5).
 *
 * The RenderModel has no locale; callers pass the app locale (default `en-US`,
 * mirroring `DEFAULT_QUERY_LOCALE`). Tooltip content is plain HTML, so every
 * user-controlled string is escaped before it is interpolated (ADR-042 §5).
 */

import type { RenderModel, RenderXAxis } from '@curve/chart-model';

/** Locale used when the caller does not provide one. */
export const DEFAULT_CHART_LOCALE = 'en-US';

/** Axis tick labels keep a little precision without the tooltip's fixed digits. */
const MAX_AXIS_FRACTION_DIGITS = 4;

/** Upper bound mirrored from `chartOptionsSchema.numberDigits`. */
const MAX_CHART_DIGITS = 6;

export interface ChartFormatterOptions {
  /** BCP 47 locale; defaults to `DEFAULT_CHART_LOCALE`. */
  locale?: string;
}

/** Formatting helpers shared by the option builder and the tooltip callback. */
export interface ChartFormatters {
  /** Axis tick label for a numeric x/y axis. */
  formatAxisNumber(value: number): string;
  /** Tooltip/axis value for the x axis, by axis type. */
  formatXValue(value: number | string | undefined): string;
  /** Tooltip value for a y value, using the chart's fixed precision. */
  formatYValue(value: number): string;
  /** ECharts tooltip formatter (axis or item trigger). */
  formatTooltip(params: unknown): string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/** Escapes every HTML-significant character in user-controlled text. */
export function escapeHtmlText(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => HTML_ESCAPES[character] ?? character);
}

function clampDigits(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MAX_CHART_DIGITS, Math.max(0, Math.trunc(value)));
}

function paletteColor(model: RenderModel, index: number): string | undefined {
  if (model.style.palette.length === 0) {
    return undefined;
  }
  return model.style.palette[index % model.style.palette.length];
}

interface TooltipAnchor {
  seriesIndex: number;
  dataIndex: number;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function readAnchor(param: unknown): TooltipAnchor | null {
  if (typeof param !== 'object' || param === null) {
    return null;
  }
  const seriesIndex = (param as { seriesIndex?: unknown }).seriesIndex;
  const dataIndex = (param as { dataIndex?: unknown }).dataIndex;
  if (!isNonNegativeInteger(seriesIndex) || !isNonNegativeInteger(dataIndex)) {
    return null;
  }
  return { seriesIndex, dataIndex };
}

function unitSuffixOf(axis: RenderXAxis): string {
  return axis.unit === undefined || axis.unit.length === 0 ? '' : ` (${axis.unit})`;
}

/**
 * Builds the formatter set for one RenderModel.
 *
 * Every `Intl` formatter is created once per option build, never per point.
 */
export function createChartFormatters(
  model: RenderModel,
  options: ChartFormatterOptions = {},
): ChartFormatters {
  const locale = options.locale ?? DEFAULT_CHART_LOCALE;
  const digits = clampDigits(model.style.numberDigits);
  const axisNumber = new Intl.NumberFormat(locale, {
    maximumFractionDigits: MAX_AXIS_FRACTION_DIGITS,
    useGrouping: true,
  });
  const yNumber = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
  });
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const axis = model.x;
  const unitSuffix = unitSuffixOf(axis);

  function formatXValue(value: number | string | undefined): string {
    if (value === undefined) {
      return '';
    }
    if (axis.type === 'time') {
      return typeof value === 'number' && Number.isFinite(value)
        ? dateTime.format(value)
        : String(value);
    }
    if (axis.type === 'number') {
      return typeof value === 'number' && Number.isFinite(value)
        ? axisNumber.format(value)
        : String(value);
    }
    return String(value);
  }

  function formatYValue(value: number): string {
    return Number.isFinite(value) ? yNumber.format(value) : '';
  }

  function formatTooltip(params: unknown): string {
    const rawParams = Array.isArray(params) ? params : [params];
    const anchors = rawParams
      .map((param) => readAnchor(param))
      .filter((anchor): anchor is TooltipAnchor => anchor !== null);
    const first = anchors[0];
    if (first === undefined) {
      return '';
    }
    const headerValue = axis.values[first.dataIndex];
    if (headerValue === undefined) {
      return '';
    }

    const rows: string[] = [];
    for (const anchor of anchors) {
      const series = model.series[anchor.seriesIndex];
      if (series === undefined) {
        continue;
      }
      const value = series.values[anchor.dataIndex];
      if (value === undefined || value === null || !Number.isFinite(value)) {
        continue;
      }
      const color = series.color ?? paletteColor(model, anchor.seriesIndex) ?? 'currentColor';
      rows.push(
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${escapeHtmlText(color)}"></span>` +
          `${escapeHtmlText(series.name)}: ${escapeHtmlText(formatYValue(value))}`,
      );
    }
    if (rows.length === 0) {
      return '';
    }

    const header = `${formatXValue(headerValue)}${unitSuffix}`;
    return [escapeHtmlText(header), ...rows].join('<br/>');
  }

  return {
    formatAxisNumber: (value: number): string =>
      Number.isFinite(value) ? axisNumber.format(value) : '',
    formatXValue,
    formatYValue,
    formatTooltip,
  };
}
