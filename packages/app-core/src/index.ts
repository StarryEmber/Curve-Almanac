/**
 * @curve/app-core — use cases, command bus, undo/redo and application state.
 *
 * Dependency rule (SPEC §4.2): may import domain, table-engine, chart-model,
 * persistence and plugin-sdk. React, Electron and ECharts are forbidden here.
 *
 * Placeholder export created in T0.1; the real public API lands in T1.5.
 */
export const PACKAGE_NAME = '@curve/app-core' as const;
