import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { createAppError, parseManifest } from '@curve/domain';
import type { AppError, TableMeta, ViewDef, WorkspaceManifest } from '@curve/domain';
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
import { utf8ByteLength, decodeJsonl } from '@curve/table-engine';

import { createAppCore } from '../app-core';
import { selectActiveView, selectCurrentTable, selectVisibleRows } from '../state/selectors';
import { createAppStore } from '../state/store';

import { createOpenWorkspace } from './open-workspace';

import type { AppLogger } from '../logging';

const FIXTURE_DIR = fileURLToPath(
  new URL('../../../../fixtures/workspaces/v1-min/', import.meta.url),
);
const NOW = '2026-01-01T12:00:00.000Z';

interface Fixture {
  manifest: WorkspaceManifest;
  jsonl: string;
}

function loadFixture(): Fixture {
  const rawManifest = readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8');
  const parsed = parseManifest(JSON.parse(rawManifest) as unknown);
  if (!parsed.ok) {
    throw new Error(JSON.stringify(parsed.issues));
  }
  return {
    manifest: parsed.data,
    jsonl: readFileSync(join(FIXTURE_DIR, 'tables', 'tbl_v1min.jsonl'), 'utf8'),
  };
}

class FixtureStore implements WorkspaceStore {
  constructor(
    private readonly manifest: WorkspaceManifest,
    private readonly tables: ReadonlyMap<string, string>,
    private readonly openError?: AppError,
  ) {}

  async create(_request: CreateWorkspaceRequest): Promise<WorkspaceManifest> {
    throw new Error('FixtureStore.create is not used by T1.5 tests.');
  }

  async open(_request: OpenWorkspaceRequest): Promise<WorkspaceOpenResult> {
    if (this.openError !== undefined) {
      throw this.openError;
    }
    return { manifest: this.manifest, warnings: [] };
  }

  async close(_request: CloseWorkspaceRequest): Promise<OkReply> {
    return { ok: true };
  }

  async readTable(request: TableRef): Promise<TableReadResult> {
    const jsonl = this.tables.get(request.tableId);
    if (jsonl === undefined) {
      throw createAppError('E_TABLE_NOT_FOUND', 'The table data file is missing.');
    }
    return { jsonl, bytes: utf8ByteLength(jsonl) };
  }

  async writeTable(_request: WriteTableRequest): Promise<WriteTableResult> {
    return { bytes: 0 };
  }

