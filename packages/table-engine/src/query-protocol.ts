/**
 * Message protocol between the renderer and `query.worker.ts` (T2.6).
 *
 * The worker caches one row snapshot per table so a >20k-row filter/sort never
 * clones the whole table for every query. `sync` replaces or incrementally
 * updates that cache; `query` returns visible row ids in display order.
 *
 * Guards are hand-written for the same reason as the table worker protocol:
 * they run on every message and the payloads are produced by our own client.
 */

import { isAppError } from '@curve/domain';
import type { AppError, FilterPredicate, Row, SortSpec, TableMeta } from '@curve/domain';

import type { TableWorkerCallResult } from './worker-protocol';

export interface QuerySyncPayload {
  tableId: string;
  table: TableMeta;
  /** Full replacement; used on first sync and after structural changes. */
  reset?: Row[];
  /** New rows appended after the cached snapshot. */
  append?: Row[];
  /** Changed rows, matched by `row.id`. */
  update?: Row[];
}

export interface QueryRowsPayload {
  tableId: string;
  filter?: FilterPredicate;
  sort: SortSpec[];
  /** BCP 47 locale used for text matching and `Intl.Collator`. */
  locale: string;
}

export interface QueryRowsResult {
  rowIds: string[];
  visibleRows: number;
  /** Time spent filtering/sorting inside the worker (excludes sync/clone). */
  durationMs: number;
}

export type QueryWorkerRequest =
  | { id: number; type: 'sync'; payload: QuerySyncPayload }
  | { id: number; type: 'query'; payload: QueryRowsPayload };

export type QueryWorkerResponse =
  | { id: number; ok: true; type: 'sync'; result: { tableId: string; rowCount: number } }
  | { id: number; ok: true; type: 'query'; result: QueryRowsResult }
  | { id: number; ok: false; type: 'sync' | 'query'; error: AppError };

export type QueryWorkerCallResult<T> = TableWorkerCallResult<T>;

export function createQuerySyncRequest(id: number, payload: QuerySyncPayload): QueryWorkerRequest {
  return {
    id,
    type: 'sync',
    payload: {
      tableId: payload.tableId,
      table: payload.table,
      ...(payload.reset === undefined ? {} : { reset: [...payload.reset] }),
      ...(payload.append === undefined ? {} : { append: [...payload.append] }),
      ...(payload.update === undefined ? {} : { update: [...payload.update] }),
    },
  };
}

export function createQueryRowsRequest(id: number, payload: QueryRowsPayload): QueryWorkerRequest {
  return {
    id,
    type: 'query',
    payload: {
      tableId: payload.tableId,
      sort: [...payload.sort],
      locale: payload.locale,
      ...(payload.filter === undefined ? {} : { filter: payload.filter }),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isTableShape(value: unknown): value is TableMeta {
  return isRecord(value) && typeof value['id'] === 'string' && Array.isArray(value['columns']);
}

function isRowArray(value: unknown): value is Row[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(
    (row) => isRecord(row) && typeof row['id'] === 'string' && Array.isArray(row['values']),
  );
}

function isSortArray(value: unknown): value is SortSpec[] {
  return (
    Array.isArray(value) &&
    value.every(
      (spec) =>
        isRecord(spec) &&
        typeof spec['columnId'] === 'string' &&
        (spec['direction'] === 'asc' || spec['direction'] === 'desc'),
    )
  );
}

function isQuerySyncPayload(value: unknown): value is QuerySyncPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value['tableId'] !== 'string' || !isTableShape(value['table'])) {
    return false;
  }
  if (value['reset'] !== undefined && !isRowArray(value['reset'])) {
    return false;
  }
  if (value['append'] !== undefined && !isRowArray(value['append'])) {
    return false;
  }
  if (value['update'] !== undefined && !isRowArray(value['update'])) {
    return false;
  }
  // A table-only sync is valid: metadata such as a rename updates the cached
  // context without re-cloning rows.
  return true;
}

function isQueryRowsPayload(value: unknown): value is QueryRowsPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value['tableId'] !== 'string' || typeof value['locale'] !== 'string') {
    return false;
  }
  if (!isSortArray(value['sort'])) {
    return false;
  }
  return value['filter'] === undefined || isRecord(value['filter']);
}

function isQueryRowsResult(value: unknown): value is QueryRowsResult {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Array.isArray(value['rowIds']) &&
    value['rowIds'].every((id) => typeof id === 'string') &&
    typeof value['visibleRows'] === 'number' &&
    Number.isSafeInteger(value['visibleRows']) &&
    value['visibleRows'] >= 0 &&
    typeof value['durationMs'] === 'number' &&
    Number.isFinite(value['durationMs']) &&
    value['durationMs'] >= 0
  );
}

export function isQueryWorkerRequest(value: unknown): value is QueryWorkerRequest {
  if (!isRecord(value) || !isRequestId(value['id'])) {
    return false;
  }
  const payload = value['payload'];
  switch (value['type']) {
    case 'sync':
      return isQuerySyncPayload(payload);
    case 'query':
      return isQueryRowsPayload(payload);
    default:
      return false;
  }
}

export function isQueryWorkerResponse(value: unknown): value is QueryWorkerResponse {
  if (!isRecord(value) || !isRequestId(value['id'])) {
    return false;
  }
  const type = value['type'];
  if (type !== 'sync' && type !== 'query') {
    return false;
  }
  if (value['ok'] === true) {
    if (type === 'sync') {
      const result = value['result'];
      return (
        isRecord(result) &&
        typeof result['tableId'] === 'string' &&
        typeof result['rowCount'] === 'number' &&
        Number.isSafeInteger(result['rowCount']) &&
        result['rowCount'] >= 0
      );
    }
    return isQueryRowsResult(value['result']);
  }
  if (value['ok'] === false) {
    return isAppError(value['error']);
  }
  return false;
}
