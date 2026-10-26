/**
 * Canvas host for one RenderModel (T4.4 lifecycle, T4.5 interaction/export).
 *
 * The first model mounts the ECharts instance through `createChartRenderer`;
 * later model changes are debounced (120ms) and merged with `renderer.update()`
 * so the instance is never rebuilt. Container resizes delegate to
 * `renderer.resize()`; unmount always disposes the instance.
 *
 * The adapter stays the only module that builds an ECharts option (ADR-042);
 * this component only forwards RenderModels and lifecycle calls. It also owns
 * the imperative surface the chart toolbar and export dialog use: interaction
 * state/dispatch and a "flush the pending debounce, wait for a paint, then
 * toPNG" export (ADR-044).
 *
 * T4.6 (ADR-045) adds the read-only performance contract (`data-chart-update-ms`,
 * `data-chart-update-count`, `data-chart-instances`) and coalesces the
 * ECharts-driven interaction publications to one per animation frame, so
 * dragging the dataZoom slider does not re-render React on every mouse event.
 */

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { activeChartInstanceCount, createChartRenderer } from '@curve/chart-echarts';
import type {
  ChartInteractionAction,
  ChartInteractionState,
  ChartPngOptions,
  ChartPngOutcome,
  ChartRenderer,
} from '@curve/chart-echarts';
import type { RenderModel } from '@curve/chart-model';
import { createAppError } from '@curve/domain';

import { useI18n } from '../../i18n';

import type { ReactElement, Ref } from 'react';

/** SPEC §11.5: inspector edits re-render after this quiet period. */
export const CHART_UPDATE_DEBOUNCE_MS = 120;

const EMPTY_INTERACTION: ChartInteractionState = { zoom: null, hiddenSeries: [] };

interface CanvasDiagnostics {
  /** Whole milliseconds of the last `render()`/`update()` call. */
  updateMs: number;
  /** Monotonic counter; E2E waits for it to observe one real update. */
  updateCount: number;
  /** Live ECharts instances at the last render/update (leak assertion). */
  instances: number;
}

/**
 * Waits for one full browser frame after the pending model was applied. Two
 * frames are used because ECharts paints on the next animation frame; with
 * `animation: false` this makes `toPNG` deterministic (ADR-044 §3).
 */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      return;
    }
    setTimeout(resolve, 0);
  });
}

/** Imperative surface shared by the toolbar and the export dialog. */
export interface ChartCanvasHandle {
  /** Flushes the debounce, waits for a paint, then rasterises the current model. */
  exportPng(options?: ChartPngOptions): Promise<ChartPngOutcome>;
  getInteractionState(): ChartInteractionState;
  dispatchInteraction(action: ChartInteractionAction): void;
  subscribeInteraction(listener: (state: ChartInteractionState) => void): () => void;
}

export interface ChartCanvasProps {
  model: RenderModel;
  /** Accessible name of the chart surface. */
  label: string;
  testId?: string;
  /** Test seam: production creates (and disposes) its own renderer. */
  renderer?: ChartRenderer;
  /** React 19 ref: the chart view drives legend/zoom/export through this. */
  ref?: Ref<ChartCanvasHandle>;
}

