// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ChartInteractionAction,
  ChartInteractionState,
  ChartRenderer,
  ChartPngOutcome,
  ChartRenderOutcome,
} from '@curve/chart-echarts';
import type { RenderModel } from '@curve/chart-model';
import { createAppError } from '@curve/domain';

import { I18nProvider } from '../../i18n';

import { CHART_UPDATE_DEBOUNCE_MS, ChartCanvas } from './ChartCanvas';

import type { ChartCanvasHandle } from './ChartCanvas';
import type { ReactElement, RefObject } from 'react';
import type { Mock } from 'vitest';

vi.mock('@curve/chart-echarts', () => ({
  activeChartInstanceCount: vi.fn(() => 1),
  createChartRenderer: vi.fn(),
}));

interface FakeRenderer extends Omit<
  ChartRenderer,
  | 'render'
  | 'update'
  | 'resize'
  | 'toPNG'
  | 'dispose'
  | 'getInteractionState'
  | 'dispatchInteraction'
  | 'onInteractionChange'
> {
  render: Mock<(container: HTMLElement, model: RenderModel) => ChartRenderOutcome>;
  update: Mock<(model: RenderModel) => ChartRenderOutcome>;
  resize: Mock<() => void>;
  toPNG: Mock<() => ChartPngOutcome>;
  dispose: Mock<() => void>;
  getInteractionState: Mock<() => ChartInteractionState>;
  dispatchInteraction: Mock<(action: ChartInteractionAction) => void>;
  onInteractionChange: Mock<(listener: (state: ChartInteractionState) => void) => () => void>;
  /** Test seam: simulates an ECharts `datazoom`/`legendselectchanged` event. */
  emitInteraction: (state: ChartInteractionState) => void;
}

