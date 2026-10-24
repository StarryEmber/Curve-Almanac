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
export * from './commands/column-views';
export * from './commands/columns';
export * from './commands/layout';
export * from './commands/paste';
export * from './commands/import';
export * from './commands/rows';
export * from './commands/styles';
export * from './commands/table-cell-set';
export * from './commands/tables';
export * from './commands/view-copy';
export * from './commands/views';
export * from './history/edit-history';
export * from './state/chart-validity';
export * from './state/manifest';
export * from './state/selectors';
export * from './state/store';
export * from './usecases/open-workspace';
export * from './usecases/save-queue';
export * from './usecases/workspace-actions';
export * from './validation/cell-validation';
export * from './validation/column-change';
export * from './validation/column-draft';
export * from './validation/condition-builder';
export * from './validation/filter-builder';
export * from './validation/import-planning';
export * from './validation/paste-columns';
export * from './validation/paste-plan';
export * from './validation/view-state';
export type * from './commands/types';
export type * from './state/types';
