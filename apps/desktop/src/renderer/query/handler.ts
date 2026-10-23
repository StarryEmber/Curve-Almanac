/**
 * Query worker handler (T2.6).
 *
 * Owns the per-table row cache and runs `queryRowIdsWithContext` off the UI
 * thread. The class is node-testable; `workers/query.worker.ts` only wires it to
 * `self.onmessage`.
 */

import { createAppError, toAppError } from '@curve/domain';
import type { Row, TableMeta } from '@curve/domain';
import {
  createQueryContext,
  isQueryWorkerRequest,
  queryRowIdsWithContext,
} from '@curve/table-engine';
import type {
  QueryContext,
  QueryRowsPayload,
  QueryRowsResult,
  QuerySyncPayload,
  QueryWorkerResponse,
} from '@curve/table-engine';

interface CacheEntry {
  table: TableMeta;
  rows: Row[];
  indexById: Map<string, number>;
  context: QueryContext;
}

/** Keep a few tables so switching tabs does not re-clone 100k rows. */
const MAX_CACHED_TABLES = 4;

export class QueryCache {
  private readonly tables = new Map<string, CacheEntry>();

  sync(payload: QuerySyncPayload): { tableId: string; rowCount: number } {
    let entry = this.tables.get(payload.tableId);
    if (payload.reset !== undefined || entry === undefined) {
      if (payload.reset === undefined) {
        throw createAppError('E_UNKNOWN', 'The query worker has no snapshot for this table.', {
          detail: `table=${payload.tableId}`,
        });
      }
      entry = this.createEntry(payload.table, payload.reset);
      this.tables.delete(payload.tableId);
      this.tables.set(payload.tableId, entry);
    } else {
      entry.table = payload.table;
      entry.context = createQueryContext(payload.table, { locale: entry.context.locale });
      if (payload.append !== undefined) {
        for (const row of payload.append) {
          entry.indexById.set(row.id, entry.rows.length);
          entry.rows.push(row);
        }
      }
      if (payload.update !== undefined) {
        for (const row of payload.update) {
          const index = entry.indexById.get(row.id);
          if (index === undefined) {
            entry.indexById.set(row.id, entry.rows.length);
            entry.rows.push(row);
          } else {
            entry.rows[index] = row;
          }
        }
      }
      this.tables.delete(payload.tableId);
      this.tables.set(payload.tableId, entry);
    }
    this.evict();
    return { tableId: payload.tableId, rowCount: entry.rows.length };
  }

  query(payload: QueryRowsPayload): QueryRowsResult {
    const entry = this.tables.get(payload.tableId);
    if (entry === undefined) {
      throw createAppError('E_UNKNOWN', 'The query worker has no snapshot for this table.', {
        detail: `table=${payload.tableId}`,
      });
    }
    const context = createQueryContext(entry.table, { locale: payload.locale });
    const started = performance.now();
    const result = queryRowIdsWithContext(entry.rows, context, {
      ...(payload.filter === undefined ? {} : { filter: payload.filter }),
      sort: payload.sort,
    });
    return {
      rowIds: result.rowIds,
      visibleRows: result.visibleRows,
      durationMs: performance.now() - started,
    };
  }

  clear(): void {
    this.tables.clear();
  }

  get size(): number {
    return this.tables.size;
  }

  private createEntry(table: TableMeta, rows: readonly Row[]): CacheEntry {
    const copied = rows.map((row) => row);
    return {
      table,
      rows: copied,
      indexById: new Map(copied.map((row, index) => [row.id, index])),
      context: createQueryContext(table),
    };
  }

  private evict(): void {
    while (this.tables.size > MAX_CACHED_TABLES) {
      const oldest = this.tables.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      this.tables.delete(oldest);
    }
  }
}

function requestId(value: unknown): number {
  return typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'number'
    ? (value as { id: number }).id
    : 0;
}

/** Pure message dispatch used by the worker and its tests. */
export function handleQueryWorkerRequest(message: unknown, cache: QueryCache): QueryWorkerResponse {
  if (!isQueryWorkerRequest(message)) {
    return {
      id: requestId(message),
      ok: false,
      type:
        message !== null &&
        typeof message === 'object' &&
        (message as { type?: unknown }).type === 'sync'
          ? 'sync'
          : 'query',
      error: createAppError(
        'E_IPC_INVALID_PAYLOAD',
        'The query worker received a malformed message.',
      ),
    };
  }
  try {
    if (message.type === 'sync') {
      return { id: message.id, ok: true, type: 'sync', result: cache.sync(message.payload) };
    }
    return { id: message.id, ok: true, type: 'query', result: cache.query(message.payload) };
  } catch (thrown) {
    return {
      id: message.id,
      ok: false,
      type: message.type,
      error: toAppError(thrown),
    };
  }
}