function fakeRenderer(
  renderOutcome: ChartRenderOutcome = { ok: true, state: 'ready' },
): FakeRenderer {
  const listeners = new Set<(state: ChartInteractionState) => void>();
  return {
    state: 'idle',
    render: vi.fn((_container: HTMLElement, _model: RenderModel) => renderOutcome),
    update: vi.fn((_model: RenderModel) => ({ ok: true as const, state: 'ready' as const })),
    resize: vi.fn(),
    toPNG: vi.fn(() => ({
      ok: false as const,
      error: createAppError('E_EXPORT_FAILED', 'n/a'),
    })),
    getInteractionState: vi.fn(() => ({ zoom: { start: 0, end: 100 }, hiddenSeries: [] })),
    dispatchInteraction: vi.fn(),
    onInteractionChange: vi.fn((listener: (state: ChartInteractionState) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    emitInteraction: (state: ChartInteractionState) => {
      for (const listener of [...listeners]) {
        listener(state);
      }
    },
    dispose: vi.fn(),
  };
}

function makeModel(name = 'A'): RenderModel {
  return {
    kind: 'line',
    x: { values: [1, 2], type: 'number', label: 'Time' },
    series: [{ id: 'col_a', name, values: [1, 2], color: '#2563eb' }],
    style: {
      palette: ['#2563eb'],
      background: '#ffffff',
      showGrid: true,
      lineWidth: 2,
      smooth: false,
      showSymbol: false,
      legend: 'top',
      numberDigits: 2,
      yStartAtZero: false,
      connectNulls: false,
    },
    meta: { sampled: false, sourcePoints: 2, renderedPoints: 2, warnings: [] },
  };
}

function mount(model: RenderModel, renderer: FakeRenderer): ReturnType<typeof render> {
  return render(
    <I18nProvider initialLocale="zh-CN">
      <ChartCanvas model={model} label="Chart" renderer={renderer} />
    </I18nProvider>,
  );
}

function mountWithHandle(
  model: RenderModel,
  renderer: FakeRenderer,
): { view: ReturnType<typeof render>; handle: RefObject<ChartCanvasHandle | null> } {
  const handle = createRef<ChartCanvasHandle>();
  const view = render(
    <I18nProvider initialLocale="zh-CN">
      <ChartCanvas ref={handle} model={model} label="Chart" renderer={renderer} />
    </I18nProvider>,
  );
  return { view, handle };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ChartCanvas', () => {
  it('mounts through render() once and never rebuilds the instance for model changes', () => {
    vi.useFakeTimers();
    const renderer = fakeRenderer();
    const modelA = makeModel('A');
    const view = mount(modelA, renderer);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render.mock.calls[0]?.[1]).toBe(modelA);
    expect(renderer.update).not.toHaveBeenCalled();

    view.rerender(
      <I18nProvider initialLocale="zh-CN">
        <ChartCanvas model={makeModel('B')} label="Chart" renderer={renderer} />
      </I18nProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(CHART_UPDATE_DEBOUNCE_MS);
    });
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.update).toHaveBeenCalledTimes(1);
  });

  it('debounces updates by 120ms and coalesces rapid changes', () => {
    vi.useFakeTimers();
    const renderer = fakeRenderer();
    const view = mount(makeModel('A'), renderer);

    const modelB = makeModel('B');
    const modelC = makeModel('C');
    const tree = (model: RenderModel): ReactElement => (
      <I18nProvider initialLocale="zh-CN">
        <ChartCanvas model={model} label="Chart" renderer={renderer} />
      </I18nProvider>
    );

    view.rerender(tree(modelB));
    act(() => {
      vi.advanceTimersByTime(CHART_UPDATE_DEBOUNCE_MS - 1);
    });
    expect(renderer.update).not.toHaveBeenCalled();

    view.rerender(tree(modelC));
    act(() => {
      vi.advanceTimersByTime(CHART_UPDATE_DEBOUNCE_MS - 1);
    });
    expect(renderer.update).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(renderer.update).toHaveBeenCalledTimes(1);
    expect(renderer.update.mock.calls[0]?.[0]).toBe(modelC);
  });

  it('disposes the renderer on unmount', () => {
    vi.useFakeTimers();
    const renderer = fakeRenderer();
    const view = mount(makeModel(), renderer);
    view.unmount();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('shows a localized error when the adapter cannot render', () => {
    const renderer = fakeRenderer({
      ok: false,
      error: createAppError('E_UNKNOWN', 'no canvas'),
    });
    mount(makeModel(), renderer);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('图表渲染失败：no canvas');
  });

  it('exposes interaction state and forwards toolbar actions', () => {
    const renderer = fakeRenderer();
    renderer.getInteractionState.mockReturnValue({
      zoom: { start: 20, end: 80 },
      hiddenSeries: ['A'],
    });
    const { handle } = mountWithHandle(makeModel(), renderer);

    expect(handle.current?.getInteractionState()).toEqual({
      zoom: { start: 20, end: 80 },
      hiddenSeries: ['A'],
    });

    act(() => {
      handle.current?.dispatchInteraction({ type: 'toggle-series', name: 'A' });
    });
    expect(renderer.dispatchInteraction).toHaveBeenCalledWith({
      type: 'toggle-series',
      name: 'A',
    });
  });

  it('publishes interaction changes to handle subscribers', () => {
    const renderer = fakeRenderer();
    const { handle } = mountWithHandle(makeModel(), renderer);
    const listener = vi.fn();
    const unsubscribe = handle.current?.subscribeInteraction(listener);

    act(() => {
      handle.current?.dispatchInteraction({ type: 'reset-view' });
    });
    expect(listener).toHaveBeenCalledWith({
      zoom: { start: 0, end: 100 },
      hiddenSeries: [],
    });

    unsubscribe?.();
    act(() => {
      handle.current?.dispatchInteraction({ type: 'reset-view' });
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('flushes the pending debounce before exporting the PNG', async () => {
    const renderer = fakeRenderer();
    renderer.toPNG.mockReturnValue({ ok: true, dataUrl: 'data:image/png;base64,AAAA' });
    const { view, handle } = mountWithHandle(makeModel('A'), renderer);
    const modelB = makeModel('B');
    view.rerender(
      <I18nProvider initialLocale="zh-CN">
        <ChartCanvas ref={handle} model={modelB} label="Chart" renderer={renderer} />
      </I18nProvider>,
    );

    const outcome = await handle.current?.exportPng({ scale: 2, background: 'dark' });

    expect(renderer.update).toHaveBeenCalledWith(modelB);
    expect(renderer.update.mock.invocationCallOrder[0]).toBeLessThan(
      renderer.toPNG.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(renderer.toPNG).toHaveBeenCalledWith({ scale: 2, background: 'dark' });
    expect(outcome).toEqual({ ok: true, dataUrl: 'data:image/png;base64,AAAA' });
  });

  it('exposes the update timing, update count and live instance count', () => {
    vi.useFakeTimers();
    const renderer = fakeRenderer();
    const view = mount(makeModel('A'), renderer);
    const canvas = screen.getByTestId('chart-canvas');
    expect(canvas.getAttribute('data-chart-update-count')).toBe('1');
    expect(canvas.getAttribute('data-chart-instances')).toBe('1');
    expect(Number(canvas.getAttribute('data-chart-update-ms'))).toBeGreaterThanOrEqual(0);

    view.rerender(
      <I18nProvider initialLocale="zh-CN">
        <ChartCanvas model={makeModel('B')} label="Chart" renderer={renderer} />
      </I18nProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(CHART_UPDATE_DEBOUNCE_MS);
    });
    expect(screen.getByTestId('chart-canvas').getAttribute('data-chart-update-count')).toBe('2');
    expect(screen.getByTestId('chart-canvas').getAttribute('data-chart-instances')).toBe('1');
  });

  it('coalesces ECharts interaction events into one publication per frame', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame;
      nextFrame += 1;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id);
    });
    const flushFrames = (): void => {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(0);
      }
    };

    const renderer = fakeRenderer();
    const { handle } = mountWithHandle(makeModel(), renderer);
    const listener = vi.fn();
    const unsubscribe = handle.current?.subscribeInteraction(listener);

    act(() => {
      renderer.emitInteraction({ zoom: { start: 10, end: 90 }, hiddenSeries: [] });
      renderer.emitInteraction({ zoom: { start: 20, end: 80 }, hiddenSeries: ['A'] });
    });
    expect(listener).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);

    act(() => {
      flushFrames();
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ zoom: { start: 20, end: 80 }, hiddenSeries: ['A'] });
    expect(screen.getByTestId('chart-canvas').getAttribute('data-chart-hidden-series')).toBe('A');

    unsubscribe?.();
  });

  it('publishes toolbar actions immediately and cancels a queued event', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame;
      nextFrame += 1;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id);
    });

    const renderer = fakeRenderer();
    const { handle } = mountWithHandle(makeModel(), renderer);
    const listener = vi.fn();
    const unsubscribe = handle.current?.subscribeInteraction(listener);

    act(() => {
      renderer.emitInteraction({ zoom: { start: 30, end: 70 }, hiddenSeries: [] });
    });
    act(() => {
      handle.current?.dispatchInteraction({ type: 'reset-view' });
    });
    expect(renderer.dispatchInteraction).toHaveBeenCalledWith({ type: 'reset-view' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ zoom: { start: 0, end: 100 }, hiddenSeries: [] });
    expect(frames.size).toBe(0);

    unsubscribe?.();
  });
});
