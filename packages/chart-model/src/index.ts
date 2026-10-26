/**
 * @curve/chart-model — chart-agnostic RenderModel, wide/long mapping and LTTB sampling.
 *
 * Dependency rule (SPEC §4.2): may import @curve/domain and @curve/table-engine.
 * ECharts is forbidden here; only @curve/chart-echarts may import it.
 *
 * T4.1 delivers the RenderModel and the wide/long mapping; T4.2 adds LTTB
 * sampling on top of this contract. T4.6 (ADR-045) exposes the two-step resolve
 * (`resolveChartData` + `renderChartModel`) behind the unchanged `resolveSeries`.
 */

export const PACKAGE_NAME = '@curve/chart-model' as const;

export * from './palettes';
export * from './render-model';
export * from './sampling';
