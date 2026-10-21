/**
 * T2.1 workspace use cases: document commands plus the explicit manifest save
 * required by the "write after every structural operation" decision (ADR-027).
 *
 * Commands stay synchronous and IO-free; this layer owns the ordering:
 * dispatch → write `manifest.json` → move the table file to `.trash/`.
 */

import { createAppError, toAppError } from '@curve/domain';
import type { AppError, LayoutNode, UuidFactory, WorkspaceManifest } from '@curve/domain';
import type { WorkspaceStore } from '@curve/persistence';

import { activateViewInLayout } from '../commands/layout';
import {
  createNewTablePayload,
  createOpenTableView,
  type TableCreatePayload,
} from '../commands/tables';
import { defaultAppLogger } from '../logging';

import type { CommandBus } from '../commands/types';
import type { ViewPatch } from '../commands/views';
import type { AppLogger } from '../logging';
import type { AppState, AppStore } from '../state/types';

export type ActionOutcome<T = undefined> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: AppError };

export interface WorkspaceActionsOptions {
  store: AppStore;
  commands: CommandBus;
  workspaceStore: WorkspaceStore;
  logger?: AppLogger;
  now?: () => Date;
  uuid?: UuidFactory;
}

export interface WorkspaceActions {
  createTable(name: string, primaryKey?: string): Promise<ActionOutcome<TableCreatePayload>>;
  renameTable(tableId: string, name: string): Promise<ActionOutcome>;
  deleteTable(tableId: string): Promise<ActionOutcome>;
  openTable(tableId: string): Promise<ActionOutcome<{ viewId: string; created: boolean }>>;
  activateView(viewId: string): Promise<ActionOutcome>;
  closeView(viewId: string): Promise<ActionOutcome>;
  updateView(viewId: string, patch: ViewPatch): Promise<ActionOutcome>;
  saveManifest(): Promise<ActionOutcome>;
  closeWorkspace(): Promise<ActionOutcome>;
}

function emptyLayout(): LayoutNode {
  return { type: 'pane', viewIds: [], activeViewId: null };
}

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

function cloneLayout(layout: LayoutNode): LayoutNode {
  if (layout.type === 'pane') {
    return { ...layout, viewIds: [...layout.viewIds] };
  }
  return { ...layout, first: cloneLayout(layout.first), second: cloneLayout(layout.second) };
}

function fail(error: AppError): ActionOutcome<never> {
  return { ok: false, error };
}

