/**
 * On-demand ECharts module registration (T4.3, ADR-042 §1).
 *
 * Only the three charts, the five components and the canvas renderer that the
 * adapter actually uses are registered; the full `echarts` entry is never
 * imported. Registration is idempotent because `use()` would otherwise re-run
 * every installer on each renderer creation.
 */

import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components';
import { use as registerWithECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

let registered = false;

/** Registers the adapter's ECharts subset exactly once (ADR-042 §1). */
export function registerEChartsModules(): void {
  if (registered) {
    return;
  }
  registerWithECharts([
    LineChart,
    ScatterChart,
    BarChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
    ToolboxComponent,
    CanvasRenderer,
  ]);
  registered = true;
}

/** True once `registerEChartsModules()` has run in this process. */
export function areEChartsModulesRegistered(): boolean {
  return registered;
}
