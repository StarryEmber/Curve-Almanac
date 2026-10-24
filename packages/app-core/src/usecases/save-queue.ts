/**
 * Serial save queue for committed cell edits (T2.2, ADR-028).
 *
 * Every successful `table.cell.set` enqueues its table. A single loop encodes
 * the table off the UI thread (injected Worker port) and writes JSONL followed
 * by the manifest. Re-enqueuing while a table is in flight coalesces into one
 * follow-up write with the latest rows. Failures keep the dirty marker, stop the
 * loop and expose a retryable status; the next edit or `retry()` resumes it.
 */

import { createAppError, toAppError } from '@curve/domain';
import type { AppError, Row } from '@curve/domain';
import type { WorkspaceStore } from '@curve/persistence';
import { encodeJsonlWithStats } from '@curve/table-engine';
import type { TableEncodeResult, TableWorkerCallResult } from '@curve/table-engine';

import { defaultAppLogger } from '../logging';
import { stateToManifest } from '../state/manifest';

import type { AppLogger } from '../logging';
import type { AppStore, SaveState } from '../state/types';

export type EncodeTable = (
  rows: readonly Row[],
) => Promise<TableWorkerCallResult<TableEncodeResult>>;

export interface SaveQueueOptions {
  store: AppStore;
  workspaceStore: WorkspaceStore;
  /** Renderer injects the table Worker; tests may omit it for a sync fallback. */
  encodeTable?: EncodeTable;
  logger?: AppLogger;
}

export type SaveOutcome =
  | { readonly ok: true; readonly data: undefined }
  | { readonly ok: false; readonly error: AppError };

export interface SaveQueue {
  enqueue(tableId: string): void;
  /** Writes only `manifest.json` (style/view metadata changes). */
  enqueueManifest(): void;
  cancel(tableId: string): void;
  retry(): void;
  /** Waits for the queue to drain; resolves with the last error, if any. */
  flush(timeoutMs?: number): Promise<SaveOutcome>;
  reset(): void;
}

