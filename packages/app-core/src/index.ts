/**
 * @curve/app-core — use cases, command bus, undo/redo and application state.
 *
 * Dependency rule (SPEC §4.2): may import domain, table-engine, chart-model,
 * persistence, plugin-sdk, zustand and immer. React, Electron and ECharts are
 * forbidden here; the vanilla Zustand store is the only state dependency.
 */

export const PACKAGE_NAME = '@curve/app-core' as const;

export * from './logging';
export * from './app-core';
export * from './commands/bus';
export * from './commands/table-cell-set';
export * from './state/selectors';
export * from './state/store';
export * from './usecases/open-workspace';
export type * from './commands/types';
export type * from './state/types';
