// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChartRenderer, ChartPngOutcome, ChartRenderOutcome } from '@curve/chart-echarts';
import type { RenderModel } from '@curve/chart-model';
import { createAppError } from '@curve/domain';

import { I18nProvider } from '../../i18n';

import { CHART_UPDATE_DEBOUNCE_MS, ChartCanvas } from './ChartCanvas';

import type { ReactElement } from 'react';
import type { Mock } from 'vitest';

vi.mock('@curve/chart-echarts', () => ({
  createChartRenderer: vi.fn(),
}));

interface FakeRenderer extends Omit<
  ChartRenderer,
  'render' | 'update' | 'resize' | 'toPNG' | 'dispose'
> {
  render: Mock<(container: HTMLElement, model: RenderModel) => ChartRenderOutcome>;
  update: Mock<(model: RenderModel) => ChartRenderOutcome>;
  resize: Mock<() => void>;
  toPNG: Mock<() => ChartPngOutcome>;
  dispose: Mock<() => void>;
}

function fakeRenderer(
  renderOutcome: ChartRenderOutcome = { ok: true, state: 'ready' },
): FakeRenderer {
  return {
    state: 'idle',
    render: vi.fn((_container: HTMLElement, _model: RenderModel) => renderOutcome),
    update: vi.fn((_model: RenderModel) => ({ ok: true as const, state: 'ready' as const })),
    resize: vi.fn(),
    toPNG: vi.fn(() => ({
      ok: false as const,
      error: createAppError('E_EXPORT_FAILED', 'n/a'),
    })),
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
});
