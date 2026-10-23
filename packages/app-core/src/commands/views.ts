/**
 * View and layout commands (SPEC §13.1 `view.create/delete/update/layout`).
 *
 * A "tab" is a `ViewDef` in `manifest.views` plus a reference in a layout pane.
 * T2.1 only uses one pane, but the helpers keep the recursive layout shape so
 * T5.1 can add splits without changing the command contracts.
 */

import {
  createAppError,
  createTimestamp,
  isId,
  layoutNodeSchema,
  viewDefSchema,
} from '@curve/domain';
import type { LayoutNode, SortSpec, ViewDef } from '@curve/domain';

import { assertValidTableView } from '../validation/view-state';

import {
  addViewToLayout,
  findActivePane,
  firstViewId,
  listPanes,
  removeViewFromLayout,
} from './layout';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { Draft } from 'immer';

export interface ViewCreatePayload {
  view: ViewDef;
}

export interface ViewDeletePayload {
  viewId: string;
}

export interface ViewUpdatePayload {
  viewId: string;
  patch: ViewPatch;
}

export interface ViewLayoutPayload {
  layout: LayoutNode;
}

/** Mutable subset of `TableViewState` exposed to the UI. */
export interface ViewPatch {
  title?: string;
  widths?: Record<string, number>;
  hiddenColumnIds?: string[];
  sort?: SortSpec[];
  frozenColumnCount?: number;
  columnOrder?: string[];
  /** `null` removes the filter. */
  filter?: unknown;
}

export interface ViewCommandOptions {
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw createAppError('E_VALIDATION', message);
}

function touchWorkspace(draft: Draft<AppState>, timestamp: string): void {
  if (draft.workspace !== null) {
    draft.workspace.updatedAt = timestamp;
  }
}

export function syncActiveSelection(draft: Draft<AppState>): void {
  const activeViewId = findActivePane(draft.layout)?.activeViewId ?? firstViewId(draft.layout);
  if (activeViewId === null || draft.views[activeViewId] === undefined) {
    draft.ui.activeViewId = null;
    draft.ui.activeTableId = Object.keys(draft.tables)[0] ?? null;
    return;
  }
  draft.ui.activeViewId = activeViewId;
  const view = draft.views[activeViewId];
  if (view !== undefined && view.kind === 'table') {
    draft.ui.activeTableId = view.refId;
    return;
  }
  if (view !== undefined) {
    draft.ui.activeTableId = draft.charts[view.refId]?.tableId ?? null;
  }
}

function parseViewId(payload: unknown, command: string): string {
  if (!isRecord(payload) || typeof payload['viewId'] !== 'string') {
    invalid(`${command} expects { viewId }.`);
  }
  const viewId = payload['viewId'];
  if (!isId('viw', viewId)) {
    invalid('"viewId" must be a valid viw id.');
  }
  return viewId;
}

function parseViewCreate(payload: unknown): ViewCreatePayload {
  if (!isRecord(payload) || !('view' in payload)) {
    invalid('view.create expects { view }.');
  }
  const parsed = viewDefSchema.safeParse(payload['view']);
  if (!parsed.success) {
    invalid('The view definition is invalid.');
  }
  return { view: parsed.data };
}

function parseViewDelete(payload: unknown): ViewDeletePayload {
  return { viewId: parseViewId(payload, 'view.delete') };
}

const PATCH_KEYS = new Set([
  'title',
  'widths',
  'hiddenColumnIds',
  'sort',
  'frozenColumnCount',
  'columnOrder',
  'filter',
]);

function parseViewUpdate(payload: unknown): ViewUpdatePayload {
  const viewId = parseViewId(payload, 'view.update');
  if (!isRecord(payload) || !isRecord(payload['patch'])) {
    invalid('view.update expects { viewId, patch }.');
  }
  const raw = payload['patch'];
  for (const key of Object.keys(raw)) {
    if (!PATCH_KEYS.has(key)) {
      invalid(`view.update does not accept "${key}".`);
    }
  }
  return { viewId, patch: raw as ViewPatch };
}

function parseViewLayout(payload: unknown): ViewLayoutPayload {
  if (!isRecord(payload) || !('layout' in payload)) {
    invalid('view.layout expects { layout }.');
  }
  const parsed = layoutNodeSchema.safeParse(payload['layout']);
  if (!parsed.success) {
    invalid('The layout is invalid.');
  }
  return { layout: parsed.data };
}

