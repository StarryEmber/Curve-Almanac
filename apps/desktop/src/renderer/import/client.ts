/**
 * Renderer-side client for the dedicated import Worker (T2.5).
 *
 * Closing the wizard calls `terminate()`: the Worker and its parsed dataset are
 * dropped immediately, so a cancelled import cannot later dispatch anything.
 * Every call resolves to an `AppError` envelope; callers never see a rejected
 * promise.
 */

import { createAppError } from '@curve/domain';
import type { AppError } from '@curve/domain';
import type { ImportPlan } from '@curve/table-engine';

import { isImportWorkerResponse } from './worker-protocol';

import type {
  ImportConfigurePayload,
  ImportFormatHint,
  ImportPlanPayload,
  ImportPreview,
  ImportWorkerCallResult,
  ImportWorkerRequest,
} from './worker-protocol';

export interface ImportWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: ImportWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface ImportWorkerClientOptions {
  createWorker?: () => ImportWorkerPort;
  timeoutMs?: number;
}

export interface ImportWorkerClient {
  open(
    bytes: Uint8Array,
    fileName: string,
    format?: ImportFormatHint,
  ): Promise<ImportWorkerCallResult<ImportPreview>>;
  configure(payload: ImportConfigurePayload): Promise<ImportWorkerCallResult<ImportPreview>>;
  plan(payload: ImportPlanPayload): Promise<ImportWorkerCallResult<ImportPlan>>;
  terminate(): void;
  readonly pending: number;
}

export const DEFAULT_IMPORT_WORKER_TIMEOUT_MS = 120_000;

interface PendingCall {
  resolve: (result: ImportWorkerCallResult<unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
}

function createModuleWorker(): ImportWorkerPort {
  return new Worker(new URL('../workers/import.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as ImportWorkerPort;
}

function fail(error: AppError): ImportWorkerCallResult<never> {
  return { ok: false, error };
}

export function createImportWorkerClient(
  options: ImportWorkerClientOptions = {},
): ImportWorkerClient {
  const createWorker = options.createWorker ?? createModuleWorker;
  const timeoutMs = options.timeoutMs ?? DEFAULT_IMPORT_WORKER_TIMEOUT_MS;

  let worker: ImportWorkerPort | null = null;
  let terminated = false;
  let nextId = 1;
  const pending = new Map<number, PendingCall>();

  function failAll(error: AppError): void {
    for (const [id, call] of pending) {
      pending.delete(id);
      clearTimeout(call.timer);
      call.resolve(fail(error));
    }
  }

  function settle(message: unknown): void {
    if (!isImportWorkerResponse(message)) {
      failAll(
        createAppError('E_IMPORT_FORMAT', 'The import worker returned a malformed response.'),
      );
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

  function ensureWorker(): ImportWorkerPort | null {
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
        failAll(createAppError('E_IMPORT_FORMAT', 'The import worker reported an error.'));
      };
      worker = created;
      return created;
    } catch {
      return null;
    }
  }

  function request<TResult>(
    build: (id: number) => { message: ImportWorkerRequest; transfer?: Transferable[] },
  ): Promise<ImportWorkerCallResult<TResult>> {
    return new Promise((resolve) => {
      if (terminated) {
        resolve(fail(createAppError('E_IMPORT_FORMAT', 'The import worker has been terminated.')));
        return;
      }
      const port = ensureWorker();
      if (port === null) {
        resolve(fail(createAppError('E_IMPORT_FORMAT', 'The import worker could not be created.')));
        return;
      }

      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(
          fail(createAppError('E_IMPORT_FORMAT', 'The import worker did not answer in time.')),
        );
      }, timeoutMs);
      pending.set(id, { resolve: resolve as PendingCall['resolve'], timer });

      try {
        const { message, transfer } = build(id);
        port.postMessage(message, transfer);
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        resolve(
          fail(
            createAppError(
              'E_IMPORT_FORMAT',
              error instanceof Error ? error.message : 'The import worker rejected the message.',
            ),
          ),
        );
      }
    });
  }

  return {
    open: (bytes: Uint8Array, fileName: string, format?: ImportFormatHint) =>
      request<ImportPreview>((id) => ({
        message: {
          id,
          type: 'open',
          payload: { bytes, fileName, ...(format === undefined ? {} : { format }) },
        },
        transfer: [bytes.buffer],
      })),
    configure: (payload: ImportConfigurePayload) =>
      request<ImportPreview>((id) => ({
        message: { id, type: 'configure', payload },
      })),
    plan: (payload: ImportPlanPayload) =>
      request<ImportPlan>((id) => ({ message: { id, type: 'plan', payload } })),
    terminate: () => {
      terminated = true;
      worker?.terminate();
      worker = null;
      failAll(createAppError('E_IMPORT_FORMAT', 'The import worker has been terminated.'));
    },
    get pending(): number {
      return pending.size;
    },
  };
}
