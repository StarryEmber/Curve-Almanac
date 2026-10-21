import {
  createAppError,
  createTimestamp,
  isId,
  parseColumnDef,
  planColumnAdd,
  planColumnDelete,
  planColumnReorder,
  planColumnUpdate,
} from '@curve/domain';
import type { ColumnDef } from '@curve/domain';

import { insertColumnIntoView, removeColumnFromView, reorderViewColumns } from './column-views';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { Draft } from 'immer';

/**
 * Structural column commands (SPEC §13.1 `table.column.add/update/delete/reorder`).
 *
 * Every command applies one all-or-nothing plan from `@curve/domain` inside the
 * Immer transaction, then repairs every table view of that table (SPEC §6.6.7).
 * Charts and table styles are intentionally untouched: a chart whose mapping
 * loses a column loads in the invalid/remap state instead (SPEC §19).
 */

export interface ColumnAddPayload {
  tableId: string;
  column: ColumnDef;
  index?: number;
}

export interface ColumnUpdatePayload {
  tableId: string;
  column: ColumnDef;
}

export interface ColumnDeletePayload {
  tableId: string;
  columnId: string;
}

export interface ColumnReorderPayload {
  tableId: string;
  columnIds: string[];
}

export interface ColumnCommandOptions {
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw createAppError('E_VALIDATION', message);
}

function parseTableId(payload: unknown, command: string): string {
  if (!isRecord(payload) || typeof payload['tableId'] !== 'string') {
    invalid(`${command} expects { tableId }.`);
  }
  const tableId = payload['tableId'];
  if (!isId('tbl', tableId)) {
    invalid('"tableId" must be a valid tbl id.');
  }
  return tableId;
}

function parseColumn(value: unknown): ColumnDef {
  const parsed = parseColumnDef(value);
  if (!parsed.ok) {
    invalid('The column definition is invalid.');
  }
  return parsed.data;
}

function parseColumnId(value: unknown): string {
  if (typeof value !== 'string' || !isId('col', value)) {
    invalid('"columnId" must be a valid col id.');
  }
  return value;
}

function parseAdd(payload: unknown): ColumnAddPayload {
  const tableId = parseTableId(payload, 'table.column.add');
  if (!isRecord(payload) || !('column' in payload)) {
    invalid('table.column.add expects { tableId, column }.');
  }
  const column = parseColumn(payload['column']);
  const index = payload['index'];
  if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index))) {
    invalid('"index" must be an integer.');
  }
  return { tableId, column, ...(index === undefined ? {} : { index }) };
}

function parseUpdate(payload: unknown): ColumnUpdatePayload {
  const tableId = parseTableId(payload, 'table.column.update');
  if (!isRecord(payload) || !('column' in payload)) {
    invalid('table.column.update expects { tableId, column }.');
  }
  return { tableId, column: parseColumn(payload['column']) };
}

function parseDelete(payload: unknown): ColumnDeletePayload {
  const tableId = parseTableId(payload, 'table.column.delete');
  if (!isRecord(payload)) {
    invalid('table.column.delete expects { tableId, columnId }.');
  }
  return { tableId, columnId: parseColumnId(payload['columnId']) };
}

function parseReorder(payload: unknown): ColumnReorderPayload {
  const tableId = parseTableId(payload, 'table.column.reorder');
  if (!isRecord(payload) || !Array.isArray(payload['columnIds'])) {
    invalid('table.column.reorder expects { tableId, columnIds }.');
  }
  const columnIds = payload['columnIds'].map((value: unknown) => parseColumnId(value));
  return { tableId, columnIds };
}

function touchWorkspace(draft: Draft<AppState>, timestamp: string): void {
  if (draft.workspace !== null) {
    draft.workspace.updatedAt = timestamp;
  }
}

function requireTable(draft: Draft<AppState>, tableId: string) {
  const data = draft.tables[tableId];
  if (data === undefined) {
    throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
      detail: `table=${tableId}`,
    });
  }
  return data;
}

export function createColumnAddCommand(
  options: ColumnCommandOptions = {},
): CommandDefinition<ColumnAddPayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'table.column.add',
    parse: parseAdd,
    apply(draft, payload) {
      const data = requireTable(draft, payload.tableId);
      const plan = planColumnAdd(data.table, data.rows, payload.column, payload.index);
      if (!plan.ok) {
        throw plan.error;
      }
      const timestamp = createTimestamp(now());
      data.table = { ...plan.table, updatedAt: timestamp };
      data.rows = [...plan.rows];

      const index = payload.index ?? data.table.columns.length - 1;
      for (const view of Object.values(draft.views)) {
        if (
          view.kind === 'table' &&
          view.refId === payload.tableId &&
          view.tableView !== undefined
        ) {
          view.tableView = insertColumnIntoView(view.tableView, payload.column.id, index);
        }
      }
      touchWorkspace(draft, timestamp);
    },
  };
}

export function createColumnUpdateCommand(
  options: ColumnCommandOptions = {},
): CommandDefinition<ColumnUpdatePayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'table.column.update',
    parse: parseUpdate,
    apply(draft, payload) {
      const data = requireTable(draft, payload.tableId);
      const current = data.table.columns.find((column) => column.id === payload.column.id);
      if (
        current !== undefined &&
        current.type !== payload.column.type &&
        payload.column.fieldTypeId !== undefined &&
        payload.column.fieldTypeId !== payload.column.type
      ) {
        invalid('A field type must store its declared column type.');
      }

      const plan = planColumnUpdate(data.table, data.rows, payload.column);
      if (!plan.ok) {
        throw plan.error;
      }
      data.table = { ...plan.table, updatedAt: createTimestamp(now()) };
      data.rows = [...plan.rows];
      touchWorkspace(draft, data.table.updatedAt);
    },
  };
}

export function createColumnDeleteCommand(
  options: ColumnCommandOptions = {},
): CommandDefinition<ColumnDeletePayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'table.column.delete',
    parse: parseDelete,
    apply(draft, payload) {
      const data = requireTable(draft, payload.tableId);
      const plan = planColumnDelete(data.table, data.rows, payload.columnId);
      if (!plan.ok) {
        throw plan.error;
      }
      const timestamp = createTimestamp(now());
      data.table = { ...plan.table, updatedAt: timestamp };
      data.rows = [...plan.rows];

      for (const view of Object.values(draft.views)) {
        if (
          view.kind === 'table' &&
          view.refId === payload.tableId &&
          view.tableView !== undefined
        ) {
          view.tableView = removeColumnFromView(view.tableView, payload.columnId);
        }
      }
      touchWorkspace(draft, timestamp);
    },
  };
}

export function createColumnReorderCommand(
  options: ColumnCommandOptions = {},
): CommandDefinition<ColumnReorderPayload> {
  const now = options.now ?? ((): Date => new Date());
  return {
    name: 'table.column.reorder',
    parse: parseReorder,
    apply(draft, payload) {
      const data = requireTable(draft, payload.tableId);
      const plan = planColumnReorder(data.table, data.rows, payload.columnIds);
      if (!plan.ok) {
        throw plan.error;
      }
      const timestamp = createTimestamp(now());
      data.table = { ...plan.table, updatedAt: timestamp };
      data.rows = [...plan.rows];

      for (const view of Object.values(draft.views)) {
        if (
          view.kind === 'table' &&
          view.refId === payload.tableId &&
          view.tableView !== undefined
        ) {
          view.tableView = reorderViewColumns(view.tableView, payload.columnIds);
        }
      }
      touchWorkspace(draft, timestamp);
    },
  };
}
