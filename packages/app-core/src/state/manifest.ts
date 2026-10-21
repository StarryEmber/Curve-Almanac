import type { LayoutNode, WorkspaceManifest } from '@curve/domain';

import type { AppState } from './types';

/** Builds the manifest that should be written for the current document state. */
export function stateToManifest(state: AppState): WorkspaceManifest | null {
  const workspace = state.workspace;
  if (workspace === null) {
    return null;
  }
  return {
    formatVersion: workspace.formatVersion,
    id: workspace.id,
    name: workspace.name,
    appVersion: workspace.appVersion,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    tables: Object.values(state.tables).map((data) => data.table),
    charts: Object.values(state.charts),
    views: Object.values(state.views),
    tableStyles: Object.values(state.tableStyles),
    layout: state.layout,
    settings: workspace.settings,
  };
}

export function emptyLayout(): LayoutNode {
  return { type: 'pane', viewIds: [], activeViewId: null };
}