interface Waiter {
  resolve: (outcome: SaveOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_FLUSH_TIMEOUT_MS = 3_000;

function fail(error: AppError): SaveOutcome {
  return { ok: false, error };
}

export function createSaveQueue(options: SaveQueueOptions): SaveQueue {
  const { store, workspaceStore } = options;
  const logger = options.logger ?? defaultAppLogger;
  const pending = new Set<string>();
  const waiters = new Set<Waiter>();
  let running = false;
  let lastError: AppError | null = null;
  /** Bumped by every `enqueueManifest` so an in-flight table save can tell. */
  let manifestVersion = 0;
  let manifestDirty = false;

  const publish = (status: SaveState['status'], pendingCount: number, error: AppError | null) => {
    const state: SaveState = { status, pending: pendingCount, error };
    store.getState().actions.setSaveState(state);
  };

  const resolveWaiters = (): void => {
    const outcome: SaveOutcome =
      lastError === null ? { ok: true, data: undefined } : fail(lastError);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(outcome);
    }
    waiters.clear();
  };

  const saveManifestOnly = async (): Promise<SaveOutcome> => {
    const manifest = stateToManifest(store.getState());
    if (manifest === null) {
      return { ok: true, data: undefined };
    }
    try {
      await workspaceStore.writeManifest({ workspaceId: manifest.id, manifest });
      return { ok: true, data: undefined };
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
  };

  const saveOne = async (tableId: string): Promise<SaveOutcome> => {
    const state = store.getState();
    const workspace = state.workspace;
    const tableData = state.tables[tableId];
    if (workspace === null || tableData === undefined) {
      return { ok: true, data: undefined };
    }

    try {
      const encoded =
        options.encodeTable === undefined
          ? { ok: true as const, result: encodeJsonlWithStats(tableData.rows) }
          : await options.encodeTable(tableData.rows);
      if (!encoded.ok) {
        return fail(encoded.error);
      }
      await workspaceStore.writeTable({
        workspaceId: workspace.id,
        tableId,
        jsonl: encoded.result.jsonl,
      });

      const manifestSaved = await saveManifestOnly();
      if (!manifestSaved.ok) {
        return manifestSaved;
      }
      if (!pending.has(tableId)) {
        store.getState().actions.clearDirty(tableId);
      }
      return { ok: true, data: undefined };
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
  };

  const run = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      while (pending.size > 0 || manifestDirty) {
        if (pending.size > 0) {
          const tableId = pending.values().next().value;
          if (tableId === undefined) {
            break;
          }
          pending.delete(tableId);
          const versionBefore = manifestVersion;
          publish('saving', pending.size + 1, null);

          const outcome = await saveOne(tableId);
          if (!outcome.ok) {
            lastError = outcome.error;
            pending.clear();
            logger.error('saving the table failed', outcome.error);
            publish('error', 0, outcome.error);
            return;
          }
          // The table save wrote the current manifest; only keep the flag when
          // another style/view change arrived while the write was in flight.
          if (manifestVersion === versionBefore) {
            manifestDirty = false;
          }
          continue;
        }

        const version = manifestVersion;
        manifestDirty = false;
        publish('saving', 0, null);
        const outcome = await saveManifestOnly();
        if (!outcome.ok) {
          manifestDirty = true;
          lastError = outcome.error;
          logger.error('saving the workspace manifest failed', outcome.error);
          publish('error', 0, outcome.error);
          return;
        }
        // A style change that arrived during the write needs another pass.
        if (manifestVersion !== version) {
          manifestDirty = true;
        }
      }
      lastError = null;
      publish('saved', 0, null);
    } finally {
      running = false;
      resolveWaiters();
    }
  };

  return {
    enqueue(tableId: string): void {
      if (store.getState().workspace === null || store.getState().tables[tableId] === undefined) {
        return;
      }
      if (lastError !== null) {
        lastError = null;
        for (const entry of store.getState().ui.dirtyTables) {
          pending.add(entry.tableId);
        }
      }
      pending.add(tableId);
      publish('saving', pending.size, null);
      void run();
    },

    enqueueManifest(): void {
      if (store.getState().workspace === null) {
        return;
      }
      manifestVersion += 1;
      manifestDirty = true;
      if (lastError !== null) {
        lastError = null;
        for (const entry of store.getState().ui.dirtyTables) {
          pending.add(entry.tableId);
        }
      }
      publish('saving', pending.size, null);
      void run();
    },

    cancel(tableId: string): void {
      pending.delete(tableId);
      if (!running && pending.size === 0 && !manifestDirty && lastError === null) {
        publish('idle', 0, null);
      }
    },

    retry(): void {
      if (store.getState().workspace === null) {
        return;
      }
      lastError = null;
      for (const entry of store.getState().ui.dirtyTables) {
        pending.add(entry.tableId);
      }
      if (pending.size === 0 && !manifestDirty) {
        publish('saved', 0, null);
        return;
      }
      publish('saving', pending.size, null);
      void run();
    },

    flush(timeoutMs = DEFAULT_FLUSH_TIMEOUT_MS): Promise<SaveOutcome> {
      if (!running && lastError !== null) {
        // A failed manifest-only write keeps `manifestDirty` for retry; do not
        // wait for a worker that is no longer running.
        return Promise.resolve(fail(lastError));
      }
      if (!running && pending.size === 0 && !manifestDirty) {
        return Promise.resolve(
          lastError === null ? { ok: true, data: undefined } : fail(lastError),
        );
      }
      return new Promise<SaveOutcome>((resolve) => {
        const waiter: Waiter = {
          resolve,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            resolve(
              fail(
                createAppError('E_UNKNOWN', 'Timed out waiting for the table save queue.', {
                  retryable: true,
                }),
              ),
            );
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },

    reset(): void {
      pending.clear();
      lastError = null;
      manifestVersion = 0;
      manifestDirty = false;
      publish('idle', 0, null);
    },
  };
}
