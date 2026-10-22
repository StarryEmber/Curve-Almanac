/**
 * `table.import` (SPEC §13.1, T2.5).
 *
 * The command is the only document mutation for an import. It re-validates the
 * rows supplied by the import Worker (physical cells, row ids, primary-key
 * uniqueness and the 200k/100-column caps) inside one Immer transaction, then
 * appends or replaces the row array and syncs new columns into every table
 * view. IO stays in the workspace action and the T2.2 save queue.
 */

import {
  coerceCell,
  createAppError,
  createTimestamp,
  isId,
  parseCell,
  parseColumnDef,
  MAX_COLUMNS_PER_TABLE,
} from '@curve/domain';
import type { ColumnDef, Row } from '@curve/domain';
import { MAX_ROWS_PER_TABLE } from '@curve/table-engine';

import { insertColumnIntoView } from './column-views';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { Draft } from 'immer';

export type ImportMode = 'append' | 'replace';

export interface ImportPayload {
  tableId: string;
  mode: ImportMode;
  /** Fully-typed physical rows produced by the import planner. */
  rows: Row[];
  /** Optional columns appended to the schema; never required. */
  newColumns?: ColumnDef[];
}

export interface ImportCommandOptions {
  now?: () => Date;
}

function cellErrorCode(code: string): 'E_TYPE' | 'E_DUPLICATE_KEY' | 'E_VALIDATION' {
  if (code === 'E_TYPE' || code === 'E_DUPLICATE_KEY') {
    return code;
  }
  return 'E_VALIDATION';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string, detail?: string): never {
  throw createAppError('E_VALIDATION', message, detail === undefined ? undefined : { detail });
}

function parsePayload(payload: unknown): ImportPayload {
  if (!isRecord(payload) || typeof payload['tableId'] !== 'string') {
    invalid('table.import expects { tableId, mode, rows, newColumns? }.');
  }
  const tableId = payload['tableId'];
  if (!isId('tbl', tableId)) {
    invalid('"tableId" must be a valid tbl id.');
  }
  const mode = payload['mode'];
  if (mode !== 'append' && mode !== 'replace') {
    invalid('"mode" must be "append" or "replace".');
  }

  const rawRows = payload['rows'];
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    invalid('"rows" must be a non-empty array.');
  }
  const rows: Row[] = rawRows.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry['id'] !== 'string' || !Array.isArray(entry['values'])) {
      invalid('Every imported row must be { id, values }.');
    }
    if (!isId('row', entry['id'])) {
      invalid('Every imported row id must be a valid row id.');
    }
    return { id: entry['id'], values: [...(entry['values'] as Row['values'])] };
  });

  let newColumns: ColumnDef[] | undefined;
  const rawColumns = payload['newColumns'];
  if (rawColumns !== undefined) {
    if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
      invalid('"newColumns" must be a non-empty array when supplied.');
    }
    newColumns = rawColumns.map((entry: unknown) => {
      const parsed = parseColumnDef(entry);
      if (!parsed.ok) {
        invalid('A new import column definition is invalid.', parsed.issues[0]?.message);
      }
      return parsed.data;
    });
  }

  return { tableId, mode, rows, ...(newColumns === undefined ? {} : { newColumns }) };
}

function touchWorkspace(draft: Draft<AppState>, timestamp: string): void {
  if (draft.workspace !== null) {
    draft.workspace.updatedAt = timestamp;
  }
}

