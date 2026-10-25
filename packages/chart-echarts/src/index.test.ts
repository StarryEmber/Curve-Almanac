import { describe, expect, it } from 'vitest';

import * as chartEcharts from '@curve/chart-echarts';

describe('@curve/chart-echarts package skeleton', () => {
  it('exposes its package identity', () => {
    expect(chartEcharts.PACKAGE_NAME).toBe('@curve/chart-echarts');
  });

  it('exposes the ECharts adapter surface', () => {
    expect(typeof chartEcharts.createChartRenderer).toBe('function');
    expect(typeof chartEcharts.activeChartInstanceCount).toBe('function');
    expect(typeof chartEcharts.toEChartsOption).toBe('function');
    expect(typeof chartEcharts.isEmptyModel).toBe('function');
    expect(typeof chartEcharts.resolveChartTheme).toBe('function');
    expect(typeof chartEcharts.createChartFormatters).toBe('function');
    expect(chartEcharts.DEFAULT_CHART_LOCALE).toBe('en-US');
  });
});