  async writeManifest(_request: WriteManifestRequest): Promise<OkReply> {
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

function makeStore(fixture: Fixture): FixtureStore {
  return new FixtureStore(fixture.manifest, new Map([['tbl_v1min', fixture.jsonl]]));
}

function makeLogger(): AppLogger {
  return { error: vi.fn(), warn: vi.fn() };
}

const EXPECTED_ROWS = [
  { id: 'row_0001', values: ['sensor-1', 1735689600000, 21.5] },
  { id: 'row_0002', values: ['sensor-2', 1735689660000, 23.1] },
  { id: 'row_0003', values: ['sensor-3', 1735689720000, 19.8] },
];

describe('workspace.open use case', () => {
  it('loads the v1-min fixture manifest, rows and layout into app-core state', async () => {
    const fixture = loadFixture();
    const appStore = createAppStore();
    const logger = makeLogger();
    const open = createOpenWorkspace({ store: makeStore(fixture), appStore, logger });

    const outcome = await open({ dir: 'C:\\tmp\\V1 Min.cstudio' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.manifest.id).toBe('ws_v1min');
    expect(outcome.warnings).toEqual([]);

    const state = appStore.getState();
    expect(state.workspace).toMatchObject({
      id: 'ws_v1min',
      name: 'V1 Min',
      root: 'C:\\tmp\\V1 Min.cstudio',
      warnings: [],
    });
    expect(Object.keys(state.tables)).toEqual(['tbl_v1min']);
    expect(state.tables['tbl_v1min']?.rows).toEqual(EXPECTED_ROWS);
    expect(selectCurrentTable(state)).toBe(state.tables['tbl_v1min']);
    expect(selectVisibleRows(state)).toBe(state.tables['tbl_v1min']?.rows);
    expect(state.ui.activeTableId).toBe('tbl_v1min');
    expect(state.ui.activeViewId).toBeNull();
    expect(state.ui.error).toBeNull();
    expect(state.ui.dirtyTables).toEqual([]);
    expect(state.layout).toEqual(fixture.manifest.layout);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('restores a pane and its active table view from the manifest layout', async () => {
    const fixture = loadFixture();
    const view: ViewDef = {
      id: 'viw_v1min',
      kind: 'table',
      refId: 'tbl_v1min',
      title: 'Sensor readings',
      tableView: {
        tableId: 'tbl_v1min',
        styleId: 'builtin.report-light',
        columnOrder: ['col_id', 'col_time', 'col_sensor_a'],
        widths: {},
        hiddenColumnIds: [],
        sort: [],
        frozenColumnCount: 0,
      },
    };
    const manifest: WorkspaceManifest = {
      ...fixture.manifest,
      views: [view],
      layout: { type: 'pane', viewIds: [view.id], activeViewId: view.id },
    };
    const appStore = createAppStore();
    const open = createOpenWorkspace({
      store: new FixtureStore(manifest, new Map([['tbl_v1min', fixture.jsonl]])),
      appStore,
      logger: makeLogger(),
    });

    const outcome = await open({ dir: 'C:\\tmp\\V1 Min.cstudio' });
    expect(outcome.ok).toBe(true);
    const state = appStore.getState();
    expect(state.layout).toEqual(manifest.layout);
    expect(state.ui.activeViewId).toBe(view.id);
    expect(selectActiveView(state)).toEqual(view);
    expect(state.ui.activeTableId).toBe('tbl_v1min');
  });

  it('keeps valid rows and reports non-blocking decode issues as warnings', async () => {
    const fixture = loadFixture();
    const appStore = createAppStore();
    const logger = makeLogger();
    const open = createOpenWorkspace({
      store: new FixtureStore(
        fixture.manifest,
        new Map([['tbl_v1min', `${fixture.jsonl}{"id":"row_bad"}\n`]]),
      ),
      appStore,
      logger,
    });

    const outcome = await open({ dir: 'C:\\tmp\\V1 Min.cstudio' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]).toContain('tbl_v1min');
    expect(appStore.getState().tables['tbl_v1min']?.rows).toEqual(EXPECTED_ROWS);
    expect(appStore.getState().workspace?.warnings).toEqual(outcome.warnings);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('leaves document state untouched and publishes ui.error when open fails', async () => {
    const fixture = loadFixture();
    const locked = createAppError('E_WS_LOCKED', 'The workspace is locked.');
    const appStore = createAppStore();
    const logger = makeLogger();
    const before = appStore.getState();
    const open = createOpenWorkspace({
      store: new FixtureStore(fixture.manifest, new Map(), locked),
      appStore,
      logger,
    });

    const outcome = await open({ dir: 'C:\\tmp\\V1 Min.cstudio' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.error).toEqual(locked);
    const after = appStore.getState();
    expect(after.workspace).toBe(before.workspace);
    expect(after.tables).toBe(before.tables);
    expect(after.views).toBe(before.views);
    expect(after.layout).toBe(before.layout);
    expect(after.ui.error).toEqual(locked);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('fails atomically when a table cannot be read', async () => {
    const fixture = loadFixture();
    const appStore = createAppStore();
    const logger = makeLogger();
    const before = appStore.getState();
    const open = createOpenWorkspace({
      store: new FixtureStore(fixture.manifest, new Map()),
      appStore,
      logger,
    });

    const outcome = await open({ dir: 'C:\\tmp\\V1 Min.cstudio' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.error.code).toBe('E_TABLE_NOT_FOUND');
    expect(appStore.getState().tables).toBe(before.tables);
    expect(appStore.getState().ui.error).toEqual(outcome.error);
  });

  it('uses the injected async decoder (T2.1 Worker port) instead of inline decode', async () => {
    const fixture = loadFixture();
    const appStore = createAppStore();
    const decodeTable = vi.fn(async (jsonl: string, table: TableMeta) => decodeJsonl(jsonl, table));
    const open = createOpenWorkspace({
      store: makeStore(fixture),
      appStore,
      logger: makeLogger(),
      decodeTable,
    });

    const outcome = await open({ dir: 'C:\\tmp\\V1 Min.cstudio' });
    expect(outcome.ok).toBe(true);
    expect(decodeTable).toHaveBeenCalledTimes(1);
    expect(appStore.getState().tables['tbl_v1min']?.rows).toEqual(EXPECTED_ROWS);
  });

  it('fails atomically when the injected decoder rejects', async () => {
    const fixture = loadFixture();
    const appStore = createAppStore();
    const before = appStore.getState();
    const open = createOpenWorkspace({
      store: makeStore(fixture),
      appStore,
      logger: makeLogger(),
      decodeTable: async () => {
        throw createAppError('E_TABLE_PARSE', 'worker failed');
      },
    });

    const outcome = await open({ dir: 'C:\\tmp\\V1 Min.cstudio' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.error.code).toBe('E_TABLE_PARSE');
    expect(appStore.getState().tables).toBe(before.tables);
    expect(appStore.getState().ui.error).toEqual(outcome.error);
  });
});

describe('createAppCore composition', () => {
  it('wires open + table.cell.set through one public entry point', async () => {
    const fixture = loadFixture();
    const logger = makeLogger();
    const core = createAppCore({
      workspaceStore: makeStore(fixture),
      logger,
      now: () => new Date(NOW),
    });

    const opened = await core.openWorkspace({ dir: 'C:\\tmp\\V1 Min.cstudio' });
    expect(opened.ok).toBe(true);
    expect(core.commands.has('table.cell.set')).toBe(true);

    const outcome = core.commands.dispatch('table.cell.set', {
      tableId: 'tbl_v1min',
      rowId: 'row_0001',
      columnId: 'col_sensor_a',
      value: 22.2,
    });
    expect(outcome.ok).toBe(true);
    expect(core.store.getState().tables['tbl_v1min']?.rows[0]?.values[2]).toBe(22.2);
    expect(core.store.getState().tables['tbl_v1min']?.table.updatedAt).toBe(NOW);
    expect(core.store.getState().ui.dirtyTables.map((entry) => entry.tableId)).toEqual([
      'tbl_v1min',
    ]);
    expect((await core.actions.flushSaves()).ok).toBe(true);
    expect(core.store.getState().ui.save.status).toBe('saved');
    expect(logger.error).not.toHaveBeenCalled();
  });
});
