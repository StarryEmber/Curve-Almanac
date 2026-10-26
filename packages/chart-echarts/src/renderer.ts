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

import type { ChartToolboxLabels } from './option';

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
  /** Localized toolbox icon titles; ECharts English defaults when omitted. */
  labels?: ChartToolboxLabels;
}

/** Current dataZoom window in percent (T4.5, ADR-044). */
export interface ChartZoomWindow {
  start: number;
  end: number;
}

/** Ephemeral interaction state: never persisted, never part of RenderModel. */
export interface ChartInteractionState {
  /** `null` before mount or when the instance has no dataZoom component. */
  zoom: ChartZoomWindow | null;
  /** Series hidden through the legend (DOM toolbar or ECharts' own legend). */
  hiddenSeries: string[];
}

/** Keyboard/toolbar operations forwarded to the ECharts instance. */
export type ChartInteractionAction =
  | { type: 'toggle-series'; name: string }
  | { type: 'zoom-by'; factor: number }
  | { type: 'reset-view' };

export type ChartRenderOutcome =
  { ok: true; state: 'ready' | 'empty' } | { ok: false; error: AppError };

export type ChartPngOutcome = { ok: true; dataUrl: string } | { ok: false; error: AppError };

/** Lifecycle contract from SPEC §11.4 / TASKS T4.3, interaction API T4.5. */
export interface ChartRenderer {
  readonly state: ChartRendererState;
  render(container: HTMLElement, model: RenderModel): ChartRenderOutcome;
  update(model: RenderModel): ChartRenderOutcome;
  resize(): void;
  toPNG(options?: ChartPngOptions): ChartPngOutcome;
  getInteractionState(): ChartInteractionState;
  dispatchInteraction(action: ChartInteractionAction): void;
  onInteractionChange(listener: (state: ChartInteractionState) => void): () => void;
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

interface RawZoomOption {
  start?: unknown;
  end?: unknown;
}

interface RawLegendOption {
  selected?: unknown;
}

interface RawInteractionOption {
  dataZoom?: unknown;
  legend?: unknown;
}

function zoomWindowOf(option: RawInteractionOption): ChartZoomWindow | null {
  const entries: unknown[] = Array.isArray(option.dataZoom) ? option.dataZoom : [option.dataZoom];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const { start, end } = entry as RawZoomOption;
    if (
      typeof start === 'number' &&
      Number.isFinite(start) &&
      typeof end === 'number' &&
      Number.isFinite(end) &&
      end >= start
    ) {
      return { start, end };
    }
  }
  return null;
}

function selectedMapOf(option: RawInteractionOption): Record<string, boolean> {
  const entries: unknown[] = Array.isArray(option.legend) ? option.legend : [option.legend];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const selected = (entry as RawLegendOption).selected;
    if (typeof selected === 'object' && selected !== null) {
      return selected as Record<string, boolean>;
    }
  }
  return {};
}

/**
 * Narrows or widens the current window around its centre. `factor > 1` zooms in
 * (smaller window), `factor < 1` zooms out; the result always stays inside
 * 0–100 with a one-percent minimum span so repeated clicks cannot collapse it.
 */
function zoomedWindow(current: ChartZoomWindow, factor: number): ChartZoomWindow {
  const safeFactor = Number.isFinite(factor) ? Math.min(10, Math.max(0.1, factor)) : 1;
  const span = Math.min(100, Math.max(1, (current.end - current.start) / safeFactor));
  const center = (current.start + current.end) / 2;
  let start = center - span / 2;
  let end = center + span / 2;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > 100) {
    start -= end - 100;
    end = 100;
  }
  return {
    start: Math.max(0, Math.round(start * 100) / 100),
    end: Math.min(100, Math.round(end * 100) / 100),
  };
}

/**
 * Creates one chart renderer bound to at most one container.
 *
 * `render()` mounts (or re-mounts) on a container, `update()` merges into the
 * existing instance, and empty models never create an instance (SPEC §11.4).
 */
