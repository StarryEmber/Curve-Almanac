import { original } from 'immer';

import { createAppError, createTimestamp, isId } from '@curve/domain';

import { cellIssueToAppError, checkTableCellSet } from '../validation/cell-validation';

import { frozenRows } from './frozen-rows';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { CellEditTarget } from '../validation/cell-validation';
import type { Draft } from 'immer';

export type TableCellSetPayload = CellEditTarget;

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

/**
 * `table.cell.set` (SPEC §13.1): coerce, validate the primary key, replace only
 * the target row and bump the table/workspace timestamps.
 *
 * Validation lives in `checkTableCellSet` so the renderer can show the same
 * structured issue without duplicating rules (T2.2, ADR-028).
 *
 * T2.7 (ADR-033): the row array is replaced with a fresh copy holding the edited
 * row instead of assigning `draft.rows[index]`. Immer finalizes a modified array
 * by iterating every copied element through the draft proxy; on a 100k-row table
 * that turned a single-cell commit into a ~250ms operation (measured). Assigning
 * a plain array makes the whole array one atomic patch, so the commit stays
 * O(1) plus the unavoidable array copy (ADR-011's immutable row model). The
 * trade-off is that the undo patch now carries the previous array reference, so
 * `EditHistory` retains ~800KB per 100k-row edit (T5.2 owns the history budget).
 */
export function createTableCellSetCommand(
  options: TableCellSetCommandOptions = {},
): CommandDefinition<TableCellSetPayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'table.cell.set',
    parse: parsePayload,
    apply(draft: Draft<AppState>, payload: TableCellSetPayload): void {
      // Validate against the unmodified base: running `findIndex` over the draft
      // array also pays Immer's per-element proxy cost (~190ms per Lookup on 100k).
      const base = original(draft) ?? (draft as unknown as AppState);
      const check = checkTableCellSet(base, payload);
      if (!check.ok) {
        throw cellIssueToAppError(check.issue);
      }
      if (!check.changed) {
        return;
      }

      const tableData = draft.tables[payload.tableId];
      if (tableData === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.');
      }
      const baseTable = original(tableData);
      const baseRow = baseTable?.rows[check.rowIndex];
      if (baseRow === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The row does not exist.');
      }

      const values = [...baseRow.values];
      values[check.columnIndex] = check.value;
      const nextRows = [...(baseTable?.rows ?? [])];
      nextRows[check.rowIndex] = { id: baseRow.id, values };
      tableData.rows = frozenRows(nextRows);

      const timestamp = createTimestamp(now());
      tableData.table.updatedAt = timestamp;
      if (draft.workspace !== null) {
        draft.workspace.updatedAt = timestamp;
      }
    },
    dirtyTable: (payload) => payload.tableId,
    mergeKey: (payload) => `table.cell.set:${payload.tableId}:${payload.rowId}:${payload.columnId}`,
  };
}
