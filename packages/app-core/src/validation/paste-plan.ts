/**
 * Pure paste planner (T2.4, SPEC §9.3).
 *
 * The planner turns a parsed clipboard matrix plus an anchor into either an
 * all-or-nothing next row set, or the first 100 structured problems. It is the
 * single validation path for both the confirmation preview (chunked, async) and
 * the `table.paste` command (one synchronous pass), so a paste that previews
 * clean cannot fail on different rules at commit time.
 *
 * Rules:
 * - the anchor is the top-left of the selection; the matrix grows right/down;
 * - existing rows are updated in place, rows beyond the table are appended;
 * - an appended row with a blank text primary key gets `row_<uuid>` (SPEC §9.2);
 * - an existing row may not blank its primary key;
 * - new columns are appended to the schema, are never `required`, and may not
 *   push the table past 100 columns (ADR-029, T2.3);
 * - primary-key uniqueness is checked once over the final overlay, so a key
 *   swap inside one paste is valid while a duplicate is rejected.
 */

import {
  coerceCell,
  createAppError,
  createRowId,
  MAX_COLUMNS_PER_TABLE,
  MAX_REPORTED_ISSUES,
  parseColumnDef,
} from '@curve/domain';
import type { AppError, Cell, ColumnDef, Row, TableMeta, UuidFactory } from '@curve/domain';
import { MAX_ROWS_PER_TABLE } from '@curve/table-engine';

import { cellIssueFromResult } from './cell-issue';

import type { CellIssue } from './cell-issue';

export interface PasteAnchor {
  /** `null` only when the table has no rows (paste starts at row 1). */
  rowId: string | null;
  columnId: string;
}

export interface PastePlanRequest {
  table: TableMeta;
  rows: readonly Row[];
  anchor: PasteAnchor;
  /** Visible column ids in view order; the matrix maps from the anchor inside it. */
  columnIds: readonly string[];
  /** Raw clipboard text matrix, already rectangular (parser guarantee). */
  matrix: readonly (readonly string[])[];
  /** Definitions for columns the matrix needs beyond `columnIds`. */
  newColumns?: readonly ColumnDef[];
  /** Injected id source; deterministic in tests. */
  uuid?: UuidFactory;
}

/** A cell issue with the matrix coordinates used by the paste error dialog. */
export interface PasteIssue extends CellIssue {
  /** 0-based matrix row; -1 when the problem is not tied to a pasted cell. */
  matrixRow: number;
  /** 0-based matrix column; -1 for a missing required column. */
  matrixColumn: number;
  /** Raw pasted text (empty for missing required columns). */
  value: string;
}

export interface PasteSummary {
  /** Existing rows the matrix covered. */
  updatedRows: number;
  /** Rows appended after the last existing row. */
  appendedRows: number;
  addedColumns: number;
  /** Cells whose final value differs from before the paste. */
  changedCells: number;
  totalCells: number;
}

export interface PastePlanSuccess {
  readonly ok: true;
  table: TableMeta;
  rows: Row[];
  addedColumns: ColumnDef[];
  summary: PasteSummary;
}

export interface PastePlanFailure {
  readonly ok: false;
  error: AppError;
  issues: PasteIssue[];
  totalIssues: number;
  /** Set when the matrix needs more columns than the caller supplied. */
  needsColumns?: number;
}

export type PastePlan = PastePlanSuccess | PastePlanFailure;

export interface PastePlanner {
  readonly totalRows: number;
  readonly totalColumns: number;
  readonly processedRows: number;
  /** True when setup failed; stepping would do nothing and finish returns the error. */
  readonly blocked: boolean;
  /** Processes up to `rowBudget` matrix rows; safe to call after `finish()`. */
  step(rowBudget?: number): void;
  finish(): PastePlan;
}

interface MatrixTarget {
  column: ColumnDef;
  index: number;
}

interface PkWrite {
  matrixRow: number;
  matrixColumn: number;
  value: string;
}

function isBlank(value: string | Cell | undefined): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function emptyCell(column: ColumnDef): Cell {
  return column.type === 'text' ? '' : null;
}

function failure(error: AppError, needsColumns?: number): PastePlanFailure {
  return {
    ok: false,
    error,
    issues: [],
    totalIssues: 0,
    ...(needsColumns === undefined ? {} : { needsColumns }),
  };
}

