import { coerceCell, createAppError, createTimestamp, isId } from '@curve/domain';
import type { AppError, CellResult, ColumnDef } from '@curve/domain';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { Draft } from 'immer';

export interface TableCellSetPayload {
  tableId: string;
  rowId: string;
  columnId: string;
  value: unknown;
}

export interface TableCellSetCommandOptions {
  /** Injected so `updatedAt` assertions are deterministic. */
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireId(
  payload: Record<string, unknown>,
  key: 'tableId' | 'rowId' | 'columnId',
  prefix: 'tbl' | 'row' | 'col',
): string {
  const value = payload[key];
  if (typeof value !== 'string' || !isId(prefix, value)) {
    throw createAppError('E_VALIDATION', `"${key}" must be a valid ${prefix} id.`);
  }
  return value;
}

function parsePayload(payload: unknown): TableCellSetPayload {
  if (!isRecord(payload)) {
    throw createAppError('E_VALIDATION', 'table.cell.set expects an object payload.');
  }
  if (!('value' in payload)) {
    throw createAppError('E_VALIDATION', 'table.cell.set requires a "value" property.');
  }
  return {
    tableId: requireId(payload, 'tableId', 'tbl'),
    rowId: requireId(payload, 'rowId', 'row'),
    columnId: requireId(payload, 'columnId', 'col'),
    value: payload['value'],
  };
}

type FailedCellResult = Extract<CellResult, { ok: false }>;

function cellError(column: ColumnDef, result: FailedCellResult): AppError {
  // Domain validation codes are deliberately finer-grained than SPEC §18; the
  // renderer still gets a stable AppError code while the message keeps detail.
  const code =
    result.code === 'E_DUPLICATE_KEY'
      ? 'E_DUPLICATE_KEY'
      : result.code === 'E_TYPE'
        ? 'E_TYPE'
        : 'E_VALIDATION';
  return createAppError(code, result.message, { detail: `column=${column.id}` });
}

function assertPrimaryKeyUnique(
  state: Draft<AppState>,
  tableId: string,
  rowIndex: number,
  column: ColumnDef,
  value: unknown,
): void {
  if (value === null || value === '') {
    throw createAppError('E_VALIDATION', 'The primary key must not be empty.');
  }
  const table = state.tables[tableId];
  if (table === undefined) {
    return;
  }
  const keyIndex = table.table.columns.findIndex(
    (candidate) => candidate.id === table.table.primaryKey,
  );
  if (keyIndex < 0) {
    throw createAppError('E_WS_INVALID_MANIFEST', 'The primary key column does not exist.');
  }
  for (const [index, row] of table.rows.entries()) {
    if (index !== rowIndex && row.values[keyIndex] === value) {
      throw createAppError(
        'E_DUPLICATE_KEY',
        `The primary key value is already used by row "${row.id}".`,
        { detail: `column=${column.id}` },
      );
    }
  }
}

/**
 * `table.cell.set` (SPEC §13.1): coerce, validate the primary key, replace only
 * the target row and bump the table/workspace timestamps.
 */
export function createTableCellSetCommand(
  options: TableCellSetCommandOptions = {},
): CommandDefinition<TableCellSetPayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'table.cell.set',
    parse: parsePayload,
    apply(draft: Draft<AppState>, payload: TableCellSetPayload): void {
      const tableData = draft.tables[payload.tableId];
      if (tableData === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.');
      }
      const table = tableData.table;
      const column = table.columns.find((candidate) => candidate.id === payload.columnId);
      if (column === undefined) {
        throw createAppError('E_VALIDATION', 'The column does not exist.');
      }
      const columnIndex = table.columns.indexOf(column);

      const rowIndex = tableData.rows.findIndex((row) => row.id === payload.rowId);
      if (rowIndex < 0) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The row does not exist.');
      }
      const row = tableData.rows[rowIndex];
      if (row === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The row does not exist.');
      }
      if (row.values.length !== table.columns.length) {
        throw createAppError('E_WS_INVALID_MANIFEST', 'The row does not match the table columns.');
      }
      if (row.values[columnIndex] === payload.value) {
        return;
      }

      const coerced = coerceCell(payload.value, column);
      if (!coerced.ok) {
        throw cellError(column, coerced);
      }
      if (column.id === table.primaryKey) {
        assertPrimaryKeyUnique(draft, payload.tableId, rowIndex, column, coerced.value);
      }
      if (row.values[columnIndex] === coerced.value) {
        return;
      }

      const values = [...row.values];
      values[columnIndex] = coerced.value;
      tableData.rows[rowIndex] = { id: row.id, values };

      const timestamp = createTimestamp(now());
      table.updatedAt = timestamp;
      if (draft.workspace !== null) {
        draft.workspace.updatedAt = timestamp;
      }
    },
    dirtyTable: (payload) => payload.tableId,
    mergeKey: (payload) => `table.cell.set:${payload.tableId}:${payload.rowId}:${payload.columnId}`,
  };
}