function isBlank(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function validateNewColumns(
  tableColumns: readonly ColumnDef[],
  newColumns: readonly ColumnDef[],
): void {
  if (tableColumns.length + newColumns.length > MAX_COLUMNS_PER_TABLE) {
    throw createAppError(
      'E_TABLE_LIMIT',
      `A table may not exceed ${String(MAX_COLUMNS_PER_TABLE)} columns.`,
      { detail: `columns=${String(tableColumns.length + newColumns.length)}` },
    );
  }
  const ids = new Set(tableColumns.map((column) => column.id));
  const keys = new Set(tableColumns.map((column) => column.key));
  for (const column of newColumns) {
    if (column.required === true) {
      throw createAppError(
        'E_VALIDATION',
        'Columns created by an import must not be required; existing rows cannot supply the value.',
        { detail: `column=${column.id}` },
      );
    }
    if (ids.has(column.id) || keys.has(column.key)) {
      throw createAppError('E_DUPLICATE_KEY', 'A new import column id or key is already used.');
    }
    ids.add(column.id);
    keys.add(column.key);
  }
}

function validateRows(
  rows: readonly Row[],
  columns: readonly ColumnDef[],
  primaryKey: string,
  usedKeys: Set<unknown>,
  usedRowIds: Set<string>,
  append: boolean,
  existingRowCount: number,
): Row[] {
  const keyIndex = columns.findIndex((column) => column.id === primaryKey);
  const keyColumn = columns[keyIndex];
  if (keyColumn === undefined || keyColumn.type !== 'text') {
    throw createAppError('E_WS_INVALID_MANIFEST', 'The table primary key must be a text column.');
  }

  const result: Row[] = [];
  for (const row of rows) {
    if (!isId('row', row.id) || usedRowIds.has(row.id)) {
      throw createAppError('E_DUPLICATE_KEY', 'An imported row id is duplicated or invalid.', {
        detail: `row=${row.id}`,
      });
    }
    if (row.values.length !== columns.length) {
      throw createAppError(
        'E_VALIDATION',
        'Every imported row must match the final table column count.',
        {
          detail: `expected=${String(columns.length)} actual=${String(row.values.length)}`,
        },
      );
    }

    const values: Row['values'] = [];
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      if (column === undefined) {
        continue;
      }
      const value = row.values[index];
      const parsed = parseCell(value, column);
      if (!parsed.ok) {
        throw createAppError(cellErrorCode(parsed.code), parsed.message, {
          detail: `row=${row.id} column=${column.key}`,
        });
      }
      values.push(parsed.value);
    }

    if (isBlank(values[keyIndex])) {
      values[keyIndex] = row.id;
    } else {
      // A non-empty key is already a physical text cell because the column is
      // text; coerce again so a whitespace-only key becomes the generated id.
      const coerced = coerceCell(values[keyIndex], keyColumn);
      if (!coerced.ok) {
        throw createAppError(cellErrorCode(coerced.code), coerced.message);
      }
      values[keyIndex] = coerced.value;
    }

    const key = values[keyIndex] ?? null;
    if (!isBlank(key) && usedKeys.has(key)) {
      throw createAppError('E_DUPLICATE_KEY', 'An imported primary key is already used.', {
        detail: `row=${row.id} key=${String(key)}`,
      });
    }
    if (!isBlank(key)) {
      usedKeys.add(key);
    }
    usedRowIds.add(row.id);
    result.push({ id: row.id, values });
  }

  const finalCount = append ? existingRowCount + result.length : result.length;
  if (finalCount > MAX_ROWS_PER_TABLE) {
    throw createAppError(
      'E_TABLE_LIMIT',
      `A table may not exceed ${String(MAX_ROWS_PER_TABLE)} rows.`,
      { detail: `rowCount=${String(finalCount)} max=${String(MAX_ROWS_PER_TABLE)}` },
    );
  }
  return result;
}

export function createImportCommand(
  options: ImportCommandOptions = {},
): CommandDefinition<ImportPayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'table.import',
    parse: parsePayload,
    apply(draft, payload) {
      const data = draft.tables[payload.tableId];
      if (data === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${payload.tableId}`,
        });
      }

      const newColumns = payload.newColumns ?? [];
      validateNewColumns(data.table.columns, newColumns);
      const columns = [...data.table.columns, ...newColumns];
      const keyIndex = columns.findIndex((column) => column.id === data.table.primaryKey);

      const usedKeys = new Set<unknown>();
      if (payload.mode === 'append') {
        for (const row of data.rows) {
          const key = row.values[keyIndex] ?? null;
          if (!isBlank(key)) {
            usedKeys.add(key);
          }
        }
      }
      const usedRowIds = new Set(payload.mode === 'append' ? data.rows.map((row) => row.id) : []);
      const imported = validateRows(
        payload.rows,
        columns,
        data.table.primaryKey,
        usedKeys,
        usedRowIds,
        payload.mode === 'append',
        data.rows.length,
      );

      if (payload.mode === 'append') {
        const nextRows = data.rows.map((row) => {
          if (newColumns.length === 0) {
            return row;
          }
          const values = [...row.values];
          while (values.length < columns.length) {
            const column = columns[values.length];
            values.push(column?.type === 'text' ? '' : null);
          }
          return { id: row.id, values };
        });
        data.rows = [...nextRows, ...imported];
      } else {
        data.rows = imported;
      }

      const timestamp = createTimestamp(now());
      data.table = {
        ...data.table,
        columns,
        rowCount: data.rows.length,
        updatedAt: timestamp,
      };

      if (newColumns.length > 0) {
        for (const view of Object.values(draft.views)) {
          if (
            view.kind !== 'table' ||
            view.refId !== payload.tableId ||
            view.tableView === undefined
          ) {
            continue;
          }
          for (const column of newColumns) {
            const index = columns.findIndex((candidate) => candidate.id === column.id);
            if (index >= 0) {
              view.tableView = insertColumnIntoView(view.tableView, column.id, index);
            }
          }
        }
      }

      touchWorkspace(draft, timestamp);
    },
    dirtyTable: (payload) => payload.tableId,
  };
}