function issuesFailure(issues: PasteIssue[], totalIssues: number): PastePlanFailure {
  const first = issues[0];
  return {
    ok: false,
    error: createAppError(
      first?.code ?? 'E_VALIDATION',
      'The pasted matrix contains invalid cells.',
      { detail: `issues=${String(totalIssues)}` },
    ),
    issues,
    totalIssues,
  };
}

function uniqueId(
  id: string,
  tableColumns: readonly ColumnDef[],
  added: readonly ColumnDef[],
): boolean {
  return (
    !tableColumns.some((column) => column.id === id) && !added.some((column) => column.id === id)
  );
}

function validateNewColumns(
  table: TableMeta,
  needed: number,
  newColumns: readonly ColumnDef[],
): { ok: true; columns: ColumnDef[] } | { ok: false; result: PastePlanFailure } {
  if (table.columns.length + needed > MAX_COLUMNS_PER_TABLE) {
    return {
      ok: false,
      result: failure(
        createAppError(
          'E_TABLE_LIMIT',
          `A table may not exceed ${String(MAX_COLUMNS_PER_TABLE)} columns.`,
          {
            detail: `columns=${String(table.columns.length + needed)} max=${String(MAX_COLUMNS_PER_TABLE)}`,
          },
        ),
      ),
    };
  }
  if (newColumns.length !== needed) {
    return {
      ok: false,
      result: failure(
        createAppError(
          'E_VALIDATION',
          `The paste needs exactly ${String(needed)} new column definition(s).`,
          { detail: `needed=${String(needed)} supplied=${String(newColumns.length)}` },
        ),
      ),
    };
  }

  const accepted: ColumnDef[] = [];
  for (const candidate of newColumns) {
    const parsed = parseColumnDef(candidate);
    if (!parsed.ok) {
      return {
        ok: false,
        result: failure(
          createAppError('E_VALIDATION', 'A new column definition is invalid.', {
            detail: parsed.issues[0]?.message,
          }),
        ),
      };
    }
    const column = parsed.data;
    if (column.required === true) {
      return {
        ok: false,
        result: failure(
          createAppError(
            'E_VALIDATION',
            'Columns created by a paste must not be required; existing rows cannot supply the value.',
            { detail: `column=${column.id}` },
          ),
        ),
      };
    }
    if (!uniqueId(column.id, table.columns, accepted)) {
      return {
        ok: false,
        result: failure(
          createAppError('E_DUPLICATE_KEY', 'A new column id is already used.', {
            detail: `column=${column.id}`,
          }),
        ),
      };
    }
    if (
      table.columns.some((existing) => existing.key === column.key) ||
      accepted.some((existing) => existing.key === column.key)
    ) {
      return {
        ok: false,
        result: failure(
          createAppError('E_DUPLICATE_KEY', 'A new column key is already used.', {
            detail: `key=${column.key}`,
          }),
        ),
      };
    }
    accepted.push(column);
  }
  return { ok: true, columns: accepted };
}

/**
 * Creates a planner after validating the anchor, the target columns and the
 * matrix shape. Cell work is deferred to `step`, so callers can yield between
 * chunks for the 10k-cell progress dialog.
 */
