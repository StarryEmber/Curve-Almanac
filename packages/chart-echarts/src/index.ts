/**
 * @curve/chart-echarts — the only package allowed to import ECharts.
 *
 * Consumes RenderModel and produces ECharts options / renderer lifecycles.
 * It must never read tables or application stores directly (ADR-004).
 *
 * Placeholder export created in T0.1; the real public API lands in T4.3.
 */
export const PACKAGE_NAME = '@curve/chart-echarts' as const;
