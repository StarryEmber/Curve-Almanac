import { describe, expect, it } from 'vitest';

import type { TableMeta, WorkspaceManifest } from '@curve/domain';

import { MemoryWorkspaceStore } from './memory-workspace-store';

function table(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Table',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [{ id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' }],
    primaryKey: 'col_id',
    rowCount: 0,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}

function createStore(): { store: MemoryWorkspaceStore; now: () => Date } {
  let tick = Date.parse('2026-10-20T00:00:00.000Z');
  const now = (): Date => {
    const date = new Date(tick);
    tick += 1_000;
    return date;
  };
  return {
    store: new MemoryWorkspaceStore({
      appVersion: '0.1.0',
      now,
      uuid: () => 'fixed',
    }),
    now,
  };
}

async function createWithTable(): Promise<{
  store: MemoryWorkspaceStore;
  manifest: WorkspaceManifest;
  workspaceId: string;
}> {
  const { store } = createStore();
  const manifest = await store.create({ dir: '/tmp/parent', name: 'Demo' });
  const withTable: WorkspaceManifest = { ...manifest, tables: [table()] };
  await store.writeManifest({ workspaceId: manifest.id, manifest: withTable });
  return { store, manifest: withTable, workspaceId: manifest.id };
}

describe('MemoryWorkspaceStore', () => {
  it('creates a workspace at <dir>/<sanitized name>.cstudio and opens it', async () => {
    const { store } = createStore();

    const manifest = await store.create({ dir: '/tmp/parent', name: 'Demo' });
    expect(manifest.id).toBe('ws_fixed');
    expect(manifest.name).toBe('Demo');

    const opened = await store.open({ dir: '/tmp/parent/Demo.cstudio' });
    expect(opened).toEqual({ manifest, warnings: [] });
    await expect(store.open({ dir: '/tmp/unknown/Demo.cstudio' })).rejects.toMatchObject({
      code: 'E_WS_NOT_FOUND',
    });
  });

  it('rejects an unusable name and a duplicate workspace root', async () => {
    const { store } = createStore();
    await expect(store.create({ dir: '/tmp/parent', name: '...' })).rejects.toMatchObject({
      code: 'E_VALIDATION',
    });

    await store.create({ dir: '/tmp/parent', name: 'Demo' });
    await expect(store.create({ dir: '/tmp/parent', name: 'Demo' })).rejects.toMatchObject({
      code: 'E_WS_BUSY',
    });
  });

  it('reads and writes table JSONL, keeping three backups and restoring one', async () => {
    const { store, manifest, workspaceId } = await createWithTable();
    const tableId = 'tbl_1';
    const versions = ['v1', 'v2', 'v3', 'v4'];

    for (const version of versions) {
      await store.writeTable({ workspaceId, tableId, jsonl: `${version}\n` });
    }

    await expect(store.readTable({ workspaceId, tableId })).resolves.toEqual({
      jsonl: 'v4\n',
      bytes: 3,
    });
    const backups = await store.listBackups({ workspaceId, tableId });
    expect(backups).toHaveLength(3);
    expect(backups.map((entry) => entry.path)).toEqual([
      'backups/tbl_1.20261020T000003000Z.jsonl.bak',
      'backups/tbl_1.20261020T000002000Z.jsonl.bak',
      'backups/tbl_1.20261020T000001000Z.jsonl.bak',
    ]);

    const oldest = backups[2];
    expect(oldest).toBeDefined();
    await store.restore({
      workspaceId,
      tableId,
      backupPath: oldest?.path ?? '',
    });
    await expect(store.readTable({ workspaceId, tableId })).resolves.toMatchObject({
      jsonl: 'v1\n',
    });
    await expect(store.listBackups({ workspaceId, tableId })).resolves.toHaveLength(3);

    expect(manifest.id).toBe(workspaceId);
  });

  it('rejects path escapes and missing backups', async () => {
    const { store, workspaceId } = await createWithTable();
    const tableId = 'tbl_1';

    await expect(
      store.writeTable({ workspaceId, tableId: '../manifest.json', jsonl: '' }),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });
    await expect(
      store.restore({ workspaceId, tableId, backupPath: '../manifest.json' }),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });
    await expect(
      store.restore({
        workspaceId,
        tableId,
        backupPath: 'backups/manifest.20261020T000000000Z.json.bak',
      }),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });
    await expect(
      store.restore({
        workspaceId,
        tableId,
        backupPath: 'backups/tbl_1.20261020T000000000Z.jsonl.bak',
      }),
    ).rejects.toMatchObject({ code: 'E_BACKUP_NOT_FOUND' });
  });

  it('moves a table file to the trash without touching the manifest', async () => {
    const { store, workspaceId } = await createWithTable();
    const tableId = 'tbl_1';
    await store.writeTable({ workspaceId, tableId, jsonl: 'v1\n' });

    await expect(store.trash({ workspaceId, tableId })).resolves.toEqual({ ok: true });
    await expect(store.readTable({ workspaceId, tableId })).resolves.toEqual({
      jsonl: '',
      bytes: 0,
    });
    const opened = await store.open({ dir: '/tmp/parent/Demo.cstudio' });
    expect(opened.manifest.tables).toHaveLength(1);
  });

  it('treats a missing table as empty only while the hint is zero (ADR-022)', async () => {
    const { store, workspaceId } = await createWithTable();

    await expect(store.readTable({ workspaceId, tableId: 'tbl_1' })).resolves.toEqual({
      jsonl: '',
      bytes: 0,
    });

    const opened = await store.open({ dir: '/tmp/parent/Demo.cstudio' });
    await store.writeManifest({
      workspaceId,
      manifest: { ...opened.manifest, tables: [table({ rowCount: 2 })] },
    });

    await expect(store.readTable({ workspaceId, tableId: 'tbl_1' })).rejects.toMatchObject({
      code: 'E_TABLE_NOT_FOUND',
    });
  });

  it('rejects an invalid manifest write', async () => {
    const { store, manifest, workspaceId } = await createWithTable();

    await expect(
      store.writeManifest({
        workspaceId,
        manifest: { ...manifest, id: 'ws_other' },
      }),
    ).rejects.toMatchObject({ code: 'E_WS_INVALID_MANIFEST' });
  });

  it('closes idempotently', async () => {
    const { store, workspaceId } = await createWithTable();
    await expect(store.close({ workspaceId })).resolves.toEqual({ ok: true });
    await expect(store.close({ workspaceId })).resolves.toEqual({ ok: true });
  });
});
