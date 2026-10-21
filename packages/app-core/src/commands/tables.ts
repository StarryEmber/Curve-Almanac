/**
 * Table structure commands introduced by T2.1 (ADR-027).
 *
 * SPEC §13.1 had no `table.create`/`table.delete`; the T2.1 decision added them
 * as synchronous document commands so creation, renaming and cascading deletion
 * go through the same Immer patch pipeline as `table.cell.set`. Async IO (the
 * table file, `manifest.json`, `.trash`) stays in `workspace-actions.ts`.
 */

import {
  createAppError,
  createColumnId,
  createTableId,
  createTimestamp,
  createViewId,
  isId,
  parseTableMeta,
  viewDefSchema,
} from '@curve/domain';
import type {
  AppError,
  ColumnDef,
  TableMeta,
  UuidFactory,
  ValidationIssue,
  ViewDef,
} from '@curve/domain';
import { tableFilePath } from '@curve/persistence';

import { addViewToLayout, firstViewId, removeViewFromLayout } from './layout';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { Draft } from 'immer';

const DEFAULT_STYLE_ID = 'builtin.report-light';
const PRIMARY_KEY_WIDTH = 180;

export interface TableCreatePayload {
  table: TableMeta;
  view: ViewDef;
}

export interface TableDeletePayload {
  tableId: string;
}

export interface TableMetaUpdatePayload {
  tableId: string;
  name: string;
}

