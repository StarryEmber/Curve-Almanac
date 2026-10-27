import { describe, expect, it, vi } from 'vitest';

import type { ColumnDef, TableMeta, ViewDef } from '@curve/domain';
import { MemoryWorkspaceStore } from '@curve/persistence';

import { createAppCore } from '../app-core';

import type { AppCore } from '../app-core';
import type { ImportArchiveRequest } from './workspace-actions';
import type { AppState } from '../state/types';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

const TABLE: TableMeta = {
  id: 'tbl_import_action',
  name: 'Import',
  file: 'tables/tbl_import_action.jsonl',
  schemaVersion: 1,
  columns: [
    column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true }),
    column({ id: 'col_name', key: 'name', label: 'Name', type: 'text' }),
    column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number' }),
  ],
  primaryKey: 'col_id',
  rowCount: 1,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const VIEW: ViewDef = {
  id: 'viw_import_action',
  kind: 'table',
  refId: TABLE.id,
  title: 'Import',
  tableView: {
    tableId: TABLE.id,
    styleId: 'builtin.report-light',
    columnOrder: TABLE.columns.map((entry) => entry.id),
    widths: {},
    hiddenColumnIds: [],
    sort: [],
    frozenColumnCount: 0,
  },
};

async function setup(): Promise<{
  core: AppCore;
  memory: MemoryWorkspaceStore;
  workspaceId: string;
  archive: ReturnType<typeof vi.fn>;
}> {
  const memory = new MemoryWorkspaceStore({ appVersion: '0.1.0' });
  const manifest = await memory.create({ dir: '/tmp/import-action', name: 'Import Action' });
  const seeded = {
    ...manifest,
    tables: [TABLE],
    views: [VIEW],
    layout: { type: 'pane' as const, viewIds: [VIEW.id], activeViewId: VIEW.id },
  };
  await memory.writeManifest({ workspaceId: manifest.id, manifest: seeded });
  const archive = vi.fn(async (request: ImportArchiveRequest) => ({
    copied: true,
    archivePath: `imports/${request.tableId}.csv`,
    sidecarPath: `imports/${request.tableId}.json`,
  }));
  const core = createAppCore({
    workspaceStore: memory,
    now: () => new Date(TIMESTAMP),
    archiveImport: archive,
  });

  const state: Partial<AppState> = {
    workspace: {
      formatVersion: 1,
      id: manifest.id,
      name: manifest.name,
      root: '/tmp/import-action/Import Action.cstudio',
      appVersion: '0.1.0',
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      settings: manifest.settings,
      warnings: [],
    },
    tables: { [TABLE.id]: { table: TABLE, rows: [{ id: 'row_old', values: ['old', 'Old', 1] }] } },
    views: { [VIEW.id]: VIEW },
    layout: { type: 'pane', viewIds: [VIEW.id], activeViewId: VIEW.id },
    ui: {
      activeTableId: TABLE.id,
      activeViewId: VIEW.id,
      activePanePath: 'root',
      error: null,
      dirtyTables: [],
      save: { status: 'idle', pending: 0, error: null },
      editIssue: null,
    },
  };
  core.store.setState(state);
  return { core, memory, workspaceId: manifest.id, archive };
}

function source() {
  return {
    token: 'tok_1',
    name: 'data.csv',
    sha256: 'a'.repeat(64),
    size: 42,
    encoding: 'gb18030',
    format: 'csv' as const,
  };
}

describe('WorkspaceActions.applyImport', () => {
  it('archives the source, applies the command and persists table then manifest', async () => {
    const { core, memory, workspaceId, archive } = await setup();
    const result = await core.actions.applyImport({
      tableId: TABLE.id,
      mode: 'append',
      rows: [{ id: 'row_new', values: ['a', 'A', 2] }],
      source: source(),
    });

    expect(result).toMatchObject({
      ok: true,
      data: { copied: true, archivePath: 'imports/tbl_import_action.csv' },
    });
    expect(archive).toHaveBeenCalledWith({
      workspaceId,
      tableId: TABLE.id,
      mode: 'append',
      ...source(),
    });
    expect(core.store.getState().tables[TABLE.id]?.rows).toHaveLength(2);
    expect(core.history.canUndo()).toBe(true);

    const written = await memory.readTable({ workspaceId, tableId: TABLE.id });
    expect(written.jsonl).toContain('"row_new"');
    const storedManifest = await memory.open({
      dir: '/tmp/import-action/Import Action.cstudio',
    });
    expect(storedManifest.manifest.tables[0]?.rowCount).toBe(2);
  });

  it('does not dispatch when archiving fails', async () => {
    const { core, archive } = await setup();
    archive.mockRejectedValueOnce(new Error('disk full'));

    const result = await core.actions.applyImport({
      tableId: TABLE.id,
      mode: 'append',
      rows: [{ id: 'row_new', values: ['a', 'A', 2] }],
      source: source(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'E_UNKNOWN' } });
    expect(core.store.getState().tables[TABLE.id]?.rows).toHaveLength(1);
    expect(core.history.canUndo()).toBe(false);
  });

  it('rejects an unknown table before archiving', async () => {
    const { core, archive } = await setup();

    const result = await core.actions.applyImport({
      tableId: 'tbl_missing',
      mode: 'append',
      rows: [{ id: 'row_new', values: ['a', 'A', 2] }],
      source: source(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'E_TABLE_NOT_FOUND' } });
    expect(archive).not.toHaveBeenCalled();
  });
});
