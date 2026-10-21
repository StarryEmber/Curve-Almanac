import { describe, expect, it } from 'vitest';

import { createAppError } from '@curve/domain';
import type { WorkspaceManifest } from '@curve/domain';
import { createEmptyManifest } from '@curve/persistence';
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

import { createAppCore } from '../app-core';

import type { AppLogger } from '../logging';
import type { AppState } from '../state/types';

const NOW = new Date('2026-10-21T00:00:00.000Z');
const logger: AppLogger = { error: () => undefined, warn: () => undefined };

class RecordingStore implements WorkspaceStore {
  readonly calls: string[] = [];
  readonly manifests: WorkspaceManifest[] = [];
  readonly trashed: string[] = [];
  readonly closed: string[] = [];
  failManifest = false;

  async create(_request: CreateWorkspaceRequest): Promise<WorkspaceManifest> {
    throw new Error('not used');
  }
  async open(_request: OpenWorkspaceRequest): Promise<WorkspaceOpenResult> {
    throw new Error('not used');
  }
  async close(request: CloseWorkspaceRequest): Promise<OkReply> {
    this.calls.push('close');
    this.closed.push(request.workspaceId);
    return { ok: true };
  }
  async readTable(_request: TableRef): Promise<TableReadResult> {
    throw new Error('not used');
  }
  async writeTable(_request: WriteTableRequest): Promise<WriteTableResult> {
    this.calls.push('writeTable');
    return { bytes: 0 };
  }
  async writeManifest(request: WriteManifestRequest): Promise<OkReply> {
    this.calls.push('manifest');
    if (this.failManifest) {
      throw createAppError('E_FS_WRITE', 'disk full');
    }
    this.manifests.push(request.manifest);
    return { ok: true };
  }
  async trash(request: TableRef): Promise<OkReply> {
    this.calls.push('trash');
    this.trashed.push(request.tableId);
    return { ok: true };
  }
  async listBackups(_request: TableRef): Promise<BackupEntry[]> {
    return [];
  }
  async restore(_request: RestoreBackupRequest): Promise<OkReply> {
    return { ok: true };
  }
}

function workspaceState(): NonNullable<AppState['workspace']> {
  const manifest = createEmptyManifest({
    name: 'Demo',
    appVersion: '0.1.0',
    now: NOW,
    uuid: () => 'ws',
  });
  return {
    formatVersion: 1,
    id: manifest.id,
    name: manifest.name,
    root: 'C:\\tmp\\Demo.cstudio',
    appVersion: manifest.appVersion,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    settings: manifest.settings,
    warnings: [],
  };
}

function setup() {
  const store = new RecordingStore();
  let next = 0;
  const core = createAppCore({
    workspaceStore: store,
    logger,
    now: () => NOW,
    uuid: () => {
      next += 1;
      return `u${String(next)}`;
    },
  });
  core.store.setState({ workspace: workspaceState() });
  return { store, core };
}

describe('workspace actions', () => {
  it('creates a table, persists the manifest immediately and does not write a table file', async () => {
    const { store, core } = setup();

    const outcome = await core.actions.createTable('Sensors', 'id');
    expect(outcome.ok).toBe(true);
    expect(store.calls).toEqual(['manifest']);
    expect(store.manifests).toHaveLength(1);

    const manifest = store.manifests[0];
    expect(manifest?.tables).toHaveLength(1);
    expect(manifest?.views).toHaveLength(1);
    expect(manifest?.tables[0]?.rowCount).toBe(0);
    expect(manifest?.tables[0]?.file).toMatch(/^tables\/tbl_.*\.jsonl$/);
    expect(manifest?.layout).toMatchObject({ type: 'pane', activeViewId: manifest?.views[0]?.id });
    expect(core.store.getState().tables[manifest?.tables[0]?.id ?? '']?.rows).toEqual([]);
  });

  it('opens a table by creating one view, then reuses the same view', async () => {
    const { store, core } = setup();
    const created = await core.actions.createTable('Sensors');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const tableId = created.data.table.id;

    // Remove the view that `table.create` made, leaving a table with no tab.
    core.store.setState({ views: {}, layout: { type: 'pane', viewIds: [], activeViewId: null } });
    store.manifests.length = 0;
    store.calls.length = 0;

    const first = await core.actions.openTable(tableId);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.data.created).toBe(true);
    expect(Object.keys(core.store.getState().views)).toHaveLength(1);
    expect(store.calls.filter((call) => call === 'manifest')).toHaveLength(1);

    const second = await core.actions.openTable(tableId);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.data.created).toBe(false);
    expect(second.data.viewId).toBe(first.data.viewId);
    expect(Object.keys(core.store.getState().views)).toHaveLength(1);
    expect(store.calls.filter((call) => call === 'manifest')).toHaveLength(2);
  });

  it('deletes a table by writing the manifest before moving the file to .trash', async () => {
    const { store, core } = setup();
    const created = await core.actions.createTable('Sensors');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    store.calls.length = 0;

    const outcome = await core.actions.deleteTable(created.data.table.id);
    expect(outcome.ok).toBe(true);
    expect(store.calls).toEqual(['manifest', 'trash']);
    expect(store.trashed).toEqual([created.data.table.id]);
    expect(store.manifests.at(-1)?.tables).toEqual([]);
    expect(core.store.getState().tables).toEqual({});
    expect(core.store.getState().views).toEqual({});
  });

  it('persists view width updates through view.update', async () => {
    const { store, core } = setup();
    const created = await core.actions.createTable('Sensors');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const columnId = created.data.table.columns[0]?.id ?? '';
    store.manifests.length = 0;

    const outcome = await core.actions.updateView(created.data.view.id, {
      widths: { [columnId]: 260 },
      frozenColumnCount: 0,
    });
    expect(outcome.ok).toBe(true);
    const manifest = store.manifests.at(-1);
    expect(manifest?.views[0]?.tableView?.widths).toEqual({ [columnId]: 260 });
    expect(manifest?.views[0]?.tableView?.frozenColumnCount).toBe(0);
  });

  it('surfaces a manifest write failure without losing the in-memory change', async () => {
    const { store, core } = setup();
    store.failManifest = true;

    const outcome = await core.actions.createTable('Sensors');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_FS_WRITE');
    }
    expect(core.store.getState().ui.error?.code).toBe('E_FS_WRITE');
    // The document change stays in memory so the next explicit save can retry.
    expect(Object.keys(core.store.getState().tables)).toHaveLength(1);
  });

  it('closes the workspace and resets the document slices', async () => {
    const { store, core } = setup();
    expect((await core.actions.createTable('Sensors')).ok).toBe(true);

    const outcome = await core.actions.closeWorkspace();
    expect(outcome.ok).toBe(true);
    expect(store.closed).toEqual([workspaceState().id]);
    const state = core.store.getState();
    expect(state.workspace).toBeNull();
    expect(state.tables).toEqual({});
    expect(state.views).toEqual({});
    expect(state.layout).toEqual({ type: 'pane', viewIds: [], activeViewId: null });
    expect(state.ui.activeTableId).toBeNull();
  });
});