export function ChartCanvas({
  model,
  label,
  testId = 'chart-canvas',
  renderer: injected,
  ref,
}: ChartCanvasProps): ReactElement {
  const { locale, t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const appliedModelRef = useRef<RenderModel | null>(null);
  const latestModelRef = useRef<RenderModel>(model);
  const timerRef = useRef<number | null>(null);
  const listenersRef = useRef(new Set<(state: ChartInteractionState) => void>());
  const frameRef = useRef<number | null>(null);
  const queuedInteractionRef = useRef<ChartInteractionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<ChartInteractionState>(EMPTY_INTERACTION);
  const [diagnostics, setDiagnostics] = useState<CanvasDiagnostics>({
    updateMs: 0,
    updateCount: 0,
    instances: 0,
  });

  const cancelScheduledFrame = useCallback((): void => {
    if (frameRef.current !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
    }
    queuedInteractionRef.current = null;
  }, []);

  const publishInteraction = useCallback(
    (next: ChartInteractionState): void => {
      // A direct publish (toolbar action / update result) supersedes a queued
      // ECharts event so the DOM never shows an older window afterwards.
      cancelScheduledFrame();
      setInteraction(next);
      for (const listener of [...listenersRef.current]) {
        listener(next);
      }
    },
    [cancelScheduledFrame],
  );

  /**
   * ECharts emits `datazoom` on every pointer move while the slider is dragged.
   * Publishing each event re-renders the whole chart view; one publish per
   * frame keeps the drag smooth and still delivers the latest state.
   */
  const scheduleInteraction = useCallback(
    (next: ChartInteractionState): void => {
      if (typeof requestAnimationFrame !== 'function') {
        publishInteraction(next);
        return;
      }
      queuedInteractionRef.current = next;
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const queued = queuedInteractionRef.current;
        queuedInteractionRef.current = null;
        if (queued !== null) {
          publishInteraction(queued);
        }
      });
    },
    [publishInteraction],
  );

  const refreshInteraction = useCallback((): void => {
    const renderer = rendererRef.current;
    if (renderer === null) {
      publishInteraction(EMPTY_INTERACTION);
      return;
    }
    publishInteraction(renderer.getInteractionState());
  }, [publishInteraction]);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const applyLatest = useCallback((): void => {
    const renderer = rendererRef.current;
    if (renderer === null || appliedModelRef.current === latestModelRef.current) {
      return;
    }
    const started = performance.now();
    const outcome = renderer.update(latestModelRef.current);
    const elapsed = performance.now() - started;
    setDiagnostics((previous) => ({
      updateMs: Math.round(elapsed),
      updateCount: previous.updateCount + 1,
      instances: activeChartInstanceCount(),
    }));
    if (outcome.ok) {
      appliedModelRef.current = latestModelRef.current;
      setError(null);
      refreshInteraction();
      return;
    }
    setError(outcome.error.message);
  }, [refreshInteraction]);

  const flushPending = useCallback((): void => {
    clearTimer();
    applyLatest();
  }, [applyLatest, clearTimer]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return undefined;
    }
    const renderer =
      injected ??
      createChartRenderer({
        locale,
        labels: {
          zoom: t('chart.toolbox.zoom'),
          zoomBack: t('chart.toolbox.zoomBack'),
        },
      });
    rendererRef.current = renderer;
    const started = performance.now();
    const outcome = renderer.render(host, latestModelRef.current);
    const elapsed = performance.now() - started;
    setDiagnostics({
      updateMs: Math.round(elapsed),
      updateCount: 1,
      instances: activeChartInstanceCount(),
    });
    if (outcome.ok) {
      appliedModelRef.current = latestModelRef.current;
      setError(null);
    } else {
      setError(outcome.error.message);
    }
    const unsubscribe = renderer.onInteractionChange(scheduleInteraction);
    refreshInteraction();

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            renderer.resize();
          });
    observer?.observe(host);

    return () => {
      observer?.disconnect();
      unsubscribe();
      cancelScheduledFrame();
      renderer.dispose();
      rendererRef.current = null;
      appliedModelRef.current = null;
      clearTimer();
    };
  }, [
    cancelScheduledFrame,
    clearTimer,
    injected,
    locale,
    refreshInteraction,
    scheduleInteraction,
    t,
  ]);

  useEffect(() => {
    const listeners = listenersRef.current;
    return () => {
      listeners.clear();
    };
  }, []);

  useEffect(() => {
    latestModelRef.current = model;
    if (rendererRef.current === null || appliedModelRef.current === model) {
      return undefined;
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      applyLatest();
    }, CHART_UPDATE_DEBOUNCE_MS);
    return () => {
      clearTimer();
    };
  }, [applyLatest, clearTimer, model]);

  const exportPng = useCallback(
    async (options: ChartPngOptions = {}): Promise<ChartPngOutcome> => {
      const renderer = rendererRef.current;
      if (renderer === null) {
        return {
          ok: false,
          error: createAppError('E_EXPORT_FAILED', 'The chart is not rendered yet.'),
        };
      }
      flushPending();
      await waitForPaint();
      if (rendererRef.current !== renderer) {
        return {
          ok: false,
          error: createAppError('E_EXPORT_FAILED', 'The chart was re-rendered during export.'),
        };
      }
      return renderer.toPNG(options);
    },
    [flushPending],
  );

  const getInteractionState = useCallback((): ChartInteractionState => {
    return rendererRef.current?.getInteractionState() ?? EMPTY_INTERACTION;
  }, []);

  const dispatchInteraction = useCallback(
    (action: ChartInteractionAction): void => {
      const renderer = rendererRef.current;
      if (renderer === null) {
        return;
      }
      renderer.dispatchInteraction(action);
      refreshInteraction();
    },
    [refreshInteraction],
  );

  const subscribeInteraction = useCallback(
    (listener: (state: ChartInteractionState) => void): (() => void) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({ exportPng, getInteractionState, dispatchInteraction, subscribeInteraction }),
    [dispatchInteraction, exportPng, getInteractionState, subscribeInteraction],
  );

  return (
    <div
      className="cs-chart-canvas"
      data-testid={testId}
      data-chart-zoom-start={interaction.zoom?.start ?? ''}
      data-chart-zoom-end={interaction.zoom?.end ?? ''}
      data-chart-hidden-series={interaction.hiddenSeries.join('|')}
      data-chart-update-ms={diagnostics.updateMs}
      data-chart-update-count={diagnostics.updateCount}
      data-chart-instances={diagnostics.instances}
    >
      <div ref={hostRef} className="cs-chart-canvas__host" role="img" aria-label={label} />
      {error === null ? null : (
        <p className="cs-chart-canvas__error" role="alert">
          {t('chart.view.error', { message: error })}
        </p>
      )}
    </div>
  );
}
