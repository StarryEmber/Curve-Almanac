/**
 * Renderer-side client for `table.worker.ts` (TASKS T1.3).
 *
 * The Worker owns JSONL parsing/encoding so the UI thread never blocks on a
 * 100k-row table (ADR-011). This module only correlates request ids, applies a
 * timeout and turns every failure into an `AppError` envelope, so callers in
 * `app-core` (T1.5) never see a rejected promise.
 */

import { createAppError } from '@curve/domain';
import type { AppError, Row, TableMeta } from '@curve/domain';
import {
  createDecodeRequest,
  createEncodeRequest,
  isTableWorkerResponse,
} from '@curve/table-engine';
import type {
  JsonlDecodeResult,
  TableEncodeResult,
  TableWorkerCallResult,
  TableWorkerRequest,
} from '@curve/table-engine';

/**
 * The subset of `Worker` this client needs. Declaring it keeps the client
 * unit-testable without a real Worker implementation.
 */
export interface TableWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: TableWorkerRequest): void;
  terminate(): void;
}

export interface TableIoClientOptions {
  /** Injected in tests; defaults to the bundled module Worker. */
  createWorker?: () => TableWorkerPort;
  /** Per-request budget. A stuck Worker must not hang autosave forever. */
  timeoutMs?: number;
}

export interface TableIoClient {
  decode(jsonl: string, table: TableMeta): Promise<TableWorkerCallResult<JsonlDecodeResult>>;
  encode(rows: readonly Row[]): Promise<TableWorkerCallResult<TableEncodeResult>>;
  /** Stops the Worker and settles every pending call with an error. */
  terminate(): void;
  /** Calls waiting for a response; exposed for diagnostics and tests. */
  readonly pending: number;
}

/** 100k rows decode in ~2s on the reference machine; keep generous headroom. */
export const DEFAULT_TABLE_WORKER_TIMEOUT_MS = 120_000;

interface PendingCall {
  resolve: (result: TableWorkerCallResult<unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
}

function createModuleWorker(): TableWorkerPort {
  // `Worker` types its handlers with DOM `MessageEvent`/`ErrorEvent`, while the
  // port deliberately accepts `unknown` so tests can deliver plain objects.
  return new Worker(new URL('../workers/table.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as TableWorkerPort;
}

export function createTableIoClient(options: TableIoClientOptions = {}): TableIoClient {
  const createWorker = options.createWorker ?? createModuleWorker;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TABLE_WORKER_TIMEOUT_MS;

  let worker: TableWorkerPort | null = null;
  let terminated = false;
  let nextId = 1;
  const pending = new Map<number, PendingCall>();

  function failAll(error: AppError): void {
    for (const [id, call] of pending) {
      pending.delete(id);
      clearTimeout(call.timer);
      call.resolve({ ok: false, error });
    }
  }

  function settle(message: unknown): void {
    if (!isTableWorkerResponse(message)) {
      failAll(createAppError('E_UNKNOWN', 'The table worker returned a malformed response.'));
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

  function ensureWorker(): TableWorkerPort | null {
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
        failAll(createAppError('E_UNKNOWN', 'The table worker reported an error.'));
      };
      worker = created;
      return created;
    } catch {
      return null;
    }
  }

  function request<TResult>(
    build: (id: number) => TableWorkerRequest,
  ): Promise<TableWorkerCallResult<TResult>> {
    return new Promise((resolve) => {
      if (terminated) {
        resolve({
          ok: false,
          error: createAppError('E_UNKNOWN', 'The table worker has been terminated.'),
        });
        return;
      }
      const port = ensureWorker();
      if (port === null) {
        resolve({
          ok: false,
          error: createAppError('E_UNKNOWN', 'The table worker could not be created.'),
        });
        return;
      }

      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({
          ok: false,
          error: createAppError('E_UNKNOWN', 'The table worker did not answer in time.'),
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
            error instanceof Error ? error.message : 'The table worker rejected the message.',
          ),
        });
      }
    });
  }

  return {
    decode: (jsonl: string, table: TableMeta) =>
      request<JsonlDecodeResult>((id) => createDecodeRequest(id, jsonl, table)),
    encode: (rows: readonly Row[]) =>
      request<TableEncodeResult>((id) => createEncodeRequest(id, rows)),
    terminate: () => {
      terminated = true;
      worker?.terminate();
      worker = null;
      failAll(createAppError('E_UNKNOWN', 'The table worker has been terminated.'));
    },
    get pending(): number {
      return pending.size;
    },
  };
}
