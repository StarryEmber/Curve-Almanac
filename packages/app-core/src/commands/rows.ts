/**
 * `table.rows.insert` (SPEC §13.1, T2.4).
 *
 * The command accepts raw cell values, coerces them with the same `coerceCell`
 * used by inline editing and paste, and appends/prepends whole rows atomically.
 * An empty text primary key is filled with the row id (`row_<uuid>`), matching
 * SPEC §9.2; explicitly provided keys are checked for uniqueness.
 *
 * The paste command does not dispatch this command (one command per paste), but
 * T2.5/T2.6 can reuse it to add rows without going through the matrix planner.
 */

import { coerceCell, createAppError, createRowId, createTimestamp, isId } from '@curve/domain';
import type { Cell, Row, UuidFactory } from '@curve/domain';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { Draft } from 'immer';

export interface RowInsertItem {
  /** Optional explicit id; generated when omitted. Must be a `row_` id. */
  id?: string;
  /** One raw value per table column, in schema order. */
  values: readonly unknown[];
}

export interface RowsInsertPayload {
  tableId: string;
  /** Insertion index; `rows.length` appends. */
  index: number;
  rows: readonly RowInsertItem[];
}

export interface RowsInsertCommandOptions {
  now?: () => Date;
  uuid?: UuidFactory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string, detail?: string): never {
  throw createAppError('E_VALIDATION', message, detail === undefined ? undefined : { detail });
}

function parsePayload(payload: unknown): RowsInsertPayload {
  if (!isRecord(payload) || typeof payload['tableId'] !== 'string') {
    invalid('table.rows.insert expects { tableId, index, rows }.');
  }
  const tableId = payload['tableId'];
  if (!isId('tbl', tableId)) {
    invalid('"tableId" must be a valid tbl id.');
  }
  const rawIndex = payload['index'];
  if (typeof rawIndex !== 'number' || !Number.isInteger(rawIndex) || rawIndex < 0) {
    invalid('"index" must be a non-negative integer.');
  }
  const rawRows = payload['rows'];
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    invalid('"rows" must be a non-empty array.');
  }

  const rows: RowInsertItem[] = rawRows.map((entry: unknown) => {
    if (!isRecord(entry) || !Array.isArray(entry['values'])) {
      invalid('Every inserted row must have a values array.');
    }
    const id = entry['id'];
    if (id !== undefined && (typeof id !== 'string' || !isId('row', id))) {
      invalid('An inserted row id must be a valid row id.');
    }
    return {
      ...(id === undefined ? {} : { id }),
      values: [...(entry['values'] as unknown[])],
    };
  });

  return { tableId, index: rawIndex, rows };
}

function isBlank(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function touchWorkspace(draft: Draft<AppState>, timestamp: string): void {
  if (draft.workspace !== null) {
    draft.workspace.updatedAt = timestamp;
  }
}

export function createRowInsertCommand(
  options: RowsInsertCommandOptions = {},
): CommandDefinition<RowsInsertPayload> {
  const now = options.now ?? ((): Date => new Date());
  const uuid = options.uuid;

  return {
    name: 'table.rows.insert',
    parse: parsePayload,
    apply(draft, payload) {
      const data = draft.tables[payload.tableId];
      if (data === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${payload.tableId}`,
        });
      }
      if (payload.index > data.rows.length) {
        invalid('"index" is beyond the end of the table.', `index=${String(payload.index)}`);
      }

      const table = data.table;
      const columns = table.columns;
      const keyIndex = columns.findIndex((column) => column.id === table.primaryKey);
      if (keyIndex < 0) {
        throw createAppError('E_WS_INVALID_MANIFEST', 'The primary key column does not exist.');
      }
      const keyColumn = columns[keyIndex];
      if (keyColumn === undefined || keyColumn.type !== 'text') {
        throw createAppError('E_VALIDATION', 'The primary key must be a text column.');
      }

      const usedRowIds = new Set(data.rows.map((row) => row.id));
      const usedKeys = new Set<Cell>();
      for (const row of data.rows) {
        const key = row.values[keyIndex] ?? null;
        if (key !== null && key !== '') {
          usedKeys.add(key);
        }
      }

      const inserted: Row[] = [];
      for (const item of payload.rows) {
        if (item.values.length !== columns.length) {
          invalid(
            'Every inserted row must match the table column count.',
            `expected=${String(columns.length)} actual=${String(item.values.length)}`,
          );
        }

        const values: Cell[] = [];
        for (let index = 0; index < columns.length; index += 1) {
          const column = columns[index];
          if (column === undefined) {
            continue;
          }
          const raw = item.values[index];
          if (index === keyIndex && isBlank(raw)) {
            values.push(null);
            continue;
          }
          const coerced = coerceCell(raw, column);
          if (!coerced.ok) {
            invalid(`A value for column "${column.key}" is invalid.`, coerced.message);
          }
          values.push(coerced.value);
        }

        let id = item.id;
        if (id === undefined) {
          for (let attempt = 0; attempt < 8 && id === undefined; attempt += 1) {
            const candidate = createRowId(uuid);
            if (!usedRowIds.has(candidate)) {
              id = candidate;
            }
          }
        } else if (usedRowIds.has(id)) {
          throw createAppError('E_DUPLICATE_KEY', 'An inserted row id is already used.', {
            detail: `row=${id}`,
          });
        }
        if (id === undefined) {
          throw createAppError('E_UNKNOWN', 'Could not generate a unique row id.');
        }
        const rowId: string = id;
        usedRowIds.add(rowId);

        if (isBlank(values[keyIndex])) {
          values[keyIndex] = rowId;
        }
        const key = values[keyIndex] ?? null;
        if (key !== null && key !== '' && usedKeys.has(key)) {
          throw createAppError('E_DUPLICATE_KEY', 'An inserted primary key is already used.', {
            detail: `key=${String(key)}`,
          });
        }
        if (key !== null && key !== '') {
          usedKeys.add(key);
        }

        inserted.push({ id: rowId, values });
      }

      data.rows.splice(payload.index, 0, ...inserted);
      const timestamp = createTimestamp(now());
      data.table = { ...table, rowCount: data.rows.length, updatedAt: timestamp };
      touchWorkspace(draft, timestamp);
    },
    dirtyTable: (payload) => payload.tableId,
  };
}
