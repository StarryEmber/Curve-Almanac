/**
 * Chart mutation hook (T4.4).
 *
 * One inspector interaction = one `chart.update` command (manifest-only,
 * workspace-scoped undo) followed by a save-queue flush. The chart view itself
 * reads the updated chart from the store, so persistence and rendering never
 * have two competing sources of truth.
 */

import { useCallback } from 'react';

import type { ChartSpec } from '@curve/domain';

import { useRendererCore } from '../../app-core/use-app-core';

export type CommitChart = (chart: ChartSpec) => void;

export function useChartEditor(): CommitChart {
  const { core } = useRendererCore();
  return useCallback(
    (chart: ChartSpec): void => {
      void core.actions.updateChart(chart).then((outcome) => {
        if (!outcome.ok) {
          core.store.getState().actions.setError(outcome.error);
        }
      });
    },
    [core],
  );
}
