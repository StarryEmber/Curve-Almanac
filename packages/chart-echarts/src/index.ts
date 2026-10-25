/**
 * @curve/chart-echarts — the only package allowed to import ECharts.
 *
 * Consumes RenderModel and produces ECharts options / renderer lifecycles.
 * It must never read tables or application stores directly (ADR-004/ADR-042).
 */

export const PACKAGE_NAME = '@curve/chart-echarts' as const;

export * from './format';
export * from './option';
export * from './registration';
export * from './renderer';
export * from './theme';
