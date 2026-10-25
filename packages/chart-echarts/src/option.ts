/**
 * RenderModel → ECharts option (T4.3, SPEC §11.4, ADR-042 §2–§3).
 *
 * This is the only module in the workspace that builds an ECharts option. It is
 * pure and never reads tables, stores or ECharts runtime state; the renderer
 * (`renderer.ts`) only calls it. LTTB already happened in `@curve/chart-model`
 * (ADR-041), so no `series.sampling` is ever set here.
 */

import type { RenderModel, RenderSeries, RenderXAxis } from '@curve/chart-model';

import { createChartFormatters } from './format';
import { resolveChartTheme } from './theme';

import type { ChartFormatters } from './format';
import type { ChartTheme } from './theme';
import type { BarSeriesOption, LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  ToolboxComponentOption,
  TooltipComponentOption,
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';
import type { XAxisComponentOption, YAxisComponentOption } from 'echarts/types/dist/option';

export type ChartSeriesOption = LineSeriesOption | ScatterSeriesOption | BarSeriesOption;

/** The typed subset of the ECharts option the adapter is allowed to produce. */
export type ChartOption = ComposeOption<
  | ChartSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
  | ToolboxComponentOption
>;

export interface ChartOptionOptions {
  /** BCP 47 locale used by tooltip and axis formatting. */
  locale?: string;
}

/**
 * True when the model has nothing to draw, so the renderer must not create an
 * ECharts instance (SPEC §11.4, no data means no instance).
 */
export function isEmptyModel(model: RenderModel): boolean {
  return model.series.length === 0 || model.x.values.length === 0 || model.meta.sourcePoints === 0;
}

function axisNameOf(axis: RenderXAxis): string | undefined {
  const label = axis.label;
  if (label === undefined || label.length === 0) {
    return undefined;
  }
  return axis.unit === undefined || axis.unit.length === 0 ? label : `${label} (${axis.unit})`;
}

/** Value-axis name from `RenderModel.y` (T4.4, ADR-043); absent by default. */
function yAxisNameOf(model: RenderModel): string | undefined {
  const label = model.y?.label;
  if (label === undefined || label.length === 0) {
    return undefined;
  }
  return label;
}

function paletteColorOf(model: RenderModel, index: number): string | undefined {
  const palette = model.style.palette;
  if (palette.length === 0) {
    return undefined;
  }
  return palette[index % palette.length];
}

function numericCoordinate(value: number | string | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
}

/** RenderModel x types map onto ECharts axis types; `number` is ECharts `value`. */
function buildXAxis(
  model: RenderModel,
  theme: ChartTheme,
  axisLabelFormatter: (value: string | number) => string,
  name: string | undefined,
): XAxisComponentOption {
  const shared = {
    ...(name === undefined ? {} : { name }),
    nameLocation: 'middle' as const,
    nameGap: 30,
    nameTextStyle: { color: theme.mutedText },
    axisLine: { show: true, lineStyle: { color: theme.axisLine } },
    axisTick: { show: false },
    // Category axes would get one vertical line per category, which is noise.
    splitLine: {
      show: model.style.showGrid && model.x.type !== 'category',
      lineStyle: { color: theme.splitLine },
    },
  };
  const labels = { color: theme.mutedText, hideOverlap: true };

  if (model.x.type === 'category') {
    return {
      ...shared,
      type: 'category',
      data: model.x.values.map((value) => String(value)),
      boundaryGap: true,
      axisLabel: labels,
    };
  }
  if (model.x.type === 'time') {
    return { ...shared, type: 'time', axisLabel: labels };
  }
  return {
    ...shared,
    type: 'value',
    axisLabel: { ...labels, formatter: axisLabelFormatter },
  };
}

/** Axis label formatter accepted by both category (string) and value axes. */
function axisLabelFormatterOf(formatters: ChartFormatters): (value: string | number) => string {
  return (value: string | number): string =>
    typeof value === 'number' ? formatters.formatAxisNumber(value) : String(value);
}

/**
 * Category axes align values with `xAxis.data`; continuous axes use `[x, y]`
 * pairs so a null y becomes an empty point (a gap, never 0 or interpolated).
 */
function seriesDataOf(
  model: RenderModel,
  series: RenderSeries,
): (number | null)[] | [number, number | null][] {
  if (model.x.type === 'category') {
    return model.x.values.map((_value, index) => series.values[index] ?? null);
  }
  return model.x.values.map((xValue, index): [number, number | null] => [
    numericCoordinate(xValue),
    series.values[index] ?? null,
  ]);
}

function buildSeries(model: RenderModel, series: RenderSeries, index: number): ChartSeriesOption {
  const color = series.color ?? paletteColorOf(model, index);
  const itemStyle = color === undefined ? {} : { itemStyle: { color } };
  const data = seriesDataOf(model, series);

  if (model.kind === 'bar') {
    return {
      type: 'bar',
      name: series.name,
      data,
      ...itemStyle,
      emphasis: { focus: 'series' },
    };
  }
  if (model.kind === 'scatter') {
    return {
      type: 'scatter',
      name: series.name,
      data,
      symbolSize: 6,
      ...itemStyle,
      emphasis: { focus: 'series' },
    };
  }
  return {
    type: 'line',
    name: series.name,
    data,
    smooth: model.style.smooth,
    showSymbol: model.style.showSymbol,
    symbol: 'circle',
    symbolSize: 4,
    // ADR-042 §3/ADR-043: real gaps break the line; sampled and long-layout
    // models bridge nulls because those positions are representation artifacts.
    connectNulls: model.style.connectNulls,
    lineStyle: { width: model.style.lineWidth, ...(color === undefined ? {} : { color }) },
    ...itemStyle,
    emphasis: { focus: 'series' },
  };
}

function buildLegend(
  placement: RenderModel['style']['legend'],
  theme: ChartTheme,
): LegendComponentOption {
  if (placement === 'none') {
    return { show: false };
  }
  const base = { show: true, type: 'scroll' as const, textStyle: { color: theme.mutedText } };
  if (placement === 'right') {
    return { ...base, right: 8, top: 'middle', orient: 'vertical' };
  }
  if (placement === 'bottom') {
    return { ...base, bottom: 32, left: 'center' };
  }
  return { ...base, top: 8, left: 'center' };
}

/**
 * Builds the complete ECharts option for one RenderModel.
 *
 * The option is deterministic for a given model/locale: colours come from the
 * model's palette/series, theme colours from `resolveChartTheme(background)`.
 */
export function toEChartsOption(model: RenderModel, options: ChartOptionOptions = {}): ChartOption {
  const theme = resolveChartTheme(model.style.background);
  const formatters = createChartFormatters(model, { locale: options.locale });
  const axisLabelFormatter = axisLabelFormatterOf(formatters);
  const name = axisNameOf(model.x);
  const yName = yAxisNameOf(model);
  const legendRight = model.style.legend === 'right';

  const xAxis = buildXAxis(model, theme, axisLabelFormatter, name);

  const yAxis: YAxisComponentOption = {
    type: 'value',
    ...(yName === undefined
      ? {}
      : {
          name: yName,
          nameLocation: 'middle' as const,
          nameRotate: 90,
          nameGap: 48,
          nameTextStyle: { color: theme.mutedText },
        }),
    scale: !model.style.yStartAtZero,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: theme.mutedText,
      formatter: axisLabelFormatter,
    },
    splitLine: { show: model.style.showGrid, lineStyle: { color: theme.splitLine } },
  };

  const dataZoom: DataZoomComponentOption[] = [
    { type: 'inside' },
    {
      type: 'slider',
      height: 16,
      bottom: 8,
      borderColor: theme.axisLine,
      fillerColor: theme.zoomFill,
      textStyle: { color: theme.mutedText },
    },
  ];

  const toolbox: ToolboxComponentOption = {
    show: true,
    right: legendRight ? 136 : 8,
    top: 0,
    iconStyle: { borderColor: theme.mutedText },
    emphasis: { iconStyle: { borderColor: theme.text } },
    feature: { dataZoom: { yAxisIndex: 'none' } },
  };

  return {
    animation: false,
    backgroundColor: model.style.background,
    color: [...model.style.palette],
    textStyle: { color: theme.text },
    grid: {
      left: yName === undefined ? 64 : 80,
      right: legendRight ? 128 : 24,
      top: model.style.legend === 'top' ? 44 : 16,
      // Leaves room for the x-axis name above the dataZoom slider (T4.4).
      bottom: 72,
      containLabel: false,
    },
    legend: buildLegend(model.style.legend, theme),
    tooltip: {
      trigger: model.kind === 'scatter' ? 'item' : 'axis',
      renderMode: 'html',
      confine: true,
      backgroundColor: theme.tooltipBackground,
      borderColor: theme.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: theme.text },
      formatter: formatters.formatTooltip,
    },
    axisPointer: { lineStyle: { color: theme.axisLine } },
    xAxis,
    yAxis,
    dataZoom,
    toolbox,
    series: model.series.map((series, index) => buildSeries(model, series, index)),
  };
}