export function createPastePlanner(request: PastePlanRequest): PastePlanner {
  const { table, rows, anchor, columnIds, matrix } = request;
  const matrixRows = matrix.length;
  const matrixColumns = matrix[0]?.length ?? 0;
  let setupError: PastePlanFailure | null = null;
  let processedRows = 0;

  let candidateColumns: ColumnDef[] = [...table.columns];
  let addedColumns: ColumnDef[] = [];
  let anchorRowIndex = 0;
  const targets: MatrixTarget[] = [];
  const mappedColumnIndices = new Set<number>();
  let appendedRows = 0;
  let nextRowCount = 0;

  const touched = new Map<number, Cell[]>();
  const appendedValues: Cell[][] = [];
  const appendedIds: string[] = [];
  const pkWrites = new Map<number, PkWrite>();
  const issues: PasteIssue[] = [];
  let totalIssues = 0;
  let changedCells = 0;

  const pushIssue = (issue: PasteIssue): void => {
    totalIssues += 1;
    if (issues.length < MAX_REPORTED_ISSUES) {
      issues.push(issue);
    }
  };

  const uuid = request.uuid;
  const usedRowIds = new Set(rows.map((row) => row.id));

  const nextRowId = (): string => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const id = createRowId(uuid);
      if (!usedRowIds.has(id)) {
        usedRowIds.add(id);
        return id;
      }
    }
    throw createAppError('E_UNKNOWN', 'Could not generate a unique row id for the paste.');
  };

  // ---------------------------------------------------------------------
  // Setup validation. The action needs `needsColumns` even when it cannot
  // plan yet, so anchor/column checks run before the new-column check.
  // ---------------------------------------------------------------------
  if (matrixRows === 0 || matrixColumns === 0) {
    setupError = failure(createAppError('E_VALIDATION', 'The pasted matrix is empty.'));
  } else if (matrix.some((row) => row.length !== matrixColumns)) {
    setupError = failure(createAppError('E_VALIDATION', 'The pasted matrix is not rectangular.'));
  }

  const columnById = new Map(table.columns.map((column) => [column.id, column]));
  const seenColumnIds = new Set<string>();
  if (setupError === null) {
    if (columnIds.length === 0) {
      setupError = failure(
        createAppError('E_VALIDATION', 'The paste requires at least one target column.'),
      );
    }
    for (const columnId of columnIds) {
      if (seenColumnIds.has(columnId)) {
        setupError = failure(
          createAppError('E_VALIDATION', 'The target column list contains duplicates.', {
            detail: `column=${columnId}`,
          }),
        );
        break;
      }
      seenColumnIds.add(columnId);
      if (!columnById.has(columnId)) {
        setupError = failure(
          createAppError('E_VALIDATION', 'A target column does not exist.', {
            detail: `column=${columnId}`,
          }),
        );
        break;
      }
    }
  }

  const anchorColumnIndex = setupError === null ? columnIds.indexOf(anchor.columnId) : -1;
  if (setupError === null && anchorColumnIndex < 0) {
    setupError = failure(
      createAppError('E_VALIDATION', 'The paste anchor column is not in the target column list.', {
        detail: `column=${anchor.columnId}`,
      }),
    );
  }

  if (setupError === null) {
    const available = columnIds.length - anchorColumnIndex;
    const needed = Math.max(0, matrixColumns - available);
    if (needed > 0) {
      if (request.newColumns === undefined || request.newColumns.length === 0) {
        setupError = failure(
          createAppError(
            'E_VALIDATION',
            `Pasting into ${String(matrixColumns)} columns would need ${String(needed)} new column(s).`,
            { detail: `needsColumns=${String(needed)}` },
          ),
          needed,
        );
      } else {
        const validated = validateNewColumns(table, needed, request.newColumns);
        if (!validated.ok) {
          setupError = validated.result;
        } else {
          addedColumns = validated.columns;
          candidateColumns = [...table.columns, ...addedColumns];
        }
      }
    } else if (request.newColumns !== undefined && request.newColumns.length > 0) {
      setupError = failure(
        createAppError('E_VALIDATION', 'The matrix does not need any new columns.'),
      );
    }
  }

  if (setupError === null) {
    for (let index = 0; index < matrixColumns; index += 1) {
      const targetPosition = anchorColumnIndex + index;
      let target: MatrixTarget | undefined;
      if (targetPosition < columnIds.length) {
        const columnId = columnIds[targetPosition];
        const column = columnId === undefined ? undefined : columnById.get(columnId);
        if (column !== undefined) {
          target = { column, index: candidateColumns.indexOf(column) };
        }
      } else {
        const addedIndex = targetPosition - columnIds.length;
        const column = addedColumns[addedIndex];
        if (column !== undefined) {
          target = { column, index: table.columns.length + addedIndex };
        }
      }
      if (target === undefined || target.index < 0) {
        setupError = failure(
          createAppError('E_VALIDATION', 'Could not map a pasted column to the table schema.'),
        );
        break;
      }
      targets.push(target);
      mappedColumnIndices.add(target.index);
    }
  }

  if (setupError === null) {
    if (rows.length === 0) {
      if (anchor.rowId !== null) {
        setupError = failure(
          createAppError('E_TABLE_NOT_FOUND', 'The paste anchor row does not exist.', {
            detail: `row=${anchor.rowId}`,
          }),
        );
      }
    } else {
      if (anchor.rowId === null) {
        setupError = failure(
          createAppError('E_TABLE_NOT_FOUND', 'The paste anchor row is missing.'),
        );
      } else {
        const index = rows.findIndex((row) => row.id === anchor.rowId);
        if (index < 0) {
          setupError = failure(
            createAppError('E_TABLE_NOT_FOUND', 'The paste anchor row does not exist.', {
              detail: `row=${anchor.rowId}`,
            }),
          );
        } else {
          anchorRowIndex = index;
        }
      }
    }
  }

  if (setupError === null) {
    appendedRows = Math.max(0, anchorRowIndex + matrixRows - rows.length);
    nextRowCount = rows.length + appendedRows;
    if (nextRowCount > MAX_ROWS_PER_TABLE) {
      setupError = failure(
        createAppError(
          'E_TABLE_LIMIT',
          `A table may not exceed ${String(MAX_ROWS_PER_TABLE)} rows.`,
          {
            detail: `rowCount=${String(nextRowCount)} max=${String(MAX_ROWS_PER_TABLE)}`,
          },
        ),
      );
    }
  }

  const keyColumnIndex = (): number =>
    candidateColumns.findIndex((column) => column.id === table.primaryKey);

  const valuesForExisting = (rowIndex: number): Cell[] => {
    const existing = touched.get(rowIndex);
    if (existing !== undefined) {
      return existing;
    }
    const row = rows[rowIndex];
    const values: Cell[] = row === undefined ? [] : [...row.values];
    while (values.length < candidateColumns.length) {
      const column = candidateColumns[values.length];
      values.push(column === undefined ? null : emptyCell(column));
    }
    touched.set(rowIndex, values);
    return values;
  };

  const valuesForAppended = (appendedIndex: number): Cell[] => {
    while (appendedValues.length <= appendedIndex) {
      const values = candidateColumns.map(emptyCell);
      appendedValues.push(values);
      appendedIds.push(nextRowId());
    }
    const values = appendedValues[appendedIndex];
    if (values === undefined) {
      throw createAppError('E_UNKNOWN', 'Could not allocate a pasted row.');
    }
    return values;
  };

  const step = (rowBudget: number = Number.POSITIVE_INFINITY): void => {
    if (setupError !== null) {
      return;
    }
    const end = Math.min(matrixRows, processedRows + Math.max(0, rowBudget));
    for (; processedRows < end; processedRows += 1) {
      const matrixRow = matrix[processedRows];
      if (matrixRow === undefined) {
        continue;
      }
      const targetRowIndex = anchorRowIndex + processedRows;
      const appended = targetRowIndex >= rows.length;
      const appendedIndex = targetRowIndex - rows.length;
      const values = appended
        ? valuesForAppended(appendedIndex)
        : valuesForExisting(targetRowIndex);

      for (let matrixColumn = 0; matrixColumn < matrixColumns; matrixColumn += 1) {
        const target = targets[matrixColumn];
        const raw = matrixRow[matrixColumn] ?? '';
        if (target === undefined) {
          continue;
        }
        const column = target.column;
        const current = values[target.index] ?? null;

        // Blank primary keys: append a generated value for a new row, reject an
        // existing row (SPEC §9.2).
        if (column.id === table.primaryKey && isBlank(raw)) {
          if (appended) {
            continue;
          }
          pushIssue({
            reason: 'primary-key-empty',
            code: 'E_VALIDATION',
            columnId: column.id,
            rowNumber: targetRowIndex + 1,
            matrixRow: processedRows,
            matrixColumn,
            value: raw,
            message: 'The primary key must not be empty.',
          });
          continue;
        }

        const coerced = coerceCell(raw, column);
        if (!coerced.ok) {
          const issue = cellIssueFromResult(coerced, column, targetRowIndex + 1);
          pushIssue({
            ...issue,
            matrixRow: processedRows,
            matrixColumn,
            value: raw,
          });
          continue;
        }

        values[target.index] = coerced.value;
        if (current !== coerced.value) {
          changedCells += 1;
        }
        if (column.id === table.primaryKey) {
          pkWrites.set(targetRowIndex, {
            matrixRow: processedRows,
            matrixColumn,
            value: raw,
          });
        }
      }

      if (appended) {
        // Columns the matrix did not cover must be optional; a required one is
        // an explicit error rather than a silent null. The primary key is the
        // exception: a blank text key is generated below.
        for (let index = 0; index < candidateColumns.length; index += 1) {
          if (mappedColumnIndices.has(index)) {
            continue;
          }
          const column = candidateColumns[index];
          if (column === undefined) {
            continue;
          }
          if (column.id === table.primaryKey) {
            continue;
          }
          if (column.required === true) {
            pushIssue({
              reason: 'required',
              code: 'E_VALIDATION',
              columnId: column.id,
              rowNumber: targetRowIndex + 1,
              matrixRow: processedRows,
              matrixColumn: -1,
              value: '',
              message: `column "${column.key}" is required`,
            });
          } else {
            values[index] = emptyCell(column);
          }
        }

        const keyIndex = keyColumnIndex();
        const keyColumn = candidateColumns[keyIndex];
        if (keyColumn !== undefined && isBlank(values[keyIndex])) {
          const id = appendedIds[appendedIndex];
          if (id === undefined) {
            throw createAppError('E_UNKNOWN', 'Could not allocate a pasted row id.');
          }
          if (keyColumn.type === 'text') {
            values[keyIndex] = id;
          } else {
            pushIssue({
              reason: 'type',
              code: 'E_VALIDATION',
              columnId: keyColumn.id,
              rowNumber: targetRowIndex + 1,
              matrixRow: processedRows,
              matrixColumn: -1,
              value: '',
              message: 'The primary key must be a text column.',
            });
          }
        }
      }
    }
  };

  const finish = (): PastePlan => {
    if (setupError !== null) {
      return setupError;
    }
    step(Number.POSITIVE_INFINITY);

    const nextRows: Row[] = rows.map((row, index) => {
      const values = touched.get(index);
      if (values !== undefined) {
        return { id: row.id, values };
      }
      if (addedColumns.length === 0) {
        return row;
      }
      const padded: Cell[] = [...row.values];
      while (padded.length < candidateColumns.length) {
        const column = candidateColumns[padded.length];
        padded.push(column === undefined ? null : emptyCell(column));
      }
      return { id: row.id, values: padded };
    });

    for (let index = 0; index < appendedValues.length; index += 1) {
      const values = appendedValues[index];
      const id = appendedIds[index];
      if (values !== undefined && id !== undefined) {
        nextRows.push({ id, values });
      }
    }

    const keyIndex = keyColumnIndex();
    const keyColumn = candidateColumns[keyIndex];
    if (keyColumn === undefined) {
      return failure(
        createAppError('E_WS_INVALID_MANIFEST', 'The table primary key column does not exist.'),
      );
    }

    const owners = new Map<Cell, number>();
    for (let index = 0; index < nextRows.length; index += 1) {
      const row = nextRows[index];
      if (row === undefined) {
        continue;
      }
      const key = row.values[keyIndex] ?? null;
      if (isBlank(key)) {
        continue;
      }
      const first = owners.get(key);
      if (first === undefined) {
        owners.set(key, index);
        continue;
      }
      const currentWrite = pkWrites.get(index);
      const firstWrite = pkWrites.get(first);
      const write = currentWrite ?? firstWrite;
      // Attribute the error to the row this paste actually wrote when only one
      // side of the conflict was touched; otherwise report the later row.
      const reportedRow = currentWrite !== undefined || firstWrite === undefined ? index : first;
      const conflictRow = reportedRow === index ? first : index;
      const conflictRowData = nextRows[conflictRow];
      pushIssue({
        reason: 'duplicate-key',
        code: 'E_DUPLICATE_KEY',
        columnId: keyColumn.id,
        rowNumber: reportedRow + 1,
        conflictRowNumber: conflictRow + 1,
        conflictRowId: conflictRowData?.id,
        matrixRow: write?.matrixRow ?? -1,
        matrixColumn: write?.matrixColumn ?? -1,
        value: write?.value ?? String(key ?? ''),
        message: `The primary key value is already used by row ${String(conflictRow + 1)}.`,
      });
    }

    if (totalIssues > 0) {
      return issuesFailure(issues, totalIssues);
    }

    const nextTable: TableMeta = {
      ...table,
      columns: candidateColumns,
      rowCount: nextRows.length,
    };
    return {
      ok: true,
      table: nextTable,
      rows: nextRows,
      addedColumns,
      summary: {
        updatedRows: Math.min(matrixRows, Math.max(0, rows.length - anchorRowIndex)),
        appendedRows,
        addedColumns: addedColumns.length,
        changedCells,
        totalCells: matrixRows * matrixColumns,
      },
    };
  };

  return {
    get totalRows() {
      return matrixRows;
    },
    get totalColumns() {
      return matrixColumns;
    },
    get processedRows() {
      return processedRows;
    },
    get blocked() {
      return setupError !== null;
    },
    step,
    finish,
  };
}

/** Convenience wrapper for the synchronous command path. */
export function planPaste(request: PastePlanRequest): PastePlan {
  const planner = createPastePlanner(request);
  planner.step(Number.POSITIVE_INFINITY);
  return planner.finish();
}
