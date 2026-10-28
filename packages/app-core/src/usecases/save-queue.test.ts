import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppError } from '@curve/domain';
import type { Row, TableMeta, WorkspaceManifest } from '@curve/domain';
import type {
  BackupEntry,
  CloseWorkspaceRequest,
  CreateWorkspaceRequest,
  OkReply,
  OpenWorkspaceRequest,
  RestoreBackupRequest,
  TableReadResult,
  TableRef,
  WorkspaceOpenResult,
  WorkspaceStore,
  WriteManifestRequest,
  WriteTableRequest,
  WriteTableResult,
} from '@curve/persistence';
import type { TableEncodeResult, TableWorkerCallResult } from '@curve/table-engine';

import { createAppStore } from '../state/store';

import { AUTOSAVE_DELAY_MS, AUTOSAVE_MAX_DELAY_MS, createSaveQueue } from './save-queue';

import type { SaveQueueOptions } from './save-queue';
import type { AppLogger } from '../logging';
import type { WorkspaceInfo } from '../state/types';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

const TABLE: TableMeta = {
  id: 'tbl_test',
  name: 'Test',
  file: 'tables/tbl_test.jsonl',
  schemaVersion: 1,
  columns: [
    { id: 'col_id', key: 'id', label: 'Id', type: 'text', role: 'none', required: true },
    { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
  ],
  primaryKey: 'col_id',
  rowCount: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const ROWS: Row[] = [{ id: 'row_1', values: ['alpha', 1] }];

const WORKSPACE: WorkspaceInfo = {
  formatVersion: 1,
  id: 'ws_test',
  name: 'Test',
  root: 'C:\\tmp\\Test.cstudio',
  appVersion: '0.1.0',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  settings: {
    theme: 'system',
    locale: 'zh-CN',
    defaultTableStyleId: 'builtin.report-light',
    autosave: true,
  },
  warnings: [],
};

const logger: AppLogger = { error: () => undefined, warn: () => undefined };

class RecordingStore implements WorkspaceStore {
  readonly calls: string[] = [];
  readonly tables: Array<{ tableId: string; jsonl: string }> = [];
  readonly manifests: WorkspaceManifest[] = [];
  failTable = false;
  failManifest = false;

  async create(_request: CreateWorkspaceRequest): Promise<WorkspaceManifest> {
    throw new Error('not used');
  }
  async open(_request: OpenWorkspaceRequest): Promise<WorkspaceOpenResult> {
    throw new Error('not used');
  }
  async close(_request: CloseWorkspaceRequest): Promise<OkReply> {
    return { ok: true };
  }
  async readTable(_request: TableRef): Promise<TableReadResult> {
    throw new Error('not used');
  }
  async writeTable(request: WriteTableRequest): Promise<WriteTableResult> {
    this.calls.push('writeTable');
    if (this.failTable) {
      throw createAppError('E_FS_WRITE', 'disk full');
    }
    this.tables.push({ tableId: request.tableId, jsonl: request.jsonl });
    return { bytes: request.jsonl.length };
  }
  async writeManifest(request: WriteManifestRequest): Promise<OkReply> {
    this.calls.push('writeManifest');
    if (this.failManifest) {
      throw createAppError('E_FS_WRITE', 'manifest disk full');
    }
    this.manifests.push(request.manifest);
    return { ok: true };
  }
  async trash(_request: TableRef): Promise<OkReply> {
    return { ok: true };
  }
  async listBackups(_request: TableRef): Promise<BackupEntry[]> {
    return [];
  }
  async restore(_request: RestoreBackupRequest): Promise<OkReply> {
    return { ok: true };
  }
}

function setup(options: Partial<SaveQueueOptions> = {}): {
  store: ReturnType<typeof createAppStore>;
  workspaceStore: RecordingStore;
  queue: ReturnType<typeof createSaveQueue>;
  encode: ReturnType<typeof vi.fn>;
} {
  const store = createAppStore({
    initialState: {
      workspace: WORKSPACE,
      tables: { tbl_test: { table: TABLE, rows: ROWS } },
    },
  });
  store.getState().actions.markDirty('tbl_test');
  const workspaceStore = new RecordingStore();
  const encode = vi.fn(
    async (rows: readonly Row[]): Promise<TableWorkerCallResult<TableEncodeResult>> => ({
      ok: true,
      result: {
        jsonl: `${rows.map((row) => JSON.stringify({ id: row.id, v: row.values })).join('\n')}\n`,
        bytes: 0,
      },
    }),
  );
  const queue = createSaveQueue({
    store,
    workspaceStore,
    encodeTable: encode,
    logger,
    // Existing T2.2 tests assert the write path itself; autosave timing has its
    // own cases below. Production uses the SPEC §13.3 1500ms window.
    autosaveDelayMs: 0,
    ...options,
  });
  return { store, workspaceStore, queue, encode };
}

describe('save queue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the table before the manifest and clears the dirty marker', async () => {
    const { store, workspaceStore, queue } = setup();

    queue.enqueue('tbl_test');
    const outcome = await queue.flush();

    expect(outcome.ok).toBe(true);
    expect(workspaceStore.calls).toEqual(['writeTable', 'writeManifest']);
    expect(workspaceStore.tables[0]?.jsonl).toContain('"v":["alpha",1]');
    expect(workspaceStore.manifests).toHaveLength(1);
    expect(workspaceStore.manifests[0]?.tables[0]?.id).toBe('tbl_test');
    expect(store.getState().ui.dirtyTables).toEqual([]);
    expect(store.getState().ui.save.status).toBe('saved');
  });

  it('keeps the table dirty and exposes a retryable error when the write fails', async () => {
    const { store, workspaceStore, queue } = setup();
    workspaceStore.failTable = true;

    queue.enqueue('tbl_test');
    const outcome = await queue.flush();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_FS_WRITE');
    }
    expect(store.getState().ui.dirtyTables.map((entry) => entry.tableId)).toEqual(['tbl_test']);
    expect(store.getState().ui.save.status).toBe('error');
    expect(store.getState().ui.save.error?.code).toBe('E_FS_WRITE');

    workspaceStore.failTable = false;
    queue.retry();
    expect((await queue.flush()).ok).toBe(true);
    expect(store.getState().ui.dirtyTables).toEqual([]);
    expect(store.getState().ui.save.status).toBe('saved');
  });

  it('keeps the dirty marker when the manifest fails after the table write', async () => {
    const { store, workspaceStore, queue } = setup();
    workspaceStore.failManifest = true;

    queue.enqueue('tbl_test');
    expect((await queue.flush()).ok).toBe(false);

    expect(store.getState().ui.dirtyTables.map((entry) => entry.tableId)).toEqual(['tbl_test']);
    expect(store.getState().ui.save.status).toBe('error');
  });

  it('serialises writes and coalesces an enqueue that arrives while saving', async () => {
    const { store, workspaceStore, queue, encode } = setup();
    let release: (() => void) | undefined;
    const firstEncode = new Promise<void>((resolve) => {
      release = resolve;
    });
    encode.mockImplementationOnce(async (rows: readonly Row[]) => {
      await firstEncode;
      return {
        ok: true,
        result: { jsonl: `${JSON.stringify(rows[0])}\n`, bytes: 0 },
      };
    });

    queue.enqueue('tbl_test');
    await vi.waitFor(() => {
      expect(encode).toHaveBeenCalledTimes(1);
    });
    // The first write is blocked in the Worker; a second edit arrives.
    store.setState((state) => ({
      ...state,
      tables: {
        ...state.tables,
        tbl_test: {
          ...state.tables['tbl_test']!,
          rows: [{ id: 'row_1', values: ['alpha', 2] }],
        },
      },
    }));
    store.getState().actions.markDirty('tbl_test');
    queue.enqueue('tbl_test');
    release?.();

    expect((await queue.flush()).ok).toBe(true);
    expect(workspaceStore.calls).toEqual([
      'writeTable',
      'writeManifest',
      'writeTable',
      'writeManifest',
    ]);
    expect(workspaceStore.tables.at(-1)?.jsonl).toContain('"v":["alpha",2]');
    expect(store.getState().ui.dirtyTables).toEqual([]);
  });

  it('writes only the manifest for a manifest-only change', async () => {
    const { workspaceStore, queue } = setup();

    queue.enqueueManifest();
    const outcome = await queue.flush();

    expect(outcome.ok).toBe(true);
    expect(workspaceStore.calls).toEqual(['writeManifest']);
    expect(workspaceStore.manifests).toHaveLength(1);
  });

  it('keeps a manifest-only write retryable', async () => {
    const { store, workspaceStore, queue } = setup();
    store.getState().actions.clearDirty('tbl_test');
    workspaceStore.failManifest = true;

    queue.enqueueManifest();
    expect((await queue.flush()).ok).toBe(false);
    expect(store.getState().ui.save.status).toBe('error');
    expect(workspaceStore.calls).toEqual(['writeManifest']);

    // A later flush must return the stored error, not wait for a stopped loop.
    expect((await queue.flush(10)).ok).toBe(false);

    workspaceStore.failManifest = false;
    queue.retry();
    expect((await queue.flush()).ok).toBe(true);
    expect(workspaceStore.calls).toEqual(['writeManifest', 'writeManifest']);
    expect(store.getState().ui.save.status).toBe('saved');
  });

  it('times out without dropping the dirty marker', async () => {
    const { store, workspaceStore, queue, encode } = setup();
    encode.mockImplementationOnce(() => new Promise(() => undefined));

    queue.enqueue('tbl_test');
    const outcome = await queue.flush(10);

    expect(outcome.ok).toBe(false);
    expect(store.getState().ui.dirtyTables.map((entry) => entry.tableId)).toEqual(['tbl_test']);
    expect(workspaceStore.calls).toEqual([]);
  });

  it('uses the SPEC §13.3 autosave window by default', () => {
    expect(AUTOSAVE_DELAY_MS).toBe(1_500);
    expect(AUTOSAVE_MAX_DELAY_MS).toBe(10_000);
  });

  it('waits 1500ms after the last change before writing', async () => {
    vi.useFakeTimers();
    const { workspaceStore, queue } = setup({
      autosaveDelayMs: 1500,
      autosaveMaxDelayMs: 10_000,
    });

    queue.enqueue('tbl_test');
    expect(workspaceStore.calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(1_499);
    expect(workspaceStore.calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(workspaceStore.calls).toEqual(['writeTable', 'writeManifest']);
  });

  it('restarts the autosave window on every change', async () => {
    vi.useFakeTimers();
    const { workspaceStore, queue } = setup({
      autosaveDelayMs: 1500,
      autosaveMaxDelayMs: 10_000,
    });

    queue.enqueue('tbl_test');
    await vi.advanceTimersByTimeAsync(1_000);
    queue.enqueue('tbl_test');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(workspaceStore.calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(500);
    expect(workspaceStore.calls).toEqual(['writeTable', 'writeManifest']);
    expect(workspaceStore.tables).toHaveLength(1);
  });

  it('forces a write 10s after the first change even when edits keep arriving', async () => {
    vi.useFakeTimers();
    const { workspaceStore, queue } = setup({
      autosaveDelayMs: 1500,
      autosaveMaxDelayMs: 10_000,
    });

    queue.enqueue('tbl_test');
    await vi.advanceTimersByTimeAsync(9_000);
    // The next change would normally push the write to 10.5s; the cap wins.
    queue.enqueue('tbl_test');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(workspaceStore.calls).toEqual(['writeTable', 'writeManifest']);
  });

  it('flush bypasses the autosave window', async () => {
    const { workspaceStore, queue } = setup({
      autosaveDelayMs: 1500,
      autosaveMaxDelayMs: 10_000,
    });

    queue.enqueue('tbl_test');
    const outcome = await queue.flush();

    expect(outcome.ok).toBe(true);
    expect(workspaceStore.calls).toEqual(['writeTable', 'writeManifest']);
  });

  it('retry bypasses the autosave window', async () => {
    const { workspaceStore, queue } = setup({
      autosaveDelayMs: 1500,
      autosaveMaxDelayMs: 10_000,
    });
    workspaceStore.failTable = true;

    queue.enqueue('tbl_test');
    expect((await queue.flush()).ok).toBe(false);
    workspaceStore.failTable = false;

    queue.retry();
    expect((await queue.flush()).ok).toBe(true);
    expect(workspaceStore.calls).toEqual(['writeTable', 'writeTable', 'writeManifest']);
  });
});
