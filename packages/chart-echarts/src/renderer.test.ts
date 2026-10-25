// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RenderModel } from '@curve/chart-model';

import { activeChartInstanceCount, createChartRenderer } from './renderer';

import type { ChartRenderer, ChartRendererOptions } from './renderer';

interface FakeChart {
  setOption: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  getDataURL: ReturnType<typeof vi.fn>;
}

const runtime = vi.hoisted(() => {
  const charts: FakeChart[] = [];
  const init = vi.fn((_container: HTMLElement, _theme?: unknown, _options?: unknown) => {
    const chart: FakeChart = {
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      getDataURL: vi.fn(() => 'data:image/png;base64,AAAA'),
    };
    charts.push(chart);
    return chart;
  });
  return { charts, init, use: vi.fn() };
});

vi.mock('echarts/core', () => ({ init: runtime.init, use: runtime.use }));

function makeModel(overrides: Partial<RenderModel> = {}): RenderModel {
  return {
    kind: 'line',
    x: { values: [1, 2, 3], type: 'number', label: 'Time', unit: 's' },
    series: [
      { id: 'col_a', name: 'Temp', values: [10, null, 30], color: '#2563eb' },
      { id: 'col_b', name: 'Humidity', values: [1, 2, 3], color: '#0d9488' },
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
    meta: { sampled: false, sourcePoints: 5, renderedPoints: 5, warnings: [] },
    ...overrides,
  };
}

function emptyModel(): RenderModel {
  return makeModel({
    series: [],
    meta: { sampled: false, sourcePoints: 0, renderedPoints: 0, warnings: [] },
  });
}

const renderers: ChartRenderer[] = [];

function makeRenderer(options?: ChartRendererOptions): ChartRenderer {
  const renderer = createChartRenderer(options);
  renderers.push(renderer);
  return renderer;
}

function makeContainer(): HTMLElement {
  return document.createElement('div');
}

function chartAt(index: number): FakeChart {
  const chart = runtime.charts[index];
  if (chart === undefined) {
    throw new Error(`No fake ECharts instance at index ${String(index)}.`);
  }
  return chart;
}

afterEach(() => {
  for (const renderer of renderers) {
    renderer.dispose();
  }
  renderers.length = 0;
  runtime.charts.length = 0;
  runtime.init.mockClear();
});

describe('createChartRenderer — mounting', () => {
  it('registers ECharts modules once and creates a single instance', () => {
    const first = makeRenderer();
    const container = makeContainer();
    expect(first.state).toBe('idle');

    const outcome = first.render(container, makeModel());
    expect(outcome).toEqual({ ok: true, state: 'ready' });
    expect(first.state).toBe('ready');
    expect(runtime.init).toHaveBeenCalledTimes(1);
    const call = runtime.init.mock.calls[0];
    expect(call?.[0]).toBe(container);
    expect(call?.[2]).toEqual({ renderer: 'canvas' });
    expect(chartAt(0).setOption).toHaveBeenCalledTimes(1);
    expect(chartAt(0).setOption.mock.calls[0]?.[1]).toBeUndefined();
    expect(activeChartInstanceCount()).toBe(1);

    makeRenderer().render(makeContainer(), makeModel());
    expect(runtime.use).toHaveBeenCalledTimes(1);
  });

  it('re-mounts instead of leaking when render is called again', () => {
    const renderer = makeRenderer();
    const first = makeContainer();
    const second = makeContainer();

    renderer.render(first, makeModel());
    renderer.render(first, makeModel());
    expect(chartAt(0).dispose).toHaveBeenCalledTimes(1);
    expect(chartAt(1).dispose).not.toHaveBeenCalled();
    expect(activeChartInstanceCount()).toBe(1);

    renderer.render(second, makeModel());
    expect(chartAt(1).dispose).toHaveBeenCalledTimes(1);
    expect(activeChartInstanceCount()).toBe(1);
    expect(runtime.init).toHaveBeenCalledTimes(3);
  });

  it('does not create an instance for empty data', () => {
    const renderer = makeRenderer();
    expect(renderer.render(makeContainer(), emptyModel())).toEqual({ ok: true, state: 'empty' });
    expect(renderer.state).toBe('empty');
    expect(runtime.init).not.toHaveBeenCalled();
    expect(activeChartInstanceCount()).toBe(0);
  });

  it('disposes the instance when the data becomes empty', () => {
    const renderer = makeRenderer();
    const empty = emptyModel();
    expect(renderer.render(makeContainer(), makeModel())).toEqual({ ok: true, state: 'ready' });
    expect(renderer.update(empty)).toEqual({ ok: true, state: 'empty' });
    expect(chartAt(0).dispose).toHaveBeenCalledTimes(1);
    expect(activeChartInstanceCount()).toBe(0);
    expect(renderer.state).toBe('empty');
  });

  it('mounts again after empty data was rendered', () => {
    const renderer = makeRenderer();
    const container = makeContainer();
    renderer.render(container, emptyModel());
    expect(renderer.update(makeModel())).toEqual({ ok: true, state: 'ready' });
    expect(runtime.init).toHaveBeenCalledTimes(1);
    expect(activeChartInstanceCount()).toBe(1);
  });
});

describe('createChartRenderer — updating', () => {
  it('merges updates into the existing instance', () => {
    const renderer = makeRenderer();
    renderer.render(makeContainer(), makeModel());
    const chart = chartAt(0);

    const next = makeModel({ style: { ...makeModel().style, background: '#1e1e1e' } });
    expect(renderer.update(next)).toEqual({ ok: true, state: 'ready' });
    expect(runtime.init).toHaveBeenCalledTimes(1);
    expect(chart.setOption).toHaveBeenCalledTimes(2);
    expect(chart.setOption.mock.calls[1]?.[1]).toEqual({
      notMerge: false,
      replaceMerge: ['series', 'xAxis', 'yAxis'],
    });
    expect(activeChartInstanceCount()).toBe(1);
  });

  it('reports an error when updating before any container was mounted', () => {
    const renderer = makeRenderer();
    const outcome = renderer.update(makeModel());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error('expected the update to fail');
    }
    expect(outcome.error.code).toBe('E_UNKNOWN');
    expect(renderer.state).toBe('error');
    expect(runtime.init).not.toHaveBeenCalled();
  });

  it('captures instance creation failures and leaves no live instance', () => {
    const renderer = makeRenderer();
    runtime.init.mockImplementationOnce(() => {
      throw new Error('canvas unavailable');
    });
    const outcome = renderer.render(makeContainer(), makeModel());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error('expected the render to fail');
    }
    expect(outcome.error).toMatchObject({ code: 'E_UNKNOWN', message: 'canvas unavailable' });
    expect(renderer.state).toBe('error');
    expect(activeChartInstanceCount()).toBe(0);

    expect(renderer.render(makeContainer(), makeModel())).toEqual({ ok: true, state: 'ready' });
    expect(activeChartInstanceCount()).toBe(1);
  });

  it('captures option failures and disposes the instance', () => {
    const renderer = makeRenderer();
    runtime.init.mockImplementationOnce(() => {
      const chart: FakeChart = {
        setOption: vi.fn(() => {
          throw new Error('bad option');
        }),
        resize: vi.fn(),
        dispose: vi.fn(),
        getDataURL: vi.fn(),
      };
      runtime.charts.push(chart);
      return chart;
    });

    const outcome = renderer.render(makeContainer(), makeModel());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error('expected the render to fail');
    }
    expect(outcome.error.code).toBe('E_UNKNOWN');
    expect(chartAt(0).dispose).toHaveBeenCalledTimes(1);
    expect(activeChartInstanceCount()).toBe(0);
  });

  it('captures update failures, falls back to the generic message and disposes', () => {
    const renderer = makeRenderer();
    renderer.render(makeContainer(), makeModel());
    const chart = chartAt(0);
    chart.setOption.mockImplementationOnce(() => {
      throw 'not an error object';
    });

    const outcome = renderer.update(makeModel());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error('expected the update to fail');
    }
    expect(outcome.error).toMatchObject({
      code: 'E_UNKNOWN',
      message: 'The chart option could not be applied.',
    });
    expect(chart.dispose).toHaveBeenCalledTimes(1);
    expect(activeChartInstanceCount()).toBe(0);
    expect(renderer.state).toBe('error');
  });
});

