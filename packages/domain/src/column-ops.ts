import { coerceCell } from './coerce';
import { createAppError } from './errors';
import { checkTable } from './invariants';
import { MAX_COLUMNS_PER_TABLE, MAX_REPORTED_ISSUES } from './limits';
import { parseCell, parseColumnDef } from './schemas';

import type { AppError } from './errors';
import type {
  Cell,
  ColumnDef,
  EnumOption,
  Row,
  TableMeta,
  ValidationIssue,
  ValidationIssueCode,
} from './types';

/**
 * Pure, in-memory plans for structural column changes (T2.3).
 *
 * A plan is all-or-nothing: it either returns the next `TableMeta` + rows, or a
 * failure carrying the first 100 row-level problems. It never mutates its
 * inputs, never touches the view/manifest shape and never performs IO. The
 * command layer applies a successful plan inside one Immer transaction, so a
 * failed conversion cannot leave a half-migrated document behind.
 */

export interface ColumnChangeFailure {
  /** 1-based row number, matching the status bar and import reports. */
  rowNumber: number;
  rowId: string;
  value: Cell;
  code: ValidationIssueCode;
  message: string;
}

export interface ColumnChangeSuccess {
  ok: true;
  table: TableMeta;
  rows: Row[];
  affectedRows: number;
  /** Cells whose stored value changed during a type conversion. */
  convertedCells: number;
}

export interface ColumnChangeError {
  ok: false;
  error: AppError;
  failures: readonly ColumnChangeFailure[];
  totalFailures: number;
}

export type ColumnChangePlan = ColumnChangeSuccess | ColumnChangeError;

function fail(
  error: AppError,
  failures: readonly ColumnChangeFailure[] = [],
  totalFailures = failures.length,
): ColumnChangeError {
  return { ok: false, error, failures, totalFailures };
}

