/**
 * Structured single-cell and batch validation (T2.2, SPEC §9.2).
 *
 * `coerceCell` owns normalisation; this module adds the table-aware rules the
 * grid and the command share (row/column existence, primary-key emptiness and
 * uniqueness) and returns machine-readable issues. The renderer localises the
 * issue by `reason`; the English `message` is for logs and tests only.
 */

import { coerceCell } from '@curve/domain';
import type { Cell, ColumnDef, Row, TableMeta } from '@curve/domain';

import { cellIssueFromResult } from './cell-issue';

import type { CellIssue } from './cell-issue';
import type { FieldTypeLookup, FieldTypeRule } from './field-types';
import type { AppState } from '../state/types';

export type { CellIssue, CellIssueReason } from './cell-issue';
export { cellIssueFromResult, cellIssueToAppError, unknownCellIssue } from './cell-issue';

export interface CellEditTarget {
  tableId: string;
  rowId: string;
  columnId: string;
  value: unknown;
}

export type CellEdit = Omit<CellEditTarget, 'tableId'>;

/**
 * T6.2: semantic field types (plugin contributions). Omitted means "storage
 * rules only", which keeps every pre-T6.2 caller working.
 */
export interface CellValidationOptions {
  fieldTypes?: FieldTypeLookup;
}

export type CellSetCheck =
  | {
      ok: true;
      value: Cell;
      changed: boolean;
      rowIndex: number;
      columnIndex: number;
    }
  | { ok: false; issue: CellIssue };

function isEmptyInput(value: unknown): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function findDuplicateKeyRow(
  rows: readonly Row[],
  keyIndex: number,
  value: Cell,
  rowIndex: number,
): { index: number; row: Row } | null {
  for (const [index, row] of rows.entries()) {
    if (index === rowIndex) {
      continue;
    }
    if (row.values[keyIndex] === value) {
      return { index, row };
    }
  }
  return null;
}

/**
 * Applies the storage coercion first, then the semantic field type (T6.2).
 *
 * The storage rule decides the physical cell shape (`coerceCell`); the plugin
 * field type may normalise the text further (`parseText`, e.g. `"3"` -> `3`) and
 * reject values the storage type alone would accept (`rating` 0/6).
 */
function coerceWithFieldType(
  raw: unknown,
  column: ColumnDef,
  fieldType: FieldTypeRule | undefined,
  rowNumber: number,
): { ok: true; value: Cell } | { ok: false; issue: CellIssue } {
  const coerced = coerceCell(raw, column);
  if (!coerced.ok) {
    return { ok: false, issue: cellIssueFromResult(coerced, column, rowNumber) };
  }
  if (fieldType === undefined) {
    return { ok: true, value: coerced.value };
  }

  let value = coerced.value;
  if (typeof raw === 'string') {
    const parsed = fieldType.parseText(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        issue: {
          reason: 'type',
          code: 'E_TYPE',
          columnId: column.id,
          rowNumber,
          message: parsed.message,
        },
      };
    }
    value = parsed.value;
  }
  const message = fieldType.validate(value, column);
  if (message !== null) {
    return {
      ok: false,
      issue: {
        reason: 'range',
        code: 'E_VALIDATION',
        columnId: column.id,
        rowNumber,
        message,
      },
    };
  }
  return { ok: true, value };
}

/**
 * Validates one `table.cell.set` payload against the current document.
 *
 * The command and the renderer use the same function, so the command cannot
 * accept a value the editor rejected (or vice versa).
 */
export function checkTableCellSet(
  state: Pick<AppState, 'tables'>,
  payload: CellEditTarget,
  options: CellValidationOptions = {},
): CellSetCheck {
  const tableData = state.tables[payload.tableId];
  if (tableData === undefined) {
    return {
      ok: false,
      issue: {
        reason: 'table-not-found',
        code: 'E_TABLE_NOT_FOUND',
        message: 'The table does not exist.',
      },
    };
  }
  const table = tableData.table;
  const columnIndex = table.columns.findIndex((candidate) => candidate.id === payload.columnId);
  if (columnIndex < 0) {
    return {
      ok: false,
      issue: {
        reason: 'column-not-found',
        code: 'E_VALIDATION',
        columnId: payload.columnId,
        message: 'The column does not exist.',
      },
    };
  }
  const column = table.columns[columnIndex];
  if (column === undefined) {
    return {
      ok: false,
      issue: {
        reason: 'column-not-found',
        code: 'E_VALIDATION',
        columnId: payload.columnId,
        message: 'The column does not exist.',
      },
    };
  }

  const rowIndex = tableData.rows.findIndex((row) => row.id === payload.rowId);
  if (rowIndex < 0) {
    return {
      ok: false,
      issue: {
        reason: 'row-not-found',
        code: 'E_TABLE_NOT_FOUND',
        columnId: column.id,
        message: 'The row does not exist.',
      },
    };
  }
  const row = tableData.rows[rowIndex];
  if (row === undefined) {
    return {
      ok: false,
      issue: {
        reason: 'row-not-found',
        code: 'E_TABLE_NOT_FOUND',
        columnId: column.id,
        message: 'The row does not exist.',
      },
    };
  }
  if (row.values.length !== table.columns.length) {
    return {
      ok: false,
      issue: {
        reason: 'row-shape',
        code: 'E_WS_INVALID_MANIFEST',
        columnId: column.id,
        rowNumber: rowIndex + 1,
        message: 'The row does not match the table columns.',
      },
    };
  }

  const current = row.values[columnIndex] ?? null;
  if (current === payload.value) {
    return { ok: true, value: current, changed: false, rowIndex, columnIndex };
  }

  if (column.id === table.primaryKey && isEmptyInput(payload.value)) {
    return {
      ok: false,
      issue: {
        reason: 'primary-key-empty',
        code: 'E_VALIDATION',
        columnId: column.id,
        rowNumber: rowIndex + 1,
        message: 'The primary key must not be empty.',
      },
    };
  }

  const fieldType =
    column.fieldTypeId === undefined ? undefined : options.fieldTypes?.(column.fieldTypeId);
  const coerced = coerceWithFieldType(payload.value, column, fieldType, rowIndex + 1);
  if (!coerced.ok) {
    return coerced;
  }

  if (column.id === table.primaryKey) {
    const keyIndex = table.columns.findIndex((candidate) => candidate.id === table.primaryKey);
    if (keyIndex < 0) {
      return {
        ok: false,
        issue: {
          reason: 'row-shape',
          code: 'E_WS_INVALID_MANIFEST',
          columnId: column.id,
          rowNumber: rowIndex + 1,
          message: 'The primary key column does not exist.',
        },
      };
    }
    const duplicate = findDuplicateKeyRow(tableData.rows, keyIndex, coerced.value, rowIndex);
    if (duplicate !== null) {
      return {
        ok: false,
        issue: {
          reason: 'duplicate-key',
          code: 'E_DUPLICATE_KEY',
          columnId: column.id,
          rowNumber: rowIndex + 1,
          conflictRowNumber: duplicate.index + 1,
          conflictRowId: duplicate.row.id,
          message: `The primary key value is already used by row ${String(duplicate.index + 1)}.`,
        },
      };
    }
  }

  return {
    ok: true,
    value: coerced.value,
    changed: current !== coerced.value,
    rowIndex,
    columnIndex,
  };
}

