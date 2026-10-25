import { describe, expect, it } from 'vitest';

import type { RenderModel } from '@curve/chart-model';

import { createChartFormatters, escapeHtmlText } from './format';

function makeModel(overrides: Partial<RenderModel> = {}): RenderModel {
  return {
    kind: 'line',
    x: { values: [1, 2, 3, 4], type: 'number', label: 'Time', unit: 's' },
    series: [
      { id: 'col_a', name: 'Temp <A>', values: [1.5, null, 3.25, null], color: '#2563eb' },
      {
        id: 'col_b',
        name: 'Humidity & "B"',
        values: [10, 20, null, null],
        color: '#0d9488',
      },
    ],
    style: {
      palette: ['#2563eb', '#0d9488'],
      background: '#ffffff',
      showGrid: true,
      lineWidth: 2,
      smooth: false,
      showSymbol: true,
      legend: 'top',
      numberDigits: 2,
      yStartAtZero: false,
      connectNulls: false,
    },
    meta: { sampled: false, sourcePoints: 4, renderedPoints: 4, warnings: [] },
    ...overrides,
  };
}

describe('chart value formatting', () => {
  it('formats axis numbers with grouping and at most four decimals', () => {
    const formatters = createChartFormatters(makeModel());
    expect(formatters.formatAxisNumber(1234.5)).toBe('1,234.5');
    expect(formatters.formatAxisNumber(0.123456)).toBe('0.1235');
    expect(formatters.formatAxisNumber(-42)).toBe('-42');
  });

  it('formats tooltip x numbers with grouping and up to four decimals', () => {
    const formatters = createChartFormatters(makeModel());
    expect(formatters.formatXValue(1234.5678)).toBe('1,234.5678');
    expect(formatters.formatXValue(0)).toBe('0');
  });

  it('formats y values with the configured fixed precision', () => {
    const formatters = createChartFormatters(makeModel());
    expect(formatters.formatYValue(1.5)).toBe('1.50');
    expect(formatters.formatYValue(1234.567)).toBe('1,234.57');
  });

  it('honours numberDigits = 0 for y values', () => {
    const formatters = createChartFormatters(
      makeModel({
        style: { ...makeModel().style, numberDigits: 0 },
      }),
    );
    expect(formatters.formatYValue(1.5)).toBe('2');
    expect(formatters.formatYValue(1234.5)).toBe('1,235');
  });

  it('uses the requested locale', () => {
    const localized = makeModel({ style: { ...makeModel().style, numberDigits: 1 } });
    const formatters = createChartFormatters(localized, { locale: 'de-DE' });
    expect(formatters.formatYValue(1234.5)).toBe('1.234,5');
  });

  it('formats time axes as a localised date and time', () => {
    const formatters = createChartFormatters(
      makeModel({
        x: {
          values: [Date.UTC(2024, 6, 1, 12, 0, 0)],
          type: 'time',
          label: 'Day',
        },
      }),
    );
    expect(formatters.formatXValue(Date.UTC(2024, 6, 1, 12, 0, 0))).toContain('2024');
  });

  it('formats category axes as their raw label', () => {
    const formatters = createChartFormatters(
      makeModel({ x: { values: ['Alpha', 'Beta'], type: 'category', label: 'Site' } }),
    );
    expect(formatters.formatXValue('Alpha')).toBe('Alpha');
    expect(formatters.formatXValue(undefined)).toBe('');
    expect(formatters.formatXValue(12)).toBe('12');
  });
});

describe('chart tooltip formatting', () => {
  it('renders an axis tooltip header with the x unit and one row per non-null series', () => {
    const tooltip = createChartFormatters(makeModel()).formatTooltip([
      { seriesIndex: 0, dataIndex: 0 },
      { seriesIndex: 1, dataIndex: 0 },
    ]);

    expect(tooltip).toContain('1 (s)');
    expect(tooltip).toContain('<br/>');
    expect(tooltip).toContain('Temp &lt;A&gt;');
    expect(tooltip).toContain('1.50');
    expect(tooltip).toContain('Humidity &amp; &quot;B&quot;');
    expect(tooltip).toContain('10.00');
    expect(tooltip).toContain('background:#2563eb');
    expect(tooltip).not.toContain('<A>');
  });

  it('omits null values from the tooltip', () => {
    const tooltip = createChartFormatters(makeModel()).formatTooltip([
      { seriesIndex: 0, dataIndex: 1 },
      { seriesIndex: 1, dataIndex: 1 },
    ]);

    expect(tooltip).toContain('2 (s)');
    expect(tooltip).toContain('Humidity');
    expect(tooltip).toContain('20.00');
    expect(tooltip).not.toContain('Temp');
  });

  it('returns an empty string when every series is null at that x', () => {
    expect(
      createChartFormatters(makeModel()).formatTooltip([
        { seriesIndex: 0, dataIndex: 3 },
        { seriesIndex: 1, dataIndex: 3 },
      ]),
    ).toBe('');
  });

  it('accepts the single-parameter item tooltip form', () => {
    const tooltip = createChartFormatters(makeModel()).formatTooltip({
      seriesIndex: 1,
      dataIndex: 0,
    });

    expect(tooltip).toContain('1 (s)');
    expect(tooltip).toContain('10.00');
  });

  it('ignores malformed or out-of-range tooltip parameters', () => {
    const formatters = createChartFormatters(makeModel());
    expect(formatters.formatTooltip(null)).toBe('');
    expect(formatters.formatTooltip('bad')).toBe('');
    expect(formatters.formatTooltip([])).toBe('');
    expect(formatters.formatTooltip([{ seriesIndex: '0', dataIndex: 0 }])).toBe('');
    expect(formatters.formatTooltip([{ seriesIndex: 9, dataIndex: 0 }])).toBe('');
    expect(formatters.formatTooltip([{ seriesIndex: 0, dataIndex: -1 }])).toBe('');
    expect(formatters.formatTooltip([{ seriesIndex: 0, dataIndex: 99 }])).toBe('');
  });

  it('falls back to the palette colour and then currentColor for tooltip markers', () => {
    const paletteOnly = makeModel({
      series: [
        { id: 'col_a', name: 'A', values: [1.5, null, null, null] },
        { id: 'col_b', name: 'B', values: [2.5, null, null, null] },
      ],
    });
    const withPalette = createChartFormatters(paletteOnly).formatTooltip([
      { seriesIndex: 1, dataIndex: 0 },
    ]);
    expect(withPalette).toContain('background:#0d9488');

    const noPalette = makeModel({
      style: { ...makeModel().style, palette: [] },
      series: [{ id: 'col_a', name: 'A', values: [1.5, null, null, null] }],
    });
    const withoutPalette = createChartFormatters(noPalette).formatTooltip([
      { seriesIndex: 0, dataIndex: 0 },
    ]);
    expect(withoutPalette).toContain('background:currentColor');
  });

  it('keeps the category header free of a unit when the axis has none', () => {
    const tooltip = createChartFormatters(
      makeModel({ x: { values: ['Alpha'], type: 'category', label: 'Site' } }),
    ).formatTooltip([{ seriesIndex: 0, dataIndex: 0 }]);

    expect(tooltip).toContain('Alpha');
    expect(tooltip).not.toContain('Alpha (');
  });
});

describe('escapeHtmlText', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtmlText(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    expect(escapeHtmlText('plain')).toBe('plain');
  });
});
