/**
 * Canvas host for one RenderModel (T4.4, SPEC §11.5).
 *
 * The first model mounts the ECharts instance through `createChartRenderer`;
 * later model changes are debounced (120ms) and merged with `renderer.update()`
 * so the instance is never rebuilt. Container resizes delegate to
 * `renderer.resize()`; unmount always disposes the instance.
 *
 * The adapter stays the only module that builds an ECharts option (ADR-042);
 * this component only forwards RenderModels and lifecycle calls.
 */

import { useEffect, useRef, useState } from 'react';

import { createChartRenderer } from '@curve/chart-echarts';
import type { ChartRenderer } from '@curve/chart-echarts';
import type { RenderModel } from '@curve/chart-model';

import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

/** SPEC §11.5: inspector edits re-render after this quiet period. */
export const CHART_UPDATE_DEBOUNCE_MS = 120;

export interface ChartCanvasProps {
  model: RenderModel;
  /** Accessible name of the chart surface. */
  label: string;
  testId?: string;
  /** Test seam: production creates (and disposes) its own renderer. */
  renderer?: ChartRenderer;
}

export function ChartCanvas({
  model,
  label,
  testId = 'chart-canvas',
  renderer: injected,
}: ChartCanvasProps): ReactElement {
  const { locale, t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const appliedModelRef = useRef<RenderModel | null>(null);
  const latestModelRef = useRef<RenderModel>(model);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    latestModelRef.current = model;
  }, [model]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return undefined;
    }
    const renderer = injected ?? createChartRenderer({ locale });
    rendererRef.current = renderer;
    const outcome = renderer.render(host, latestModelRef.current);
    if (outcome.ok) {
      appliedModelRef.current = latestModelRef.current;
      setError(null);
    } else {
      setError(outcome.error.message);
    }

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            renderer.resize();
          });
    observer?.observe(host);

    return () => {
      observer?.disconnect();
      renderer.dispose();
      rendererRef.current = null;
      appliedModelRef.current = null;
    };
  }, [injected, locale]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null || appliedModelRef.current === model) {
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      const outcome = renderer.update(model);
      if (outcome.ok) {
        appliedModelRef.current = model;
        setError(null);
      } else {
        setError(outcome.error.message);
      }
    }, CHART_UPDATE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [model]);

  return (
    <div className="cs-chart-canvas" data-testid={testId}>
      <div ref={hostRef} className="cs-chart-canvas__host" role="img" aria-label={label} />
      {error === null ? null : (
        <p className="cs-chart-canvas__error" role="alert">
          {t('chart.view.error', { message: error })}
        </p>
      )}
    </div>
  );
}