export function createChartRenderer(options: ChartRendererOptions = {}): ChartRenderer {
  const locale = options.locale;
  const labels = options.labels;
  let container: HTMLElement | null = null;
  let instance: ChartInstance | null = null;
  let state: ChartRendererState = 'idle';
  /** Names of the currently rendered series, used to filter stale legend keys. */
  let seriesNames: string[] = [];
  const interactionListeners = new Set<(state: ChartInteractionState) => void>();

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

  function readInteractionState(): ChartInteractionState {
    if (instance === null) {
      return { zoom: null, hiddenSeries: [] };
    }
    try {
      const option = instance.getOption() as unknown as RawInteractionOption;
      const selected = selectedMapOf(option);
      return {
        zoom: zoomWindowOf(option),
        hiddenSeries: seriesNames.filter((name) => selected[name] === false),
      };
    } catch {
      // Reading view state is diagnostic only; never let it break rendering.
      return { zoom: null, hiddenSeries: [] };
    }
  }

  function notifyInteraction(): void {
    if (interactionListeners.size === 0) {
      return;
    }
    const next = readInteractionState();
    for (const listener of [...interactionListeners]) {
      listener(next);
    }
  }

  function attachInteractionEvents(chart: ChartInstance): void {
    // Both canvas interactions (slider, wheel, legend click) and DOM toolbar
    // actions end up here, so every surface sees one state (ADR-044 §1).
    chart.on('datazoom', notifyInteraction);
    chart.on('legendselectchanged', notifyInteraction);
  }

  function mount(nextContainer: HTMLElement, model: RenderModel): ChartRenderOutcome {
    container = nextContainer;
    destroyInstance();
    registerEChartsModules();
    try {
      const created = init(nextContainer, undefined, { renderer: 'canvas' });
      instance = created;
      liveInstances += 1;
      seriesNames = model.series.map((series) => series.name);
      created.setOption(toEChartsOption(model, { locale, labels }));
      attachInteractionEvents(created);
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
        seriesNames = [];
        destroyInstance();
        state = 'empty';
        return { ok: true, state: 'empty' };
      }
      return mount(nextContainer, model);
    },

    update(model: RenderModel): ChartRenderOutcome {
      if (isEmptyModel(model)) {
        seriesNames = [];
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
        seriesNames = model.series.map((series) => series.name);
        instance.setOption(toEChartsOption(model, { locale, labels }), {
          notMerge: false,
          replaceMerge: ['series', 'xAxis', 'yAxis'],
        });
        state = 'ready';
        // Series names may have changed; the legend selection keyed by name can
        // therefore differ even though no ECharts event fired.
        notifyInteraction();
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

    getInteractionState(): ChartInteractionState {
      return readInteractionState();
    },

    dispatchInteraction(action: ChartInteractionAction): void {
      if (instance === null) {
        return;
      }
      try {
        if (action.type === 'toggle-series') {
          instance.dispatchAction({ type: 'legendToggleSelect', name: action.name });
          return;
        }
        if (action.type === 'zoom-by') {
          const current = readInteractionState().zoom ?? { start: 0, end: 100 };
          const next = zoomedWindow(current, action.factor);
          instance.dispatchAction({ type: 'dataZoom', start: next.start, end: next.end });
          return;
        }
        instance.dispatchAction({ type: 'legendAllSelect' });
        instance.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
      } catch {
        // Interaction is ephemeral UI state; a failed action must not crash the
        // view or escape into React (ADR-044 §1).
      }
    },

    onInteractionChange(listener: (state: ChartInteractionState) => void): () => void {
      interactionListeners.add(listener);
      return () => {
        interactionListeners.delete(listener);
      };
    },

    dispose(): void {
      destroyInstance();
      seriesNames = [];
      interactionListeners.clear();
      container = null;
      state = 'idle';
    },
  };
}
