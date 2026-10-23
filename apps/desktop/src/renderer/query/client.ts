/**
 * Renderer-side client for `query.worker.ts` (T2.6).
 *
 * Keeps one tracked snapshot per table and turns it into minimal sync deltas:
 * the first query clones the rows, later cell edits send only the changed row,
 * appends send only the new rows, and structural changes fall back to a full
 * reset. Calls are correlated by request id and never reject; failures come back
 * as an `AppError` envelope so `useViewRows` can fall back to the main thread.
 */

import { createAppError } from '@curve/domain';
import type { AppError, Row, TableMeta } from '@curve/domain';
import {
  createQueryRowsRequest,
  createQuerySyncRequest,
  isQueryWorkerResponse,
} from '@curve/table-engine';
import type {
  QueryRowsPayload,
  QueryRowsResult,
  QuerySyncPayload,
  QueryWorkerCallResult,
  QueryWorkerRequest,
} from '@curve/table-engine';

export interface QueryWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: QueryWorkerRequest): void;
  terminate(): void;
}

export interface QueryClientOptions {
  /** Injected in tests; defaults to the bundled module Worker. */
  createWorker?: () => QueryWorkerPort;
  /** Per-request budget; a stuck Worker must not freeze the view forever. */
  timeoutMs?: number;
}

export interface QueryClient {
  /** Syncs the cache if this table snapshot changed; no-op otherwise. */
  syncTable(
    table: TableMeta,
    rows: readonly Row[],
  ): Promise<QueryWorkerCallResult<{ tableId: string; rowCount: number }>>;
  query(payload: QueryRowsPayload): Promise<QueryWorkerCallResult<QueryRowsResult>>;
  terminate(): void;
  readonly pending: number;
  readonly trackedTables: number;
}

export const DEFAULT_QUERY_WORKER_TIMEOUT_MS = 30_000;

interface TrackedTable {
  table: TableMeta;
  columns: TableMeta['columns'];
  rows: readonly Row[];
  ids: readonly string[];
}

interface PendingCall {
  resolve: (result: QueryWorkerCallResult<unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
}

function createModuleWorker(): QueryWorkerPort {
  return new Worker(new URL('../workers/query.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as QueryWorkerPort;
}

export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  const createWorker = options.createWorker ?? createModuleWorker;
  const timeoutMs = options.timeoutMs ?? DEFAULT_QUERY_WORKER_TIMEOUT_MS;

  let worker: QueryWorkerPort | null = null;
  let terminated = false;
  let nextId = 1;
  const pending = new Map<number, PendingCall>();
  const tracked = new Map<string, TrackedTable>();

  function failAll(error: AppError): void {
    for (const [id, call] of pending) {
      pending.delete(id);
      clearTimeout(call.timer);
      call.resolve({ ok: false, error });
    }
  }

  function settle(message: unknown): void {
    if (!isQueryWorkerResponse(message)) {
      failAll(createAppError('E_UNKNOWN', 'The query worker returned a malformed response.'));
      return;
    }
    const call = pending.get(message.id);
    if (call === undefined) {
      return;
    }
    pending.delete(message.id);
    clearTimeout(call.timer);
    call.resolve(
      message.ok ? { ok: true, result: message.result } : { ok: false, error: message.error },
    );
  }

  function ensureWorker(): QueryWorkerPort | null {
    if (terminated) {
      return null;
    }
    if (worker !== null) {
      return worker;
    }
    try {
      const created = createWorker();
      created.onmessage = (event) => {
        settle(event.data);
      };
      created.onerror = () => {
        worker = null;
        failAll(createAppError('E_UNKNOWN', 'The query worker reported an error.'));
      };
      worker = created;
      return created;
    } catch {
      return null;
    }
  }

  function request<TResult>(
    build: (id: number) => QueryWorkerRequest,
  ): Promise<QueryWorkerCallResult<TResult>> {
    return new Promise((resolve) => {
      if (terminated) {
        resolve({
          ok: false,
          error: createAppError('E_UNKNOWN', 'The query worker has been terminated.'),
        });
        return;
      }
      const port = ensureWorker();
      if (port === null) {
        resolve({
          ok: false,
          error: createAppError('E_UNKNOWN', 'The query worker could not be created.'),
        });
        return;
      }

      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({
          ok: false,
          error: createAppError('E_UNKNOWN', 'The query worker did not answer in time.'),
        });
      }, timeoutMs);

      pending.set(id, { resolve: resolve as PendingCall['resolve'], timer });

      try {
        port.postMessage(build(id));
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        resolve({
          ok: false,
          error: createAppError(
            'E_UNKNOWN',
            error instanceof Error ? error.message : 'The query worker rejected the message.',
          ),
        });
      }
    });
  }

  function buildSyncPayload(table: TableMeta, rows: readonly Row[]): QuerySyncPayload | null {
    const previous = tracked.get(table.id);
    if (previous === undefined) {
      return { tableId: table.id, table, reset: [...rows] };
    }
    const columnsChanged =
      previous.columns.length !== table.columns.length ||
      previous.columns.some((column, index) => column.id !== table.columns[index]?.id);
    if (columnsChanged || rows.length < previous.rows.length) {
      return { tableId: table.id, table, reset: [...rows] };
    }
    const prefixMatches = previous.ids.every((id, index) => rows[index]?.id === id);
    if (!prefixMatches) {
      return { tableId: table.id, table, reset: [...rows] };
    }

    const update: Row[] = [];
    for (let index = 0; index < previous.rows.length; index += 1) {
      const next = rows[index];
      if (next === undefined) {
        return { tableId: table.id, table, reset: [...rows] };
      }
      if (next !== previous.rows[index]) {
        update.push(next);
      }
    }
    const append = rows.slice(previous.rows.length);
    if (update.length === 0 && append.length === 0 && previous.table === table) {
      return null;
    }
    return {
      tableId: table.id,
      table,
      ...(append.length === 0 ? {} : { append }),
      ...(update.length === 0 ? {} : { update }),
    };
  }

  async function syncTable(
    table: TableMeta,
    rows: readonly Row[],
  ): Promise<QueryWorkerCallResult<{ tableId: string; rowCount: number }>> {
    const payload = buildSyncPayload(table, rows);
    if (payload === null) {
      const previous = tracked.get(table.id);
      return { ok: true, result: { tableId: table.id, rowCount: previous?.rows.length ?? 0 } };
    }
    const result = await request<{ tableId: string; rowCount: number }>((id) =>
      createQuerySyncRequest(id, payload),
    );
    if (result.ok) {
      tracked.set(table.id, {
        table,
        columns: table.columns,
        rows,
        ids: rows.map((row) => row.id),
      });
    } else {
      tracked.delete(table.id);
    }
    return result;
  }

  return {
    syncTable,
    query: (payload: QueryRowsPayload) =>
      request<QueryRowsResult>((id) => createQueryRowsRequest(id, payload)),
    terminate: () => {
      terminated = true;
      worker?.terminate();
      worker = null;
      tracked.clear();
      failAll(createAppError('E_UNKNOWN', 'The query worker has been terminated.'));
    },
    get pending(): number {
      return pending.size;
    },
    get trackedTables(): number {
      return tracked.size;
    },
  };
}
