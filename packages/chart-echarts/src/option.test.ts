import { describe, expect, it } from 'vitest';

import type { RenderModel } from '@curve/chart-model';
import { CHART_PALETTES } from '@curve/chart-model';

import { isEmptyModel, toEChartsOption } from './option';

import type { ChartOption } from './option';

type ChartPaletteId = keyof typeof CHART_PALETTES;

interface AxisView {
  type?: string;
  data?: unknown[];
  name?: string;
  boundaryGap?: boolean;
  scale?: boolean;
  nameLocation?: string;
  nameRotate?: number;
  nameGap?: number;
  splitLine?: { show?: boolean };
  axisLabel?: { hideOverlap?: boolean; formatter?: unknown };
}

interface SeriesView {
  type?: string;
  name?: string;
  data?: unknown;
  lineStyle?: { width?: number; color?: string };
  itemStyle?: { color?: string };
  smooth?: boolean;
  showSymbol?: boolean;
  connectNulls?: boolean;
  symbolSize?: number;
}

interface OptionView {
  animation?: boolean;
  backgroundColor?: string;
  color?: string[];
  grid?: { left?: number; right?: number; top?: number };
  xAxis?: AxisView;
  yAxis?: AxisView;
  series?: SeriesView[];
  legend?: {
    show?: boolean;
    type?: string;
    top?: unknown;
    right?: unknown;
    bottom?: unknown;
    left?: unknown;
    orient?: string;
  };
  tooltip?: { trigger?: string; renderMode?: string; confine?: boolean; formatter?: unknown };
  dataZoom?: { type?: string; bottom?: number; height?: number }[];
  toolbox?: { right?: number; feature?: { dataZoom?: { yAxisIndex?: string } } };
}

function viewOf(option: ChartOption): OptionView {
  return option as unknown as OptionView;
}

function baseStyle(): RenderModel['style'] {
  return {
    palette: [...CHART_PALETTES.default],
    background: '#ffffff',
    showGrid: true,
    lineWidth: 2,
    smooth: false,
    showSymbol: true,
    legend: 'top',
    numberDigits: 2,
    yStartAtZero: false,
    connectNulls: false,
  };
}

function makeModel(overrides: Partial<RenderModel> = {}): RenderModel {
  const palette = baseStyle().palette;
  return {
    kind: 'line',
    x: { values: [1, 2, 3, 4], type: 'number', label: 'Time', unit: 's' },
    series: [
      { id: 'col_a', name: 'Temp', values: [10, 12, null, 15], color: palette[0] },
      { id: 'col_b', name: 'Humidity', values: [1.5, null, 3.25, 4], color: palette[1] },
    ],
    style: baseStyle(),
    meta: { sampled: false, sourcePoints: 6, renderedPoints: 6, warnings: [] },
    ...overrides,
  };
}

