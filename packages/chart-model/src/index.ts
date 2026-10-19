/**
 * @curve/chart-model — chart-agnostic RenderModel, wide/long mapping and LTTB sampling.
 *
 * Dependency rule (SPEC §4.2): may import @curve/domain and @curve/table-engine.
 * ECharts is forbidden here; only @curve/chart-echarts may import it.
 *
 * Placeholder export created in T0.1; the real public API lands in T4.1.
 */
export const PACKAGE_NAME = '@curve/chart-model' as const;
