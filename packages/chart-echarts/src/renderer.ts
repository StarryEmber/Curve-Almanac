/**
 * Imperative ECharts lifecycle around one RenderModel (T4.3, SPEC §11.4,
 * ADR-042 §6).
 *
 * The adapter is the only place that touches DOM/ECharts. It never samples,
 * never reads tables and never builds an option itself — that stays in
 * `option.ts`. Lifecycle methods return structured outcomes instead of throwing
 * so the future chart view (T4.4) can render empty/error states.
 */

import { init } from 'echarts/core';

import { CHART_BACKGROUNDS } from '@curve/chart-model';
import type { RenderModel } from '@curve/chart-model';
import { createAppError } from '@curve/domain';
import type { AppError } from '@curve/domain';

import { isEmptyModel, toEChartsOption } from './option';
import { registerEChartsModules } from './registration';

type ChartInstance = ReturnType<typeof init>;

/** Renderer lifecycle state exposed for empty/error stubs (SPEC §11.4). */
export type ChartRendererState = 'idle' | 'ready' | 'empty' | 'error';

/** PNG export backgrounds from SPEC §11.6. */
export type ChartPngBackground = 'transparent' | 'light' | 'dark';

export interface ChartPngOptions {
  /** Pixel ratio; defaults to 2 (SPEC §11.6 "导出 2x"), clamped to 1..4. */
  scale?: number;
  /** Canvas background; defaults to `transparent`. */
  background?: ChartPngBackground;
}

export interface ChartRendererOptions {
  /** BCP 47 locale forwarded to value formatting; defaults to `en-US`. */
  locale?: string;
}

export type ChartRenderOutcome =
  { ok: true; state: 'ready' | 'empty' } | { ok: false; error: AppError };

export type ChartPngOutcome = { ok: true; dataUrl: string } | { ok: false; error: AppError };

/** Lifecycle contract from SPEC §11.4 / TASKS T4.3. */
export interface ChartRenderer {
  readonly state: ChartRendererState;
  render(container: HTMLElement, model: RenderModel): ChartRenderOutcome;
  update(model: RenderModel): ChartRenderOutcome;
  resize(): void;
  toPNG(options?: ChartPngOptions): ChartPngOutcome;
  dispose(): void;
}

const DEFAULT_PNG_SCALE = 2;
const MAX_PNG_SCALE = 4;

let liveInstances = 0;

/** Live ECharts instances created by this module; used by leak tests. */
export function activeChartInstanceCount(): number {
  return liveInstances;
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function normalizeScale(scale: number | undefined): number {
  if (scale === undefined || !Number.isFinite(scale) || scale < 1) {
    return DEFAULT_PNG_SCALE;
  }
  return Math.min(MAX_PNG_SCALE, Math.round(scale));
}

function pngBackground(background: ChartPngBackground): string {
  if (background === 'light') {
    return CHART_BACKGROUNDS.light;
  }
  if (background === 'dark') {
    return CHART_BACKGROUNDS.dark;
  }
  return 'transparent';
}

/**
 * Creates one chart renderer bound to at most one container.
 *
 * `render()` mounts (or re-mounts) on a container, `update()` merges into the
 * existing instance, and empty models never create an instance (SPEC §11.4).
 */
export function createChartRenderer(options: ChartRendererOptions = {}): ChartRenderer {
  const locale = options.locale;
  let container: HTMLElement | null = null;
  let instance: ChartInstance | null = null;
  let state: ChartRendererState = 'idle';

  function destroyInstance(): void {
    if (instance === null) {
      return;
    }
    const current = instance;
    instance = null;
    liveInstances = Math.max(0, liveInstances - 1);
    current.dispose();
  }

  function fail(error: unknown, fallback: string): ChartRenderOutcome {
    destroyInstance();
    state = 'error';
    return { ok: false, error: createAppError('E_UNKNOWN', messageOf(error, fallback)) };
  }

  function mount(nextContainer: HTMLElement, model: RenderModel): ChartRenderOutcome {
    container = nextContainer;
    destroyInstance();
    registerEChartsModules();
    try {
      const created = init(nextContainer, undefined, { renderer: 'canvas' });
      instance = created;
      liveInstances += 1;
      created.setOption(toEChartsOption(model, { locale }));
      state = 'ready';
      return { ok: true, state: 'ready' };
    } catch (error) {
      return fail(error, 'The chart instance could not be created.');
    }
  }

  return {
    get state(): ChartRendererState {
      return state;
    },

    render(nextContainer: HTMLElement, model: RenderModel): ChartRenderOutcome {
      if (isEmptyModel(model)) {
        container = nextContainer;
        destroyInstance();
        state = 'empty';
        return { ok: true, state: 'empty' };
      }
      return mount(nextContainer, model);
    },

    update(model: RenderModel): ChartRenderOutcome {
      if (isEmptyModel(model)) {
        destroyInstance();
        state = 'empty';
        return { ok: true, state: 'empty' };
      }
      if (instance === null) {
        if (container === null) {
          state = 'error';
          return {
            ok: false,
            error: createAppError(
              'E_UNKNOWN',
              'The chart renderer has no container; call render() before update().',
            ),
          };
        }
        return mount(container, model);
      }
      try {
        instance.setOption(toEChartsOption(model, { locale }), {
          notMerge: false,
          replaceMerge: ['series', 'xAxis', 'yAxis'],
        });
        state = 'ready';
        return { ok: true, state: 'ready' };
      } catch (error) {
        return fail(error, 'The chart option could not be applied.');
      }
    },

    resize(): void {
      instance?.resize();
    },

    toPNG(pngOptions: ChartPngOptions = {}): ChartPngOutcome {
      if (instance === null) {
        return {
          ok: false,
          error: createAppError('E_EXPORT_FAILED', 'The chart is not rendered yet.'),
        };
      }
      try {
        const dataUrl = instance.getDataURL({
          type: 'png',
          pixelRatio: normalizeScale(pngOptions.scale),
          backgroundColor: pngBackground(pngOptions.background ?? 'transparent'),
          // Toolbar icons are UI chrome, never part of an exported chart.
          excludeComponents: ['toolbox'],
        });
        if (dataUrl.length === 0) {
          return {
            ok: false,
            error: createAppError('E_EXPORT_FAILED', 'ECharts returned an empty image.'),
          };
        }
        return { ok: true, dataUrl };
      } catch (error) {
        return {
          ok: false,
          error: createAppError(
            'E_EXPORT_FAILED',
            messageOf(error, 'The chart PNG export failed.'),
          ),
        };
      }
    },

    dispose(): void {
      destroyInstance();
      container = null;
      state = 'idle';
    },
  };
}