function modelWithPalette(paletteId: ChartPaletteId, background = '#ffffff'): RenderModel {
  const palette = [...CHART_PALETTES[paletteId]];
  return makeModel({
    style: { ...baseStyle(), palette, background },
    series: [
      { id: 'col_a', name: 'Temp', values: [10, 12, null, 15], color: palette[0] },
      { id: 'col_b', name: 'Humidity', values: [1.5, null, 3.25, 4], color: palette[1] },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* Option golden snapshots (TASKS T4.3 acceptance)                            */
/* -------------------------------------------------------------------------- */

describe('ECharts option golden snapshots', () => {
  it.each<ChartPaletteId>(['default', 'muted', 'vivid', 'colorblind'])(
    'matches the %s palette on a light background',
    (paletteId) => {
      expect(toEChartsOption(modelWithPalette(paletteId))).toMatchSnapshot();
    },
  );

  it('matches a dark background', () => {
    expect(toEChartsOption(modelWithPalette('default', '#1e1e1e'))).toMatchSnapshot();
  });

  it('matches a sampled multi-series model with gaps', () => {
    const model = makeModel({
      meta: { sampled: true, sourcePoints: 6, renderedPoints: 4, warnings: [] },
      style: {
        ...baseStyle(),
        lineWidth: 3,
        smooth: true,
        showSymbol: false,
        connectNulls: true,
      },
    });
    expect(toEChartsOption(model)).toMatchSnapshot();
  });
});

/* -------------------------------------------------------------------------- */
/* Axes and data                                                              */
/* -------------------------------------------------------------------------- */

describe('toEChartsOption — axes and data', () => {
  it('maps a number x axis to [x, y] pairs and keeps nulls as empty points', () => {
    const view = viewOf(toEChartsOption(makeModel()));
    expect(view.xAxis?.type).toBe('value');
    expect(view.xAxis?.name).toBe('Time (s)');
    expect(view.series?.[0]?.data).toEqual([
      [1, 10],
      [2, 12],
      [3, null],
      [4, 15],
    ]);
  });

  it('maps a category x axis to aligned values plus xAxis.data', () => {
    const view = viewOf(
      toEChartsOption(
        makeModel({ x: { values: ['A', 'B', 'C', 'D'], type: 'category', label: 'Site' } }),
      ),
    );
    expect(view.xAxis?.type).toBe('category');
    expect(view.xAxis?.data).toEqual(['A', 'B', 'C', 'D']);
    expect(view.xAxis?.boundaryGap).toBe(true);
    expect(view.xAxis?.name).toBe('Site');
    expect(view.series?.[0]?.data).toEqual([10, 12, null, 15]);
  });

  it('maps a time x axis to epoch-ms pairs', () => {
    const start = Date.UTC(2024, 0, 1);
    const values = [start, start + 1000, start + 2000, start + 3000];
    const view = viewOf(toEChartsOption(makeModel({ x: { values, type: 'time', label: 'Day' } })));
    expect(view.xAxis?.type).toBe('time');
    expect(view.xAxis?.name).toBe('Day');
    expect(view.series?.[0]?.data).toEqual([
      [values[0], 10],
      [values[1], 12],
      [values[2], null],
      [values[3], 15],
    ]);
  });

  it('honours yStartAtZero through yAxis.scale', () => {
    expect(viewOf(toEChartsOption(makeModel())).yAxis?.scale).toBe(true);
    const zeroBased = makeModel({ style: { ...baseStyle(), yStartAtZero: true } });
    expect(viewOf(toEChartsOption(zeroBased)).yAxis?.scale).toBe(false);
  });

  it('names the value axis only when the model carries a y label', () => {
    const unnamed = viewOf(toEChartsOption(makeModel()));
    expect(unnamed.yAxis?.name).toBeUndefined();
    expect(unnamed.grid?.left).toBe(64);

    const named = viewOf(toEChartsOption(makeModel({ y: { label: 'Load (kW)' } })));
    expect(named.yAxis).toMatchObject({
      name: 'Load (kW)',
      nameLocation: 'middle',
      nameRotate: 90,
      nameGap: 48,
    });
    expect(named.grid?.left).toBe(80);
  });

  it('hides split lines when showGrid is false and never draws category split lines', () => {
    const hidden = makeModel({ style: { ...baseStyle(), showGrid: false } });
    const hiddenView = viewOf(toEChartsOption(hidden));
    expect(hiddenView.yAxis?.splitLine?.show).toBe(false);
    expect(hiddenView.xAxis?.splitLine?.show).toBe(false);

    const shown = viewOf(toEChartsOption(makeModel()));
    expect(shown.yAxis?.splitLine?.show).toBe(true);
    expect(shown.xAxis?.splitLine?.show).toBe(true);

    const category = viewOf(
      toEChartsOption(
        makeModel({ x: { values: ['A', 'B', 'C', 'D'], type: 'category', label: 'Site' } }),
      ),
    );
    expect(category.xAxis?.splitLine?.show).toBe(false);
    expect(category.xAxis?.axisLabel?.hideOverlap).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Series, theme and interactions                                             */
/* -------------------------------------------------------------------------- */

describe('toEChartsOption — series', () => {
  it('maps a line series with width, colour, smooth and symbol options', () => {
    const view = viewOf(toEChartsOption(makeModel()));
    expect(view.series?.[0]).toMatchObject({
      type: 'line',
      name: 'Temp',
      smooth: false,
      showSymbol: true,
      connectNulls: false,
      lineStyle: { width: 2, color: CHART_PALETTES.default[0] },
      itemStyle: { color: CHART_PALETTES.default[0] },
    });
    expect(view.series?.[0]).not.toHaveProperty('sampling');
  });

  it('maps a scatter series without connectNulls', () => {
    const view = viewOf(toEChartsOption(makeModel({ kind: 'scatter' })));
    expect(view.series?.[0]?.type).toBe('scatter');
    expect(view.series?.[0]?.symbolSize).toBe(6);
    expect(view.series?.[0]).not.toHaveProperty('connectNulls');
  });

  it('maps a bar series', () => {
    const view = viewOf(toEChartsOption(makeModel({ kind: 'bar' })));
    expect(view.series?.[0]?.type).toBe('bar');
  });

  it('connects nulls only when the model asks for it', () => {
    expect(viewOf(toEChartsOption(makeModel())).series?.[0]?.connectNulls).toBe(false);
    const connected = makeModel({ style: { ...baseStyle(), connectNulls: true } });
    expect(viewOf(toEChartsOption(connected)).series?.[0]?.connectNulls).toBe(true);
  });

  it('falls back to the palette order when a series has no explicit colour', () => {
    const palette = [...CHART_PALETTES.vivid];
    const model = makeModel({
      style: { ...baseStyle(), palette },
      series: [
        { id: 'col_a', name: 'A', values: [1, null, null, null] },
        { id: 'col_b', name: 'B', values: [null, 2, null, null] },
      ],
    });
    const view = viewOf(toEChartsOption(model));
    expect(view.series?.[0]?.itemStyle?.color).toBe(palette[0]);
    expect(view.series?.[1]?.itemStyle?.color).toBe(palette[1]);
  });
});

describe('toEChartsOption — theme and interactions', () => {
  it('disables animation for deterministic rendering', () => {
    expect(viewOf(toEChartsOption(makeModel())).animation).toBe(false);
  });

  it('applies the background, palette and light/dark theme colours', () => {
    const light = viewOf(toEChartsOption(makeModel()));
    expect(light.backgroundColor).toBe('#ffffff');
    expect(light.color).toEqual([...CHART_PALETTES.default]);

    const dark = viewOf(
      toEChartsOption(makeModel({ style: { ...baseStyle(), background: '#1e1e1e' } })),
    );
    expect(dark.backgroundColor).toBe('#1e1e1e');
    expect(dark.xAxis?.axisLabel?.hideOverlap).toBe(true);
  });

  it('places the legend and reserves room for a right-hand legend', () => {
    const top = viewOf(toEChartsOption(makeModel()));
    expect(top.legend?.show).toBe(true);
    expect(top.legend?.type).toBe('scroll');
    expect(top.legend?.top).toBe(8);
    expect(top.legend?.left).toBe('center');

    const right = viewOf(
      toEChartsOption(makeModel({ style: { ...baseStyle(), legend: 'right' } })),
    );
    expect(right.legend?.right).toBe(8);
    expect(right.legend?.orient).toBe('vertical');
    expect(right.toolbox?.right).toBe(136);

    const none = viewOf(toEChartsOption(makeModel({ style: { ...baseStyle(), legend: 'none' } })));
    expect(none.legend?.show).toBe(false);

    const bottom = viewOf(
      toEChartsOption(makeModel({ style: { ...baseStyle(), legend: 'bottom' } })),
    );
    expect(bottom.legend?.bottom).toBe(32);
    expect(bottom.legend?.left).toBe('center');
  });

  it('omits the axis name when the model has no label', () => {
    const view = viewOf(
      toEChartsOption(makeModel({ x: { values: [1, 2, 3, 4], type: 'number' } })),
    );
    expect(view.xAxis?.name).toBeUndefined();
  });

  it('omits series colours when neither the series nor the palette provide one', () => {
    const model = makeModel({
      style: { ...baseStyle(), palette: [] },
      series: [{ id: 'col_a', name: 'A', values: [1, null, null, null] }],
    });
    const view = viewOf(toEChartsOption(model));
    expect(view.series?.[0]?.itemStyle).toBeUndefined();
    expect(view.series?.[0]?.lineStyle).toEqual({ width: 2 });
  });

  it('configures a formatted tooltip, dataZoom and box zoom', () => {
    const view = viewOf(toEChartsOption(makeModel()));
    expect(view.tooltip?.trigger).toBe('axis');
    expect(view.tooltip?.renderMode).toBe('html');
    expect(view.tooltip?.confine).toBe(true);
    expect(typeof view.tooltip?.formatter).toBe('function');
    expect(view.dataZoom?.map((zoom) => zoom.type)).toEqual(['inside', 'slider']);
    expect(view.dataZoom?.[1]).toMatchObject({ height: 16, bottom: 8 });
    expect(view.toolbox?.feature?.dataZoom?.yAxisIndex).toBe('none');

    const scatter = viewOf(toEChartsOption(makeModel({ kind: 'scatter' })));
    expect(scatter.tooltip?.trigger).toBe('item');
  });
});

describe('isEmptyModel', () => {
  it('is true without series, without x values or without any non-null point', () => {
    expect(isEmptyModel(makeModel({ series: [] }))).toBe(true);
    expect(isEmptyModel(makeModel({ x: { values: [], type: 'number' } }))).toBe(true);
    expect(
      isEmptyModel(
        makeModel({ meta: { sampled: false, sourcePoints: 0, renderedPoints: 0, warnings: [] } }),
      ),
    ).toBe(true);
  });

  it('is false when at least one point is renderable', () => {
    expect(isEmptyModel(makeModel())).toBe(false);
  });
});