export function createWorkspaceActions(options: WorkspaceActionsOptions): WorkspaceActions {
  const { store, commands, workspaceStore } = options;
  const logger = options.logger ?? defaultAppLogger;
  const now = options.now ?? ((): Date => new Date());
  const uuid = options.uuid;

  const report = (event: string, thrown: unknown): AppError => {
    const error = toAppError(thrown);
    logger.error(event, error);
    store.getState().actions.setError(error);
    return error;
  };

  async function saveManifest(): Promise<ActionOutcome> {
    const state = store.getState();
    const manifest = stateToManifest(state);
    if (manifest === null) {
      return fail(createAppError('E_WS_NOT_FOUND', 'No workspace is open.'));
    }
    try {
      await workspaceStore.writeManifest({ workspaceId: manifest.id, manifest });
      return { ok: true, data: undefined };
    } catch (thrown) {
      return fail(report('failed to write the workspace manifest', thrown));
    }
  }

  async function createTable(
    name: string,
    primaryKey?: string,
  ): Promise<ActionOutcome<TableCreatePayload>> {
    let payload: TableCreatePayload;
    try {
      payload = createNewTablePayload({
        name,
        ...(primaryKey === undefined ? {} : { primaryKey }),
        now: now(),
        ...(uuid === undefined ? {} : { uuid }),
        ...(store.getState().workspace === null
          ? {}
          : { defaultStyleId: store.getState().workspace?.settings.defaultTableStyleId }),
      });
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
    const dispatched = commands.dispatch('table.create', payload);
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const saved = await saveManifest();
    if (!saved.ok) {
      return fail(saved.error);
    }
    return { ok: true, data: payload };
  }

  async function renameTable(tableId: string, name: string): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('table.meta.update', { tableId, name });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return saveManifest();
  }

  async function deleteTable(tableId: string): Promise<ActionOutcome> {
    const state = store.getState();
    const workspace = state.workspace;
    if (workspace === null) {
      return fail(createAppError('E_WS_NOT_FOUND', 'No workspace is open.'));
    }
    const dispatched = commands.dispatch('table.delete', { tableId });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    // Manifest first: an orphaned table file is harmless, a manifest that still
    // references a trashed file is data loss (ADR-027).
    const saved = await saveManifest();
    if (!saved.ok) {
      return fail(saved.error);
    }
    try {
      await workspaceStore.trash({ workspaceId: workspace.id, tableId });
      return { ok: true, data: undefined };
    } catch (thrown) {
      return fail(report('failed to move the table file to .trash', thrown));
    }
  }

  async function openTable(
    tableId: string,
  ): Promise<ActionOutcome<{ viewId: string; created: boolean }>> {
    const state = store.getState();
    const tableData = state.tables[tableId];
    if (tableData === undefined) {
      return fail(createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.'));
    }
    const existing = Object.values(state.views).find(
      (view) => view.kind === 'table' && view.refId === tableId,
    );
    if (existing !== undefined) {
      const layout = cloneLayout(state.layout);
      activateViewInLayout(layout, existing.id);
      const dispatched = commands.dispatch('view.layout', { layout });
      if (!dispatched.ok) {
        return fail(dispatched.error);
      }
      const saved = await saveManifest();
      if (!saved.ok) {
        return fail(saved.error);
      }
      return { ok: true, data: { viewId: existing.id, created: false } };
    }

    const view = createOpenTableView({
      table: tableData.table,
      now: now(),
      ...(uuid === undefined ? {} : { uuid }),
      ...(state.workspace === null
        ? {}
        : { defaultStyleId: state.workspace.settings.defaultTableStyleId }),
    });
    const dispatched = commands.dispatch('view.create', { view });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const saved = await saveManifest();
    if (!saved.ok) {
      return fail(saved.error);
    }
    return { ok: true, data: { viewId: view.id, created: true } };
  }

  async function activateView(viewId: string): Promise<ActionOutcome> {
    const state = store.getState();
    if (state.views[viewId] === undefined) {
      return fail(createAppError('E_VALIDATION', 'The view does not exist.'));
    }
    const layout = cloneLayout(state.layout);
    activateViewInLayout(layout, viewId);
    const dispatched = commands.dispatch('view.layout', { layout });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return saveManifest();
  }

  async function closeView(viewId: string): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('view.delete', { viewId });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return saveManifest();
  }

  async function updateView(viewId: string, patch: ViewPatch): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('view.update', { viewId, patch });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return saveManifest();
  }

  async function closeWorkspace(): Promise<ActionOutcome> {
    const state = store.getState();
    if (state.workspace === null) {
      return { ok: true, data: undefined };
    }
    try {
      await workspaceStore.close({ workspaceId: state.workspace.id });
    } catch (thrown) {
      return fail(report('failed to close the workspace', thrown));
    }
    store.setState({
      workspace: null,
      tables: {},
      views: {},
      charts: {},
      tableStyles: {},
      layout: emptyLayout(),
      ui: { activeTableId: null, activeViewId: null, error: null, dirtyTables: [] },
    });
    store.getState().actions.clearAllDirty();
    return { ok: true, data: undefined };
  }

  return {
    createTable,
    renameTable,
    deleteTable,
    openTable,
    activateView,
    closeView,
    updateView,
    saveManifest,
    closeWorkspace,
  };
}
