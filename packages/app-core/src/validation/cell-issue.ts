/**
 * Structured cell issues shared by app-core, the command bus and the renderer.
 *
 * This module deliberately has no state imports: `state/types.ts` consumes the
 * type, and `cell-validation.ts` adds the state-aware checks without creating a
 * dependency cycle.
 */

import { createAppError } from '@curve/domain';
import type { AppError, CellResult, ColumnDef, ErrorCode } from '@curve/domain';

export type CellIssueReason =
  | 'required'
  | 'type'
  | 'range'
  | 'enum'
  | 'duplicate-key'
  | 'primary-key-empty'
  | 'table-not-found'
  | 'row-not-found'
  | 'column-not-found'
  | 'row-shape'
  | 'unknown';

export interface CellIssue {
  reason: CellIssueReason;
  code: ErrorCode;
  columnId?: string;
  /** 1-based number of the row being edited. */
  rowNumber?: number;
  /** 1-based number of the row that already owns the primary key. */
  conflictRowNumber?: number;
  conflictRowId?: string;
  /** Developer-facing English text; never rendered directly. */
  message: string;
}

type FailedCellResult = Extract<CellResult, { ok: false }>;

function appCodeFor(code: FailedCellResult['code']): ErrorCode {
  if (code === 'E_DUPLICATE_KEY') {
    return 'E_DUPLICATE_KEY';
  }
  if (code === 'E_TYPE') {
    return 'E_TYPE';
  }
  return 'E_VALIDATION';
}

function reasonFor(code: FailedCellResult['code']): CellIssueReason {
  switch (code) {
    case 'E_REQUIRED':
      return 'required';
    case 'E_TYPE':
      return 'type';
    case 'E_RANGE':
      return 'range';
    case 'E_ENUM':
      return 'enum';
    case 'E_DUPLICATE_KEY':
      return 'duplicate-key';
    default:
      return 'unknown';
  }
}

/** Converts a `coerceCell` failure into the renderer-facing issue shape. */
export function cellIssueFromResult(
  result: FailedCellResult,
  column: ColumnDef,
  rowNumber: number,
): CellIssue {
  return {
    reason: reasonFor(result.code),
    code: appCodeFor(result.code),
    columnId: column.id,
    rowNumber,
    message: result.message,
  };
}

/** Fallback for unexpected command failures that carry no structured issue. */
export function unknownCellIssue(error: AppError): CellIssue {
  return {
    reason: 'unknown',
    code: error.code,
    message: error.message,
  };
}

/** Keeps the structured error useful in logs while the UI uses `reason`. */
export function cellIssueToAppError(issue: CellIssue): AppError {
  const detail = [
    `reason=${issue.reason}`,
    `column=${issue.columnId ?? ''}`,
    `row=${issue.rowNumber ?? ''}`,
    `conflictRow=${issue.conflictRowNumber ?? ''}`,
  ].join(';');
  return createAppError(issue.code, issue.message, { detail });
}