describe('createChartRenderer — resize and dispose', () => {
  it('delegates resize to the instance and is a no-op before mounting', () => {
    const renderer = makeRenderer();
    expect(() => renderer.resize()).not.toThrow();
    renderer.render(makeContainer(), makeModel());
    renderer.resize();
    expect(chartAt(0).resize).toHaveBeenCalledTimes(1);
    expect(chartAt(0).setOption).toHaveBeenCalledTimes(1);
  });

  it('disposes exactly once and can be re-mounted afterwards', () => {
    const renderer = makeRenderer();
    renderer.render(makeContainer(), makeModel());
    renderer.dispose();
    expect(chartAt(0).dispose).toHaveBeenCalledTimes(1);
    expect(activeChartInstanceCount()).toBe(0);
    expect(renderer.state).toBe('idle');

    renderer.dispose();
    expect(chartAt(0).dispose).toHaveBeenCalledTimes(1);

    renderer.render(makeContainer(), makeModel());
    expect(activeChartInstanceCount()).toBe(1);
  });
});

describe('createChartRenderer — toPNG', () => {
  it('fails with E_EXPORT_FAILED before anything was rendered', () => {
    const outcome = makeRenderer().toPNG();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error('expected the export to fail');
    }
    expect(outcome.error.code).toBe('E_EXPORT_FAILED');
  });

  it('exports a 2x PNG with a transparent background by default', () => {
    const renderer = makeRenderer();
    renderer.render(makeContainer(), makeModel());
    const chart = chartAt(0);
    const outcome = renderer.toPNG();
    expect(outcome).toEqual({ ok: true, dataUrl: 'data:image/png;base64,AAAA' });
    expect(chart.getDataURL).toHaveBeenCalledWith({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: 'transparent',
      excludeComponents: ['toolbox'],
    });
  });

  it('maps light/dark backgrounds to the chart constants and clamps the scale', () => {
    const renderer = makeRenderer();
    renderer.render(makeContainer(), makeModel());
    const chart = chartAt(0);

    renderer.toPNG({ scale: 3, background: 'light' });
    expect(chart.getDataURL).toHaveBeenLastCalledWith(
      expect.objectContaining({ pixelRatio: 3, backgroundColor: '#ffffff' }),
    );

    renderer.toPNG({ scale: 9, background: 'dark' });
    expect(chart.getDataURL).toHaveBeenLastCalledWith(
      expect.objectContaining({ pixelRatio: 4, backgroundColor: '#1e1e1e' }),
    );

    renderer.toPNG({ scale: 0 });
    expect(chart.getDataURL).toHaveBeenLastCalledWith(
      expect.objectContaining({ pixelRatio: 2, backgroundColor: 'transparent' }),
    );
  });

  it('reports export failures', () => {
    const renderer = makeRenderer();
    renderer.render(makeContainer(), makeModel());
    const chart = chartAt(0);

    chart.getDataURL.mockImplementationOnce(() => {
      throw new Error('canvas lost');
    });
    const thrown = renderer.toPNG();
    expect(thrown.ok).toBe(false);
    if (thrown.ok) {
      throw new Error('expected the export to fail');
    }
    expect(thrown.error).toMatchObject({ code: 'E_EXPORT_FAILED' });
    expect(thrown.error.message).toContain('canvas lost');

    chart.getDataURL.mockReturnValueOnce('');
    expect(renderer.toPNG().ok).toBe(false);

    chart.getDataURL.mockImplementationOnce(() => {
      throw 'not an error object';
    });
    const fallback = renderer.toPNG();
    expect(fallback.ok).toBe(false);
    if (fallback.ok) {
      throw new Error('expected the export to fail');
    }
    expect(fallback.error.message).toBe('The chart PNG export failed.');
  });
});
