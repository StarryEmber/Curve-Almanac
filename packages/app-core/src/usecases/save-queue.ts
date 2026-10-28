/**
 * Serial autosave queue for document changes (T2.2, T5.3; ADR-028, ADR-048).
 *
 * Every successful row/table command enqueues its table; manifest-only changes
 * enqueue the manifest. A single loop encodes each table off the UI thread
 * (injected Worker port) and writes JSONL followed by the manifest, so the two
 * file kinds never race.
 *
 * T5.3 adds the SPEC §13.3 autosave window: a change schedules a write
 * `AUTOSAVE_DELAY_MS` after the *last* change, and the queue is forced no later
 * than `AUTOSAVE_MAX_DELAY_MS` after the *first* pending change. `flush()`
 * (Ctrl/Cmd+S, close workspace, quit handshake) cancels the window and writes
 * immediately. Re-enqueuing while a table is in flight coalesces into one
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
  /** Quiet period after the last document change (SPEC §13.3; default 1500ms). */
  autosaveDelayMs?: number;
  /** Upper bound measured from the first pending change (default 10s). */
  autosaveMaxDelayMs?: number;
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

/** SPEC §13.3: write 1.5s after the last change… */
export const AUTOSAVE_DELAY_MS = 1_500;

/** …but never more than 10s after the first pending change. */
export const AUTOSAVE_MAX_DELAY_MS = 10_000;

function fail(error: AppError): SaveOutcome {
  return { ok: false, error };
}

export function createSaveQueue(options: SaveQueueOptions): SaveQueue {
  const { store, workspaceStore } = options;
  const logger = options.logger ?? defaultAppLogger;
  const autosaveDelayMs = Math.max(0, options.autosaveDelayMs ?? AUTOSAVE_DELAY_MS);
  const autosaveMaxDelayMs = Math.max(
    autosaveDelayMs,
    options.autosaveMaxDelayMs ?? AUTOSAVE_MAX_DELAY_MS,
  );
  const pending = new Set<string>();
  const waiters = new Set<Waiter>();
  let running = false;
  let lastError: AppError | null = null;
  /** Bumped by every `enqueueManifest` so an in-flight table save can tell. */
  let manifestVersion = 0;
  let manifestDirty = false;
  /** Pending autosave window; `null` when no write is scheduled. */
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Wall-clock time of the first change in the current dirty window. */
  let firstPendingAt: number | null = null;

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

  const clearAutosave = (): void => {
    if (autosaveTimer !== null) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    firstPendingAt = null;
  };

  /**
   * Schedules the next write inside the SPEC §13.3 window.
   *
   * Trailing debounce: every new change restarts the quiet period, but the
   * delay is clamped so the first pending change is never older than the
   * 10-second cap. `flush()`/`retry()` bypass this and call `run()` directly.
   */
  const scheduleAutosave = (): void => {
    if (running) {
      return;
    }
    const nowMs = Date.now();
    if (firstPendingAt === null) {
      firstPendingAt = nowMs;
    }
    const untilForce = firstPendingAt + autosaveMaxDelayMs - nowMs;
    const delay = Math.max(0, Math.min(autosaveDelayMs, untilForce));
    if (autosaveTimer !== null) {
      clearTimeout(autosaveTimer);
    }
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      firstPendingAt = null;
      void run();
    }, delay);
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
    if (autosaveTimer !== null) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    firstPendingAt = null;
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
      scheduleAutosave();
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
      scheduleAutosave();
    },

    cancel(tableId: string): void {
      pending.delete(tableId);
      if (!running && pending.size === 0 && !manifestDirty && lastError === null) {
        clearAutosave();
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
      clearAutosave();
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
        // Ctrl/Cmd+S, close-workspace and the quit handshake must not wait for
        // the 1.5s autosave window (SPEC §13.3).
        clearAutosave();
        publish('saving', pending.size, null);
        void run();
      });
    },

    reset(): void {
      clearAutosave();
      pending.clear();
      lastError = null;
      manifestVersion = 0;
      manifestDirty = false;
      publish('idle', 0, null);
    },
  };
}