function assertViewRefs(state: Draft<AppState>, view: ViewDef): void {
  if (state.views[view.id] !== undefined) {
    invalid('The view already exists.');
  }
  if (view.kind === 'table') {
    if (state.tables[view.refId] === undefined) {
      throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.');
    }
    if (view.tableView === undefined || view.tableView.tableId !== view.refId) {
      invalid('A table view must carry its tableView state.');
    }
    const table = state.tables[view.refId]?.table;
    if (table !== undefined) {
      const columnIds = table.columns.map((column) => column.id);
      if (
        view.tableView.columnOrder.length !== columnIds.length ||
        !columnIds.every((id) => view.tableView?.columnOrder.includes(id))
      ) {
        invalid('The view columnOrder must contain every table column exactly once.');
      }
      assertValidTableView(table, view.tableView);
    }
    return;
  }
  if (state.charts[view.refId] === undefined) {
    throw createAppError('E_TABLE_NOT_FOUND', 'The chart does not exist.');
  }
  if (view.tableView !== undefined) {
    invalid('A chart view must not carry tableView state.');
  }
}

function assertLayoutRefs(state: Draft<AppState>, layout: LayoutNode): void {
  const seen = new Set<string>();
  for (const pane of listPanes(layout)) {
    for (const viewId of pane.viewIds) {
      if (seen.has(viewId)) {
        invalid('A layout may not reference the same view twice.');
      }
      seen.add(viewId);
      if (state.views[viewId] === undefined) {
        invalid(`The layout references missing view "${viewId}".`);
      }
    }
    if (pane.activeViewId !== null && !pane.viewIds.includes(pane.activeViewId)) {
      invalid('The pane activeViewId must be one of its viewIds.');
    }
  }
}

export function createViewCreateCommand(
  options: ViewCommandOptions = {},
): CommandDefinition<ViewCreatePayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'view.create',
    parse: parseViewCreate,
    apply(draft, payload) {
      assertViewRefs(draft, payload.view);
      draft.views[payload.view.id] = payload.view;
      addViewToLayout(draft.layout, payload.view.id);
      syncActiveSelection(draft);
      touchWorkspace(draft, createTimestamp(now()));
    },
  };
}

export function createViewDeleteCommand(
  options: ViewCommandOptions = {},
): CommandDefinition<ViewDeletePayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'view.delete',
    parse: parseViewDelete,
    apply(draft, payload) {
      if (draft.views[payload.viewId] === undefined) {
        invalid('The view does not exist.');
      }
      delete draft.views[payload.viewId];
      removeViewFromLayout(draft.layout, payload.viewId);
      syncActiveSelection(draft);
      touchWorkspace(draft, createTimestamp(now()));
    },
  };
}

export function createViewUpdateCommand(
  options: ViewCommandOptions = {},
): CommandDefinition<ViewUpdatePayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'view.update',
    parse: parseViewUpdate,
    apply(draft, payload) {
      const current = draft.views[payload.viewId];
      if (current === undefined) {
        invalid('The view does not exist.');
      }
      if (current.tableView === undefined) {
        invalid('Only table views can be updated.');
      }
      const patch = payload.patch;
      const tableView = { ...current.tableView };
      if (patch.widths !== undefined) {
        tableView.widths = { ...patch.widths };
      }
      if (patch.hiddenColumnIds !== undefined) {
        tableView.hiddenColumnIds = [...patch.hiddenColumnIds];
      }
      if (patch.sort !== undefined) {
        tableView.sort = [...patch.sort];
      }
      if (patch.frozenColumnCount !== undefined) {
        tableView.frozenColumnCount = patch.frozenColumnCount;
      }
      if (patch.columnOrder !== undefined) {
        tableView.columnOrder = [...patch.columnOrder];
      }
      if (patch.filter !== undefined) {
        if (patch.filter === null) {
          delete tableView.filter;
        } else {
          tableView.filter = patch.filter as NonNullable<typeof tableView.filter>;
        }
      }
      const candidate: ViewDef = {
        ...current,
        title: patch.title ?? current.title,
        tableView,
      };
      const parsed = viewDefSchema.safeParse(candidate);
      if (!parsed.success) {
        invalid('The updated view is invalid.');
      }
      const table = draft.tables[tableView.tableId]?.table;
      if (table === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.');
      }
      const columnIds = new Set(table.columns.map((column) => column.id));
      if (
        parsed.data.tableView !== undefined &&
        (parsed.data.tableView.columnOrder.length !== columnIds.size ||
          !parsed.data.tableView.columnOrder.every((id) => columnIds.has(id)))
      ) {
        invalid('The view columnOrder must contain every table column exactly once.');
      }
      if (parsed.data.tableView !== undefined) {
        assertValidTableView(table, parsed.data.tableView);
      }
      draft.views[payload.viewId] = parsed.data;
      touchWorkspace(draft, createTimestamp(now()));
    },
  };
}

export function createViewLayoutCommand(
  options: ViewCommandOptions = {},
): CommandDefinition<ViewLayoutPayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'view.layout',
    parse: parseViewLayout,
    apply(draft, payload) {
      assertLayoutRefs(draft, payload.layout);
      draft.layout = payload.layout;
      syncActiveSelection(draft);
      touchWorkspace(draft, createTimestamp(now()));
    },
  };
}