function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.length > 0 ? issue.path : '<root>'}: ${issue.code}`)
    .join('; ');
}

function validateColumn(column: ColumnDef): ColumnChangeError | null {
  const parsed = parseColumnDef(column);
  if (parsed.ok) {
    return null;
  }
  return fail(
    createAppError('E_VALIDATION', 'The column definition is invalid.', {
      detail: describeIssues(parsed.issues),
    }),
  );
}

function validateSchema(table: TableMeta): ColumnChangeError | null {
  const report = checkTable(table);
  if (report.issues.length === 0) {
    return null;
  }
  const first = report.issues[0]?.code;
  const code = first === 'E_TYPE' || first === 'E_DUPLICATE_KEY' ? first : 'E_VALIDATION';
  return fail(
    createAppError(code, 'The changed table schema violates a domain invariant.', {
      detail: describeIssues(report.issues),
    }),
  );
}

function cloneRows(rows: readonly Row[]): Row[] {
  return rows.map((row) => ({ id: row.id, values: [...row.values] }));
}

function isBlank(value: Cell | undefined): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function sameEnumOptions(
  left: readonly EnumOption[] | undefined,
  right: readonly EnumOption[] | undefined,
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return (
    a.length === b.length &&
    a.every((option, index) => option.value === b[index]?.value && option.label === b[index]?.label)
  );
}

type CellConversion =
  | { ok: true; rows: Row[]; convertedCells: number }
  | { ok: false; failures: ColumnChangeFailure[]; totalFailures: number };

/**
 * Rewrites one value per row for a type/required/enum change.
 *
 * `coerceCell` is the same lenient normaliser used by inline editing and (later)
 * paste/import, so a cell that converts here is exactly a cell the editor would
 * accept. Nulls are preserved instead of becoming `""` for text columns.
 */
function convertCells(
  rows: readonly Row[],
  index: number,
  column: ColumnDef,
  typeChanged: boolean,
): CellConversion {
  const nextRows: Row[] = [];
  const failures: ColumnChangeFailure[] = [];
  let totalFailures = 0;
  let convertedCells = 0;

  rows.forEach((row, rowIndex) => {
    const raw = row.values[index] ?? null;
    let nextValue: Cell = raw;
    let code: ValidationIssueCode | null = null;
    let message = '';

    if (typeChanged) {
      if (raw === null || raw === undefined) {
        if (column.required === true) {
          code = 'E_REQUIRED';
          message = `column "${column.key}" is required`;
        } else {
          nextValue = null;
        }
      } else {
        const result = coerceCell(raw, column);
        if (result.ok) {
          nextValue = result.value;
          if (nextValue !== raw) {
            convertedCells += 1;
          }
        } else {
          code = result.code;
          message = result.message;
        }
      }
    } else if (column.required === true && isBlank(raw)) {
      code = 'E_REQUIRED';
      message = `column "${column.key}" is required`;
    } else {
      const result = parseCell(raw, column);
      if (!result.ok) {
        code = result.code;
        message = result.message;
      }
    }

    if (code === null) {
      const values = [...row.values];
      values[index] = nextValue;
      nextRows.push({ id: row.id, values });
      return;
    }

    totalFailures += 1;
    if (failures.length < MAX_REPORTED_ISSUES) {
      failures.push({
        rowNumber: rowIndex + 1,
        rowId: row.id,
        value: raw,
        code,
        message,
      });
    }
    nextRows.push({ id: row.id, values: [...row.values] });
  });

  if (totalFailures > 0) {
    return { ok: false, failures, totalFailures };
  }
  return { ok: true, rows: nextRows, convertedCells };
}

function conversionFailure(
  typeChanged: boolean,
  failures: readonly ColumnChangeFailure[],
  totalFailures: number,
): ColumnChangeError {
  return fail(
    createAppError(
      typeChanged ? 'E_TYPE' : 'E_VALIDATION',
      'Some cells cannot be converted to the new column definition.',
      { detail: `failures=${String(totalFailures)}` },
    ),
    failures,
    totalFailures,
  );
}

/** Appends (or inserts) a column and fills every existing row with `null`. */
export function planColumnAdd(
  table: TableMeta,
  rows: readonly Row[],
  column: ColumnDef,
  index: number = table.columns.length,
): ColumnChangePlan {
  if (!Number.isInteger(index) || index < 0 || index > table.columns.length) {
    return fail(
      createAppError('E_VALIDATION', 'The insertion index is out of range.', {
        detail: `index=${String(index)} columns=${String(table.columns.length)}`,
      }),
    );
  }
  if (table.columns.length >= MAX_COLUMNS_PER_TABLE) {
    return fail(
      createAppError('E_VALIDATION', 'A table may have at most 100 columns.', {
        detail: `columns=${String(table.columns.length)} max=${String(MAX_COLUMNS_PER_TABLE)}`,
      }),
    );
  }
  if (table.columns.some((entry) => entry.id === column.id)) {
    return fail(
      createAppError('E_DUPLICATE_KEY', 'A column with the same id already exists.', {
        detail: `column=${column.id}`,
      }),
    );
  }
  if (table.columns.some((entry) => entry.key === column.key)) {
    return fail(
      createAppError('E_DUPLICATE_KEY', 'A column with the same key already exists.', {
        detail: `key=${column.key}`,
      }),
    );
  }

  const invalid = validateColumn(column);
  if (invalid !== null) {
    return invalid;
  }
  if (column.required === true && rows.length > 0) {
    return fail(
      createAppError(
        'E_VALIDATION',
        'A required column cannot be added to a table that already has rows.',
      ),
    );
  }

  const columns = [...table.columns.slice(0, index), column, ...table.columns.slice(index)];
  const tableWithColumn: TableMeta = { ...table, columns };
  const schemaError = validateSchema(tableWithColumn);
  if (schemaError !== null) {
    return schemaError;
  }

  const nextRows = rows.map((row) => ({
    id: row.id,
    values: [...row.values.slice(0, index), null, ...row.values.slice(index)],
  }));
  return {
    ok: true,
    table: tableWithColumn,
    rows: nextRows,
    affectedRows: rows.length,
    convertedCells: 0,
  };
}

/**
 * Replaces a column definition and converts the values it already holds.
 *
 * Metadata-only edits (label/key/role/unit/precision) keep the row arrays as
 * they are. Type, `required` and enum-option changes are validated against every
 * row first; a single failure rejects the whole change.
 */
export function planColumnUpdate(
  table: TableMeta,
  rows: readonly Row[],
  column: ColumnDef,
): ColumnChangePlan {
  const index = table.columns.findIndex((entry) => entry.id === column.id);
  const current = index < 0 ? undefined : table.columns[index];
  if (current === undefined) {
    return fail(
      createAppError('E_VALIDATION', 'The column does not exist.', {
        detail: `column=${column.id}`,
      }),
    );
  }
  if (table.columns.some((entry, position) => position !== index && entry.key === column.key)) {
    return fail(
      createAppError('E_DUPLICATE_KEY', 'A column with the same key already exists.', {
        detail: `key=${column.key}`,
      }),
    );
  }

  const invalid = validateColumn(column);
  if (invalid !== null) {
    return invalid;
  }

  const columns = [...table.columns];
  columns[index] = column;
  const nextTable: TableMeta = { ...table, columns };
  const schemaError = validateSchema(nextTable);
  if (schemaError !== null) {
    return schemaError;
  }

  const typeChanged = current.type !== column.type;
  const requiredChanged = (current.required === true) !== (column.required === true);
  const enumChanged = !sameEnumOptions(current.enumOptions, column.enumOptions);
  if (!typeChanged && !requiredChanged && !enumChanged) {
    return {
      ok: true,
      table: nextTable,
      rows: cloneRows(rows),
      affectedRows: rows.length,
      convertedCells: 0,
    };
  }

  const conversion = convertCells(rows, index, column, typeChanged);
  if (!conversion.ok) {
    return conversionFailure(typeChanged, conversion.failures, conversion.totalFailures);
  }
  return {
    ok: true,
    table: nextTable,
    rows: conversion.rows,
    affectedRows: rows.length,
    convertedCells: conversion.convertedCells,
  };
}

/** Removes a column and the matching value from every row. Primary keys stay. */
export function planColumnDelete(
  table: TableMeta,
  rows: readonly Row[],
  columnId: string,
): ColumnChangePlan {
  const index = table.columns.findIndex((entry) => entry.id === columnId);
  const current = index < 0 ? undefined : table.columns[index];
  if (current === undefined) {
    return fail(
      createAppError('E_VALIDATION', 'The column does not exist.', {
        detail: `column=${columnId}`,
      }),
    );
  }
  if (current.id === table.primaryKey) {
    return fail(
      createAppError('E_VALIDATION', 'The primary key column cannot be deleted.', {
        detail: `column=${columnId}`,
      }),
    );
  }

  const columns = table.columns.filter((_entry, position) => position !== index);
  const nextTable: TableMeta = { ...table, columns };
  const schemaError = validateSchema(nextTable);
  if (schemaError !== null) {
    return schemaError;
  }

  const nextRows = rows.map((row) => ({
    id: row.id,
    values: row.values.filter((_value, position) => position !== index),
  }));
  return {
    ok: true,
    table: nextTable,
    rows: nextRows,
    affectedRows: rows.length,
    convertedCells: 0,
  };
}

/**
 * Reorders the canonical schema and every row's `values` together.
 *
 * `TableViewState.columnOrder` is a separate, view-specific permutation; the
 * command layer updates it to the new schema order as well (Q8 decision).
 */
export function planColumnReorder(
  table: TableMeta,
  rows: readonly Row[],
  columnIds: readonly string[],
): ColumnChangePlan {
  if (columnIds.length !== table.columns.length) {
    return fail(
      createAppError(
        'E_VALIDATION',
        'The new column order must contain every column exactly once.',
        {
          detail: `expected=${String(table.columns.length)} got=${String(columnIds.length)}`,
        },
      ),
    );
  }

  const byId = new Map(table.columns.map((column) => [column.id, column]));
  const seen = new Set<string>();
  const columns: ColumnDef[] = [];
  for (const columnId of columnIds) {
    if (seen.has(columnId)) {
      return fail(
        createAppError('E_DUPLICATE_KEY', 'The new column order contains a duplicate column.', {
          detail: `column=${columnId}`,
        }),
      );
    }
    const column = byId.get(columnId);
    if (column === undefined) {
      return fail(
        createAppError('E_VALIDATION', 'The new column order references an unknown column.', {
          detail: `column=${columnId}`,
        }),
      );
    }
    seen.add(columnId);
    columns.push(column);
  }

  const nextTable: TableMeta = { ...table, columns };
  const schemaError = validateSchema(nextTable);
  if (schemaError !== null) {
    return schemaError;
  }

  const indexById = new Map(table.columns.map((column, index) => [column.id, index]));
  const nextRows = rows.map((row) => ({
    id: row.id,
    values: columnIds.map((columnId) => {
      const index = indexById.get(columnId);
      return index === undefined ? null : (row.values[index] ?? null);
    }),
  }));
  return {
    ok: true,
    table: nextTable,
    rows: nextRows,
    affectedRows: rows.length,
    convertedCells: 0,
  };
}

/**
 * Promotes an existing text column to primary key (SPEC §6.6.1).
 *
 * Every row must already hold a non-blank, unique value; the plan never invents
 * keys. The promoted column becomes `required` so later edits keep the rule.
 */
export function planPrimaryKeyChange(
  table: TableMeta,
  rows: readonly Row[],
  columnId: string,
): ColumnChangePlan {
  const index = table.columns.findIndex((entry) => entry.id === columnId);
  const current = index < 0 ? undefined : table.columns[index];
  if (current === undefined) {
    return fail(
      createAppError('E_VALIDATION', 'The column does not exist.', {
        detail: `column=${columnId}`,
      }),
    );
  }
  if (current.type !== 'text') {
    return fail(
      createAppError('E_TYPE', 'The primary key must be a text column.', {
        detail: `column=${columnId} type=${current.type}`,
      }),
    );
  }

  const columns = table.columns.map((column) =>
    column.id === columnId ? { ...column, required: true } : column,
  );
  const nextTable: TableMeta = { ...table, columns, primaryKey: columnId };
  const schemaError = validateSchema(nextTable);
  if (schemaError !== null) {
    return schemaError;
  }

  const failures: ColumnChangeFailure[] = [];
  const seen = new Map<string, number>();
  let totalFailures = 0;

  rows.forEach((row, rowIndex) => {
    const raw = row.values[index] ?? null;
    let code: ValidationIssueCode | null = null;
    let message = '';

    if (isBlank(raw)) {
      code = 'E_REQUIRED';
      message = `primary key "${columnId}" must not be empty`;
    } else if (typeof raw !== 'string') {
      code = 'E_TYPE';
      message = `primary key "${columnId}" expects text values`;
    } else {
      const firstRow = seen.get(raw);
      if (firstRow !== undefined) {
        code = 'E_DUPLICATE_KEY';
        message = `duplicate primary key "${raw}" (first seen in row ${String(firstRow)})`;
      } else {
        seen.set(raw, rowIndex + 1);
      }
    }

    if (code !== null) {
      totalFailures += 1;
      if (failures.length < MAX_REPORTED_ISSUES) {
        failures.push({
          rowNumber: rowIndex + 1,
          rowId: row.id,
          value: raw,
          code,
          message,
        });
      }
    }
  });

  if (totalFailures > 0) {
    return fail(
      createAppError('E_VALIDATION', 'The new primary key has blank or duplicate values.', {
        detail: `failures=${String(totalFailures)}`,
      }),
      failures,
      totalFailures,
    );
  }

  return {
    ok: true,
    table: nextTable,
    rows: cloneRows(rows),
    affectedRows: rows.length,
    convertedCells: 0,
  };
}