export interface TableCommandOptions {
  now?: () => Date;
  uuid?: UuidFactory;
  defaultStyleId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.length > 0 ? issue.path : '<root>'}: ${issue.code}`)
    .join('; ');
}

function invalid(message: string, detail?: string): never {
  throw createAppError('E_VALIDATION', message, detail === undefined ? undefined : { detail });
}

function touchWorkspace(draft: Draft<AppState>, timestamp: string): void {
  if (draft.workspace !== null) {
    draft.workspace.updatedAt = timestamp;
  }
}

/** Validates a fully formed table + view pair before it enters the document. */
function assertTableCreateShape(table: TableMeta, view: ViewDef): void {
  if (table.file !== tableFilePath(table.id)) {
    invalid('The table file path must be tables/<tableId>.jsonl.');
  }
  if (table.rowCount !== 0) {
    invalid('A newly created table must declare rowCount 0.');
  }
  const primary = table.columns.find((column) => column.id === table.primaryKey);
  if (primary === undefined || primary.type !== 'text') {
    invalid('The primary key must be an existing text column.');
  }
  if (view.kind !== 'table' || view.refId !== table.id || view.tableView === undefined) {
    invalid('A table view must reference its table.');
  }
  if (view.tableView.tableId !== table.id) {
    invalid('The view tableView must reference its table.');
  }
  if (
    view.tableView.columnOrder.length !== table.columns.length ||
    !table.columns.every((column) => view.tableView?.columnOrder.includes(column.id))
  ) {
    invalid('The view columnOrder must contain every table column exactly once.');
  }
}

function parseTableCreatePayload(payload: unknown): TableCreatePayload {
  if (!isRecord(payload) || !('table' in payload) || !('view' in payload)) {
    invalid('table.create expects { table, view }.');
  }
  const table = parseTableMeta(payload['table']);
  if (!table.ok) {
    invalid('The table definition is invalid.', describeIssues(table.issues));
  }
  const view = viewDefSchema.safeParse(payload['view']);
  if (!view.success) {
    invalid('The view definition is invalid.');
  }
  assertTableCreateShape(table.data, view.data);
  return { table: table.data, view: view.data };
}

function parseTableId(payload: unknown, command = 'table.delete'): string {
  if (!isRecord(payload) || typeof payload['tableId'] !== 'string') {
    invalid(`${command} expects { tableId }.`);
  }
  const tableId = payload['tableId'];
  if (!isId('tbl', tableId)) {
    invalid('"tableId" must be a valid tbl id.');
  }
  return tableId;
}

function parseTableDeletePayload(payload: unknown): TableDeletePayload {
  return { tableId: parseTableId(payload) };
}

function parseMetaUpdate(payload: unknown): TableMetaUpdatePayload {
  const tableId = parseTableId(payload, 'table.meta.update');
  if (!isRecord(payload) || typeof payload['name'] !== 'string') {
    invalid('table.meta.update expects { tableId, name }.');
  }
  const name = payload['name'].trim();
  if (name.length === 0 || name.length > 80) {
    invalid('The table name must contain 1 to 80 characters.');
  }
  return { tableId, name };
}

/** Builds the default table/view pair for the new-table wizard (T2.1). */
export interface NewTableOptions {
  name: string;
  /** Column key; defaults to `id` (SPEC §9.0). */
  primaryKey?: string;
  now?: Date;
  uuid?: UuidFactory;
  defaultStyleId?: string;
}

export function createNewTablePayload(options: NewTableOptions): TableCreatePayload {
  const name = options.name.trim();
  if (name.length === 0 || name.length > 80) {
    invalid('The table name must contain 1 to 80 characters.');
  }
  const key = (options.primaryKey ?? 'id').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    invalid('The primary key must match ^[A-Za-z_][A-Za-z0-9_]*$.');
  }

  const timestamp = createTimestamp(options.now ?? new Date());
  const tableId = createTableId(options.uuid);
  const columnId = createColumnId(options.uuid);
  const viewId = createViewId(options.uuid);

  const primary: ColumnDef = {
    id: columnId,
    key,
    label: key,
    type: 'text',
    role: 'none',
    required: true,
    width: PRIMARY_KEY_WIDTH,
  };
  const table: TableMeta = {
    id: tableId,
    name,
    file: tableFilePath(tableId),
    schemaVersion: 1,
    columns: [primary],
    primaryKey: columnId,
    rowCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const view: ViewDef = {
    id: viewId,
    kind: 'table',
    refId: tableId,
    title: name,
    tableView: {
      tableId,
      styleId: options.defaultStyleId ?? DEFAULT_STYLE_ID,
      columnOrder: [columnId],
      widths: { [columnId]: PRIMARY_KEY_WIDTH },
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: 1,
    },
  };
  return { table, view };
}

/** Builds a fresh table view for a table that has no view yet (SPEC §9.0). */
export interface OpenTableViewOptions {
  table: TableMeta;
  now?: Date;
  uuid?: UuidFactory;
  defaultStyleId?: string;
}

export function createOpenTableView(options: OpenTableViewOptions): ViewDef {
  const ids = options.table.columns.map((column) => column.id);
  const widths: Record<string, number> = {};
  for (const column of options.table.columns) {
    if (column.width !== undefined) {
      widths[column.id] = column.width;
    }
  }
  return {
    id: createViewId(options.uuid),
    kind: 'table',
    refId: options.table.id,
    title: options.table.name,
    tableView: {
      tableId: options.table.id,
      styleId: options.defaultStyleId ?? DEFAULT_STYLE_ID,
      columnOrder: ids,
      widths,
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: Math.min(1, options.table.columns.length),
    },
  };
}

export function createTableCreateCommand(
  options: TableCommandOptions = {},
): CommandDefinition<TableCreatePayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'table.create',
    parse: parseTableCreatePayload,
    apply(draft, payload) {
      if (draft.tables[payload.table.id] !== undefined) {
        throw createAppError('E_VALIDATION', 'The table already exists.');
      }
      if (draft.views[payload.view.id] !== undefined) {
        throw createAppError('E_VALIDATION', 'The view already exists.');
      }
      draft.tables[payload.table.id] = { table: payload.table, rows: [] };
      draft.views[payload.view.id] = payload.view;
      addViewToLayout(draft.layout, payload.view.id);
      draft.ui.activeTableId = payload.table.id;
      draft.ui.activeViewId = payload.view.id;
      touchWorkspace(draft, createTimestamp(now()));
    },
  };
}

function collectRemovedViewIds(state: Draft<AppState>, tableId: string): Set<string> {
  const removedChartIds = new Set<string>();
  for (const chart of Object.values(state.charts)) {
    if (chart.tableId === tableId) {
      removedChartIds.add(chart.id);
    }
  }
  const removed = new Set<string>();
  for (const view of Object.values(state.views)) {
    if (view.kind === 'table' && view.refId === tableId) {
      removed.add(view.id);
    }
    if (view.kind === 'chart' && removedChartIds.has(view.refId)) {
      removed.add(view.id);
    }
  }
  return removed;
}

export function createTableDeleteCommand(
  options: TableCommandOptions = {},
): CommandDefinition<TableDeletePayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'table.delete',
    parse: parseTableDeletePayload,
    apply(draft, payload) {
      if (draft.tables[payload.tableId] === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.');
      }
      const removedViewIds = collectRemovedViewIds(draft, payload.tableId);
      const removedChartIds = new Set(
        Object.values(draft.charts)
          .filter((chart) => chart.tableId === payload.tableId)
          .map((chart) => chart.id),
      );

      delete draft.tables[payload.tableId];
      for (const chartId of removedChartIds) {
        delete draft.charts[chartId];
      }
      for (const viewId of removedViewIds) {
        delete draft.views[viewId];
        removeViewFromLayout(draft.layout, viewId);
      }

      const activeViewId =
        draft.layout.type === 'pane' ? draft.layout.activeViewId : firstViewId(draft.layout);
      if (activeViewId === null || draft.views[activeViewId] === undefined) {
        draft.ui.activeViewId = null;
        draft.ui.activeTableId = Object.keys(draft.tables)[0] ?? null;
      } else {
        draft.ui.activeViewId = activeViewId;
        const view = draft.views[activeViewId];
        if (view !== undefined && view.kind === 'table') {
          draft.ui.activeTableId = view.refId;
        } else if (view !== undefined) {
          draft.ui.activeTableId = draft.charts[view.refId]?.tableId ?? null;
        }
      }
      touchWorkspace(draft, createTimestamp(now()));
    },
  };
}

export function createTableMetaUpdateCommand(
  options: TableCommandOptions = {},
): CommandDefinition<TableMetaUpdatePayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'table.meta.update',
    parse: parseMetaUpdate,
    apply(draft, payload) {
      const data = draft.tables[payload.tableId];
      if (data === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.');
      }
      const timestamp = createTimestamp(now());
      data.table.name = payload.name;
      data.table.updatedAt = timestamp;
      for (const view of Object.values(draft.views)) {
        if (view.kind === 'table' && view.refId === payload.tableId) {
          view.title = payload.name;
        }
      }
      touchWorkspace(draft, timestamp);
    },
  };
}

/** Error helper kept here so callers can reuse the same shape as the bus. */
export function toTableCommandError(error: unknown): AppError {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return error as AppError;
  }
  return createAppError('E_UNKNOWN', 'The table command failed.');
}
