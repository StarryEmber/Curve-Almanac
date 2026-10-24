import { describe, expect, it } from 'vitest';

import { createAppError, createTableStyle } from '@curve/domain';
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
  readonly writtenTables: Array<{ tableId: string; jsonl: string }> = [];
  readonly trashed: string[] = [];
  readonly closed: string[] = [];
  failManifest = false;
  failTable = false;

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
  async writeTable(request: WriteTableRequest): Promise<WriteTableResult> {
    this.calls.push('writeTable');
    if (this.failTable) {
      throw createAppError('E_FS_WRITE', 'disk full');
    }
    this.writtenTables.push({ tableId: request.tableId, jsonl: request.jsonl });
    return { bytes: request.jsonl.length };
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

  it('updates a cell, persists the table and manifest, and clears the dirty marker', async () => {
    const { store, core } = setup();
    const created = await core.actions.createTable('Sensors');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const tableId = created.data.table.id;
    const columnId = created.data.table.columns[0]?.id ?? '';
    core.store.setState({
      tables: {
        [tableId]: {
          table: { ...created.data.table, rowCount: 2 },
          rows: [
            { id: 'row_1', values: ['alpha'] },
            { id: 'row_2', values: ['beta'] },
          ],
        },
      },
    });
    store.calls.length = 0;
    store.manifests.length = 0;
    store.writtenTables.length = 0;

    const outcome = await core.actions.updateCell(tableId, 'row_2', columnId, 'gamma');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.changed).toBe(true);
      expect(outcome.data.value).toBe('gamma');
    }
    expect((await core.actions.flushSaves()).ok).toBe(true);

    expect(store.calls).toEqual(['writeTable', 'manifest']);
    expect(store.writtenTables[0]?.jsonl).toContain('"v":["gamma"]');
    expect(store.manifests.at(-1)?.tables[0]?.updatedAt).toBe(NOW.toISOString());
    expect(core.store.getState().ui.dirtyTables).toEqual([]);
    expect(core.store.getState().ui.editIssue).toBeNull();
  });

  it('does not dispatch or save when the submitted value is unchanged', async () => {
    const { store, core } = setup();
    const created = await core.actions.createTable('Sensors');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const tableId = created.data.table.id;
    const columnId = created.data.table.columns[0]?.id ?? '';
    core.store.setState({
      tables: {
        [tableId]: {
          table: { ...created.data.table, rowCount: 1 },
          rows: [{ id: 'row_1', values: ['alpha'] }],
        },
      },
    });
    store.calls.length = 0;

    const outcome = await core.actions.updateCell(tableId, 'row_1', columnId, 'alpha');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.changed).toBe(false);
    }
    expect(store.calls).toEqual([]);
    expect(core.history.canUndo()).toBe(false);
    expect(core.store.getState().ui.dirtyTables).toEqual([]);
  });

  it('rejects an invalid or duplicate cell without writing or changing the document', async () => {
    const { store, core } = setup();
    const created = await core.actions.createTable('Sensors');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const tableId = created.data.table.id;
    const columnId = created.data.table.columns[0]?.id ?? '';
    core.store.setState({
      tables: {
        [tableId]: {
          table: { ...created.data.table, rowCount: 2 },
          rows: [
            { id: 'row_1', values: ['alpha'] },
            { id: 'row_2', values: ['beta'] },
          ],
        },
      },
    });
    store.calls.length = 0;

    const outcome = await core.actions.updateCell(tableId, 'row_2', columnId, 'alpha');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issue?.reason).toBe('duplicate-key');
      expect(outcome.issue?.conflictRowNumber).toBe(1);
    }
    expect(core.store.getState().ui.editIssue?.reason).toBe('duplicate-key');
    expect(core.store.getState().tables[tableId]?.rows[1]?.values[0]).toBe('beta');
    expect(store.calls).toEqual([]);
    expect(core.store.getState().ui.dirtyTables).toEqual([]);
  });

  it('undoes and redoes a cell edit, persisting the restored document', async () => {
    const { store, core } = setup();
    const created = await core.actions.createTable('Sensors');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const tableId = created.data.table.id;
    const columnId = created.data.table.columns[0]?.id ?? '';
    core.store.setState({
      tables: {
        [tableId]: {
          table: { ...created.data.table, rowCount: 1 },
          rows: [{ id: 'row_1', values: ['alpha'] }],
        },
      },
    });

    await core.actions.updateCell(tableId, 'row_1', columnId, 'gamma');
    expect((await core.actions.flushSaves()).ok).toBe(true);
    expect(core.history.canUndo()).toBe(true);
    store.calls.length = 0;
    store.writtenTables.length = 0;

    const undone = await core.actions.undo();
    expect(undone.ok).toBe(true);
    expect(core.store.getState().tables[tableId]?.rows[0]?.values[0]).toBe('alpha');
    expect((await core.actions.flushSaves()).ok).toBe(true);
    expect(store.writtenTables.at(-1)?.jsonl).toContain('"v":["alpha"]');

    const redone = await core.actions.redo();
    expect(redone.ok).toBe(true);
    expect(core.store.getState().tables[tableId]?.rows[0]?.values[0]).toBe('gamma');
    expect((await core.actions.flushSaves()).ok).toBe(true);
    expect(store.writtenTables.at(-1)?.jsonl).toContain('"v":["gamma"]');
  });

  it('keeps the workspace open when the close flush fails and succeeds after retry', async () => {
    const { store, core } = setup();
    const created = await core.actions.createTable('Sensors');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const tableId = created.data.table.id;
    const columnId = created.data.table.columns[0]?.id ?? '';
    core.store.setState({
      tables: {
        [tableId]: {
          table: { ...created.data.table, rowCount: 1 },
          rows: [{ id: 'row_1', values: ['alpha'] }],
        },
      },
    });

    store.failTable = true;
    await core.actions.updateCell(tableId, 'row_1', columnId, 'gamma');
    const failed = await core.actions.closeWorkspace();
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error.code).toBe('E_FS_WRITE');
    }
    expect(core.store.getState().workspace).not.toBeNull();
    expect(core.store.getState().ui.save.status).toBe('error');

    store.failTable = false;
    expect((await core.actions.retrySave()).ok).toBe(true);
    expect((await core.actions.flushSaves()).ok).toBe(true);
    expect((await core.actions.closeWorkspace()).ok).toBe(true);
    expect(core.store.getState().workspace).toBeNull();
  });

  it('duplicates a table view with its filter/sort state and persists both', async () => {
    const { store, core } = setup();
    const created = await core.actions.createTable('Sensors');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const viewId = created.data.view.id;
    const columnId = created.data.table.columns[0]?.id ?? '';

    const updated = await core.actions.updateView(viewId, {
      sort: [{ columnId, direction: 'desc' }],
      filter: { kind: 'compare', columnId, op: 'contains', value: 'a' },
      hiddenColumnIds: [columnId],
    });
    expect(updated.ok).toBe(true);

    const duplicated = await core.actions.duplicateView(viewId);
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) {
      return;
    }
    const state = core.store.getState();
    expect(Object.keys(state.views)).toHaveLength(2);
    const copy = state.views[duplicated.data.viewId];
    expect(copy?.title).toBe('Sensors (2)');
    expect(copy?.tableView?.filter).toEqual({
      kind: 'compare',
      columnId,
      op: 'contains',
      value: 'a',
    });
    expect(copy?.tableView?.sort).toEqual([{ columnId, direction: 'desc' }]);
    expect(store.manifests.at(-1)?.views).toHaveLength(2);

    const second = await core.actions.duplicateView(viewId);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(core.store.getState().views[second.data.viewId]?.title).toBe('Sensors (3)');
    }
  });

  it('updates a user style, persists it and undoes through the manifest queue', async () => {
    const { store, core } = setup();
    const style = createTableStyle({ id: 'sty_test', name: 'Original' });
    core.store.setState({ tableStyles: { [style.id]: style } });

    const updated = await core.actions.updateTableStyle({ ...style, name: 'Updated' });
    expect(updated.ok).toBe(true);
    expect(core.store.getState().tableStyles['sty_test']?.name).toBe('Updated');
    expect(store.manifests.at(-1)?.tableStyles[0]?.name).toBe('Updated');

    const undone = await core.actions.undo();
    expect(undone.ok).toBe(true);
    expect(core.store.getState().tableStyles['sty_test']?.name).toBe('Original');
    await core.actions.flushSaves();
    expect(store.manifests.at(-1)?.tableStyles[0]?.name).toBe('Original');
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