function cloneRowValues(row: Row): Cell[] {
  return [...row.values];
}

/**
 * Validates a batch without writing it (SPEC §9.2: "先整体校验").
 *
 * Edits are applied to a per-row overlay in memory, then primary-key uniqueness
 * is checked once over the final overlay. That makes a key swap inside one
 * batch valid while still rejecting a duplicate created by the batch itself.
 */
export function validateCellBatch(
  table: TableMeta,
  rows: readonly Row[],
  edits: readonly CellEdit[],
  options: CellValidationOptions = {},
): CellIssue[] {
  const issues: CellIssue[] = [];
  const rowIndexById = new Map(rows.map((row, index) => [row.id, index]));
  const columnIndexById = new Map(table.columns.map((column, index) => [column.id, index]));
  const overlays = new Map<number, Cell[]>();

  const valuesAt = (rowIndex: number): Cell[] | undefined =>
    overlays.get(rowIndex) ?? rows[rowIndex]?.values;

  for (const edit of edits) {
    const rowIndex = rowIndexById.get(edit.rowId);
    if (rowIndex === undefined) {
      issues.push({
        reason: 'row-not-found',
        code: 'E_TABLE_NOT_FOUND',
        columnId: edit.columnId,
        message: `The row "${edit.rowId}" does not exist.`,
      });
      continue;
    }
    const columnIndex = columnIndexById.get(edit.columnId);
    if (columnIndex === undefined) {
      issues.push({
        reason: 'column-not-found',
        code: 'E_VALIDATION',
        columnId: edit.columnId,
        rowNumber: rowIndex + 1,
        message: `The column "${edit.columnId}" does not exist.`,
      });
      continue;
    }
    const row = rows[rowIndex];
    const column = table.columns[columnIndex];
    if (row === undefined || column === undefined) {
      continue;
    }
    if (row.values.length !== table.columns.length) {
      issues.push({
        reason: 'row-shape',
        code: 'E_WS_INVALID_MANIFEST',
        columnId: column.id,
        rowNumber: rowIndex + 1,
        message: 'The row does not match the table columns.',
      });
      continue;
    }

    const values = valuesAt(rowIndex);
    const current = values?.[columnIndex] ?? null;
    if (current === edit.value) {
      continue;
    }
    if (column.id === table.primaryKey && isEmptyInput(edit.value)) {
      issues.push({
        reason: 'primary-key-empty',
        code: 'E_VALIDATION',
        columnId: column.id,
        rowNumber: rowIndex + 1,
        message: 'The primary key must not be empty.',
      });
      continue;
    }

    const fieldType =
      column.fieldTypeId === undefined ? undefined : options.fieldTypes?.(column.fieldTypeId);
    const coerced = coerceWithFieldType(edit.value, column, fieldType, rowIndex + 1);
    if (!coerced.ok) {
      issues.push(coerced.issue);
      continue;
    }

    const nextValues = overlays.get(rowIndex) ?? cloneRowValues(row);
    nextValues[columnIndex] = coerced.value;
    overlays.set(rowIndex, nextValues);
  }

  const keyIndex = table.columns.findIndex((column) => column.id === table.primaryKey);
  if (keyIndex >= 0) {
    const owners = new Map<Cell, number>();
    for (const [index, row] of rows.entries()) {
      const values = valuesAt(index) ?? row.values;
      const key = values[keyIndex] ?? null;
      const first = owners.get(key);
      if (first !== undefined && key !== null && key !== '') {
        issues.push({
          reason: 'duplicate-key',
          code: 'E_DUPLICATE_KEY',
          columnId: table.primaryKey,
          rowNumber: index + 1,
          conflictRowNumber: first + 1,
          conflictRowId: rows[first]?.id,
          message: `The primary key value is already used by row ${String(first + 1)}.`,
        });
      } else {
        owners.set(key, index);
      }
    }
  }

  return issues;
}
