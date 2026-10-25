import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import { init, use as registerWithECharts } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';

import type { RenderModel } from '@curve/chart-model';

import { toEChartsOption } from './option';

registerWithECharts([
  LineChart,
  ScatterChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  ToolboxComponent,
  SVGRenderer,
]);

function makeModel(overrides: Partial<RenderModel> = {}): RenderModel {
  return {
    kind: 'line',
    x: { values: [1, 2, 3, 4, 5], type: 'number', label: 'Time', unit: 's' },
    series: [{ id: 'col_a', name: 'Temp', values: [1, 2, null, 4, 5], color: '#2563eb' }],
    style: {
      palette: ['#2563eb'],
      background: '#ffffff',
      showGrid: true,
      lineWidth: 2,
      smooth: false,
      showSymbol: true,
      legend: 'top',
      numberDigits: 2,
      yStartAtZero: false,
    },
    meta: { sampled: false, sourcePoints: 4, renderedPoints: 4, warnings: [] },
    ...overrides,
  };
}

function sampledModel(): RenderModel {
  return makeModel({
    meta: { sampled: true, sourcePoints: 4, renderedPoints: 4, warnings: [] },
  });
}

/** `M` command counts of the line-series paths (fill="none" + the series colour). */
function lineSubpathCounts(svg: string): number[] {
  const counts: number[] = [];
  for (const match of svg.matchAll(/<path\b[^>]*>/gu)) {
    const tag = match[0];
    if (
      !tag.includes('fill="none"') ||
      !tag.includes('stroke="#2563eb"') ||
      !tag.includes('stroke-width="2"')
    ) {
      continue;
    }
    const path = /d="([^"]*)"/u.exec(tag)?.[1] ?? '';
    counts.push((path.match(/M/gu) ?? []).length);
  }
  return counts;
}

describe('ECharts SVG server rendering (option validity)', () => {
  it('breaks a real gap and connects the same gap only once the model was sampled', () => {
    const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 400 });
    try {
      chart.setOption(toEChartsOption(makeModel()));
      const gapSvg = chart.renderToSVGString();

      chart.setOption(toEChartsOption(sampledModel()), {
        notMerge: false,
        replaceMerge: ['series', 'xAxis', 'yAxis'],
      });
      const connectedSvg = chart.renderToSVGString();

      expect(gapSvg).toContain('<svg');
      expect(gapSvg).not.toContain('NaN');
      expect(connectedSvg).not.toContain('NaN');
      expect(lineSubpathCounts(gapSvg)).toEqual([2]);
      expect(lineSubpathCounts(connectedSvg)).toEqual([1]);
    } finally {
      chart.dispose();
    }
  });

  it('renders every chart kind and axis type without invalid data', () => {
    const timeStart = Date.UTC(2024, 0, 1);
    const models: RenderModel[] = [
      makeModel({ kind: 'scatter' }),
      makeModel({ kind: 'bar' }),
      makeModel({
        x: { values: ['A', 'B', 'C', 'D', 'E'], type: 'category', label: 'Site' },
      }),
      makeModel({
        x: {
          values: [
            timeStart,
            timeStart + 1000,
            timeStart + 2000,
            timeStart + 3000,
            timeStart + 4000,
          ],
          type: 'time',
          label: 'Day',
        },
      }),
    ];

    const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 400 });
    try {
      for (const model of models) {
        chart.setOption(toEChartsOption(model), { notMerge: true });
        const svg = chart.renderToSVGString();
        expect(svg).toContain('<svg');
        expect(svg).not.toContain('NaN');
      }
    } finally {
      chart.dispose();
    }
  });
});
