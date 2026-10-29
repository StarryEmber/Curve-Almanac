import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TableMeta, WorkspaceManifest } from '@curve/domain';
import { formatBackupTimestamp } from '@curve/persistence';
import { MAX_ROWS_PER_TABLE } from '@curve/table-engine';

import { atomicWrite } from './atomic-write';
import { FileWorkspaceStore } from './file-workspace-store';

import type { FileWorkspaceStoreOptions } from './file-workspace-store';
import type { AppSettings } from '../../shared/contracts/settings';

const APP_SETTINGS: AppSettings = {
  version: 1,
  theme: 'system',
  locale: 'zh-CN',
  autosave: true,
  defaultTableStyleId: 'builtin.report-light',
};

const TEMP_DIRECTORIES: string[] = [];

function makeTemp(): string {
  const directory = mkdtempSync(join(tmpdir(), 'curve-store-'));
  TEMP_DIRECTORIES.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of TEMP_DIRECTORIES.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface Harness {
  store: FileWorkspaceStore;
  temp: string;
  logger: { warn: ReturnType<typeof vi.fn> };
}

function createHarness(overrides: Partial<FileWorkspaceStoreOptions> = {}): Harness {
  const temp = makeTemp();
  let tick = Date.parse('2026-10-20T00:00:00.000Z');
  let uuid = 0;
  const logger = { warn: vi.fn() };
  const store = new FileWorkspaceStore({
    userDataPath: join(temp, 'userData'),
    appVersion: '0.1.0',
    now: () => {
      const value = new Date(tick);
      tick += 1_000;
      return value;
    },
    uuid: () => `fixed-${++uuid}`,
    logger,
    ...overrides,
  });
  return { store, temp, logger };
}

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

async function addTable(
  store: FileWorkspaceStore,
  manifest: WorkspaceManifest,
  overrides: Partial<TableMeta> = {},
): Promise<WorkspaceManifest> {
  const next: WorkspaceManifest = { ...manifest, tables: [...manifest.tables, table(overrides)] };
  await store.writeManifest({ workspaceId: manifest.id, manifest: next });
  return next;
}

function workspacePath(harness: Harness): { parent: string; root: string } {
  const parent = join(harness.temp, 'parent');
  mkdirSync(parent, { recursive: true });
  return { parent, root: join(parent, 'Demo.cstudio') };
}

describe('FileWorkspaceStore.create', () => {
  it('creates the SPEC §7.1 layout, manifest, lock and recent entry', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);

    const manifest = await harness.store.create({ dir: parent, name: 'Demo' });

    expect(manifest.name).toBe('Demo');
    expect(manifest.id).toMatch(/^ws_/);
    expect(existsSync(join(root, 'manifest.json'))).toBe(true);
    for (const directory of ['tables', 'backups', 'imports', '.trash']) {
      expect(existsSync(join(root, directory))).toBe(true);
    }
    expect(existsSync(join(root, '.lock'))).toBe(true);
    expect(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))).toEqual(manifest);

    const recent = await harness.store.listRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ path: root, name: 'Demo' });

    await expect(harness.store.close({ workspaceId: manifest.id })).resolves.toEqual({ ok: true });
    expect(existsSync(join(root, '.lock'))).toBe(false);
  });

  it('seeds a new workspace with the application preferences (T5.5)', async () => {
    const harness = createHarness({
      appSettings: () => ({
        ...APP_SETTINGS,
        theme: 'dark',
        locale: 'en-US',
        autosave: false,
        defaultTableStyleId: 'builtin.finance',
      }),
    });
    const { parent } = workspacePath(harness);

    const manifest = await harness.store.create({ dir: parent, name: 'Demo' });

    expect(manifest.settings).toEqual({
      theme: 'dark',
      locale: 'en-US',
      autosave: false,
      defaultTableStyleId: 'builtin.finance',
    });
  });

  it('rejects a duplicate root and an unusable name without leaving a root behind', async () => {
    const harness = createHarness();
    const { parent } = workspacePath(harness);

    await harness.store.create({ dir: parent, name: 'Demo' });
    await expect(harness.store.create({ dir: parent, name: 'Demo' })).rejects.toMatchObject({
      code: 'E_WS_BUSY',
    });
    await expect(harness.store.create({ dir: parent, name: '...' })).rejects.toMatchObject({
      code: 'E_VALIDATION',
    });
    expect(existsSync(join(parent, '...cstudio'))).toBe(false);
  });

  it('sanitizes the folder name while keeping the display name', async () => {
    const harness = createHarness();
    const { parent } = workspacePath(harness);

    const manifest = await harness.store.create({ dir: join(parent, 'nested'), name: 'a/b' });

    expect(manifest.name).toBe('a/b');
    expect(existsSync(join(parent, 'nested', 'a-b.cstudio'))).toBe(true);
  });
});

describe('FileWorkspaceStore.open', () => {
  it('opens a valid workspace, reports no warnings and unlocks on close', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await harness.store.close({ workspaceId: created.id });

    const opened = await harness.store.open({ dir: root });
    expect(opened.manifest).toEqual(created);
    expect(opened.warnings).toEqual([]);

    await harness.store.close({ workspaceId: created.id });
    expect(existsSync(join(root, '.lock'))).toBe(false);
  });

  it('returns E_WS_INVALID_MANIFEST for a corrupt manifest and leaves the file untouched', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await harness.store.close({ workspaceId: created.id });

    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, '{"formatVersion":1,"broken":');
    const before = readFileSync(manifestPath);

    await expect(harness.store.open({ dir: root })).rejects.toMatchObject({
      code: 'E_WS_INVALID_MANIFEST',
    });
    expect(readFileSync(manifestPath)).toEqual(before);
    expect(existsSync(join(root, '.lock'))).toBe(false);
  });

  it('rejects a future formatVersion before schema validation', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await harness.store.close({ workspaceId: created.id });

    const manifestPath = join(root, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, formatVersion: 2 }));
    const before = readFileSync(manifestPath);

    await expect(harness.store.open({ dir: root })).rejects.toMatchObject({
      code: 'E_WS_VERSION_UNSUPPORTED',
    });
    expect(readFileSync(manifestPath)).toEqual(before);
  });

  it('replaces a stale lock with a warning and refuses an active lock', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await harness.store.close({ workspaceId: created.id });
    const lockPath = join(root, '.lock');

    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date('2026-10-18T00:00:00.000Z').toISOString(),
        appVersion: '0.1.0',
      }),
    );
    const opened = await harness.store.open({ dir: root });
    expect(opened.warnings).toHaveLength(1);
    expect(opened.warnings[0]).toContain('stale lock');
    await harness.store.close({ workspaceId: created.id });

    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        startedAt: '2026-10-20T00:00:00.000Z',
        appVersion: '0.1.0',
      }),
    );
    await expect(harness.store.open({ dir: root })).rejects.toMatchObject({
      code: 'E_WS_LOCKED',
    });
    rmSync(lockPath, { force: true });
  });

  it('warns about a missing table file instead of failing the open', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await addTable(harness.store, created);
    await harness.store.close({ workspaceId: created.id });

    const opened = await harness.store.open({ dir: root });
    expect(opened.warnings.some((warning) => warning.includes('missing'))).toBe(true);
    await harness.store.close({ workspaceId: created.id });
  });

  it('inspects lock/manifest/backups without writing anything (T5.3)', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    const next = await addTable(harness.store, created);
    await harness.store.writeManifest({ workspaceId: created.id, manifest: next });
    await harness.store.close({ workspaceId: created.id });

    const lockPath = join(root, '.lock');
    const manifestPath = join(root, 'manifest.json');
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        pid: 999_999,
        startedAt: '2020-01-01T00:00:00.000Z',
        appVersion: '0.1.0',
      })}\n`,
    );
    const lockBefore = readFileSync(lockPath);
    const manifestBefore = readFileSync(manifestPath);

    const inspection = await harness.store.inspect({ dir: root });

    expect(inspection).toMatchObject({
      name: 'Demo',
      lock: 'stale',
      manifest: 'ok',
    });
    expect(inspection.dir.toLowerCase()).toContain('demo.cstudio');
    expect(inspection.backups.length).toBeGreaterThan(0);
    expect(inspection.backups[0]?.path).toMatch(/^backups\/manifest\..*\.json\.bak$/);
    expect(readFileSync(lockPath)).toEqual(lockBefore);
    expect(readFileSync(manifestPath)).toEqual(manifestBefore);
  });

  it('rebuilds a corrupt manifest from the selected backup and keeps the rows (T5.3)', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    const withTable = await addTable(harness.store, created);
    const jsonl = '{"id":"row_1","v":["a"]}\n';
    await harness.store.writeTable({ workspaceId: created.id, tableId: 'tbl_1', jsonl });
    await harness.store.writeManifest({ workspaceId: created.id, manifest: withTable });
    await harness.store.close({ workspaceId: created.id });

    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, '{"formatVersion":1,"tables":[');
    const corrupt = readFileSync(manifestPath);

    const inspection = await harness.store.inspect({ dir: root });
    expect(inspection.manifest).toBe('invalid');
    expect(inspection.errorCode).toBe('E_WS_INVALID_MANIFEST');
    const backup = inspection.backups[0];
    expect(backup).toBeDefined();
    if (backup === undefined) {
      return;
    }

    // Refusing recovery leaves every byte alone (ADR-026).
    await expect(harness.store.open({ dir: root })).rejects.toMatchObject({
      code: 'E_WS_INVALID_MANIFEST',
    });
    expect(readFileSync(manifestPath)).toEqual(corrupt);
    expect(existsSync(join(root, '.lock'))).toBe(false);

    const opened = await harness.store.open({
      dir: root,
      recovery: { manifestBackup: backup.path },
    });
    expect(opened.manifest.tables.map((entry) => entry.id)).toEqual(['tbl_1']);
    expect(opened.warnings.join('\n')).toContain('rebuilt from');
    const read = await harness.store.readTable({
      workspaceId: opened.manifest.id,
      tableId: 'tbl_1',
    });
    expect(read.jsonl).toBe(jsonl);
    // The corrupt manifest itself was preserved as a backup before the rebuild.
    expect(readdirSync(join(root, 'backups')).length).toBeGreaterThan(inspection.backups.length);
    await harness.store.close({ workspaceId: opened.manifest.id });
  });

  it('uses the newest backup when "try recovery" follows an unclean exit (T5.3)', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    const withTable = await addTable(harness.store, created);
    await harness.store.writeManifest({ workspaceId: created.id, manifest: withTable });
    await harness.store.close({ workspaceId: created.id });

    writeFileSync(join(root, 'manifest.json'), '{not json');
    writeFileSync(
      join(root, '.lock'),
      `${JSON.stringify({
        pid: 999_999,
        startedAt: '2020-01-01T00:00:00.000Z',
        appVersion: '0.1.0',
      })}\n`,
    );

    const opened = await harness.store.open({ dir: root, recovery: { acceptStaleLock: true } });
    expect(opened.manifest.tables.map((entry) => entry.id)).toEqual(['tbl_1']);
    expect(opened.warnings.join('\n')).toContain('rebuilt from');
    expect(opened.warnings.join('\n')).toContain('stale lock');
    await harness.store.close({ workspaceId: opened.manifest.id });
  });

  it('rejects an unknown or foreign manifest backup without touching the files (T5.3)', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await harness.store.close({ workspaceId: created.id });

    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, '{"formatVersion":1,"tables":[');
    const before = readFileSync(manifestPath);

    await expect(
      harness.store.open({
        dir: root,
        recovery: { manifestBackup: 'backups/manifest.20260101T000000000Z.json.bak' },
      }),
    ).rejects.toMatchObject({ code: 'E_BACKUP_NOT_FOUND' });
    await expect(
      harness.store.open({ dir: root, recovery: { manifestBackup: '../manifest.json' } }),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });

    expect(readFileSync(manifestPath)).toEqual(before);
    expect(existsSync(join(root, '.lock'))).toBe(false);
  });
});

describe('FileWorkspaceStore tables and backups', () => {
  it('writes, reads, backs up three versions and restores a backup', async () => {
    const harness = createHarness();
    const { parent } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await addTable(harness.store, created);

    for (const version of ['v1', 'v2', 'v3', 'v4']) {
      await harness.store.writeTable({
        workspaceId: created.id,
        tableId: 'tbl_1',
        jsonl: `${version}\n`,
      });
    }

    await expect(
      harness.store.readTable({ workspaceId: created.id, tableId: 'tbl_1' }),
    ).resolves.toEqual({
      jsonl: 'v4\n',
      bytes: 3,
    });
    const backups = await harness.store.listBackups({
      workspaceId: created.id,
      tableId: 'tbl_1',
    });
    expect(backups).toHaveLength(3);
    for (const backup of backups) {
      expect(backup.path).toMatch(/^backups\/tbl_1\.\d{8}T\d{9}Z\.jsonl\.bak$/);
      expect(backup.bytes).toBeGreaterThan(0);
    }

    const oldest = backups[2];
    expect(oldest).toBeDefined();
    await harness.store.restore({
      workspaceId: created.id,
      tableId: 'tbl_1',
      backupPath: oldest?.path ?? '',
    });
    await expect(
      harness.store.readTable({ workspaceId: created.id, tableId: 'tbl_1' }),
    ).resolves.toMatchObject({
      jsonl: 'v1\n',
    });
  });

  it('recreates a missing backups directory instead of failing the save', async () => {
    // Regression: a workspace copied from another machine (or a bench fixture
    // generated elsewhere) may not contain `backups/`. Every manifest/table
    // save used to fail with E_FS_WRITE/ENOENT because the backup copy did not
    // create the directory.
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await harness.store.close({ workspaceId: created.id });
    rmSync(join(root, 'backups'), { recursive: true, force: true });

    const opened = await harness.store.open({ dir: root });
    const withTable = await addTable(harness.store, opened.manifest);
    rmSync(join(root, 'backups'), { recursive: true, force: true });

    const saved = await harness.store.writeManifest({
      workspaceId: withTable.id,
      manifest: { ...withTable, updatedAt: '2026-10-21T00:00:00.000Z' },
    });
    expect(saved).toEqual({ ok: true });
    expect(existsSync(join(root, 'backups'))).toBe(true);
    expect(
      (JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest)
        .updatedAt,
    ).toBe('2026-10-21T00:00:00.000Z');

    // A table save goes through the same backup helper.
    await expect(
      harness.store.writeTable({ workspaceId: created.id, tableId: 'tbl_1', jsonl: 'v1\n' }),
    ).resolves.toEqual({ bytes: 3 });
    await expect(
      harness.store.writeTable({ workspaceId: created.id, tableId: 'tbl_1', jsonl: 'v2\n' }),
    ).resolves.toEqual({ bytes: 3 });
    expect(readdirSync(join(root, 'backups')).length).toBeGreaterThan(0);
    await expect(harness.store.close({ workspaceId: created.id })).resolves.toEqual({ ok: true });
  });

  it('rejects path escapes and invalid table ids', async () => {
    const harness = createHarness();
    const { parent } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await addTable(harness.store, created);
    await harness.store.writeTable({ workspaceId: created.id, tableId: 'tbl_1', jsonl: 'v1\n' });

    await expect(
      harness.store.writeTable({
        workspaceId: created.id,
        tableId: '../manifest.json',
        jsonl: '',
      }),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });
    await expect(
      harness.store.restore({
        workspaceId: created.id,
        tableId: 'tbl_1',
        backupPath: '../manifest.json',
      }),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });
  });

  it('keeps the old file when a write is interrupted', async () => {
    let failNextTableWrite = false;
    const harness = createHarness({
      writeFile: async (file, data) => {
        if (failNextTableWrite && file.endsWith('tbl_1.jsonl')) {
          writeFileSync(`${file}.partial`, data);
          throw Object.assign(new Error('simulated crash'), { code: 'EIO' });
        }
        await atomicWrite(file, data);
      },
    });
    const { parent } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await addTable(harness.store, created);
    await harness.store.writeTable({ workspaceId: created.id, tableId: 'tbl_1', jsonl: 'v1\n' });

    failNextTableWrite = true;
    await expect(
      harness.store.writeTable({ workspaceId: created.id, tableId: 'tbl_1', jsonl: 'v2\n' }),
    ).rejects.toMatchObject({ code: 'E_FS_WRITE' });
    await expect(
      harness.store.readTable({ workspaceId: created.id, tableId: 'tbl_1' }),
    ).resolves.toEqual({
      jsonl: 'v1\n',
      bytes: 3,
    });
  });

  it('moves a table file to .trash and is idempotent', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await addTable(harness.store, created);
    await harness.store.writeTable({ workspaceId: created.id, tableId: 'tbl_1', jsonl: 'v1\n' });

    await expect(
      harness.store.trash({ workspaceId: created.id, tableId: 'tbl_1' }),
    ).resolves.toEqual({ ok: true });
    expect(existsSync(join(root, 'tables', 'tbl_1.jsonl'))).toBe(false);
    await expect(
      harness.store.trash({ workspaceId: created.id, tableId: 'tbl_1' }),
    ).resolves.toEqual({ ok: true });
  });

  it('moves a file after the manifest no longer lists the table (T2.1 delete order)', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    const withTable = await addTable(harness.store, created);
    await harness.store.writeTable({ workspaceId: created.id, tableId: 'tbl_1', jsonl: 'v1\n' });

    // `deleteTable` writes the manifest first, then calls `table:trash`.
    await harness.store.writeManifest({
      workspaceId: created.id,
      manifest: { ...withTable, tables: [] },
    });
    await expect(
      harness.store.trash({ workspaceId: created.id, tableId: 'tbl_1' }),
    ).resolves.toEqual({ ok: true });

    expect(existsSync(join(root, 'tables', 'tbl_1.jsonl'))).toBe(false);
    const trashed = readdirSync(join(root, '.trash'));
    expect(trashed.some((name) => name.startsWith('tbl_1.'))).toBe(true);
  });

  it('treats a missing file as empty only while the rowCount hint is zero (ADR-022)', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await addTable(harness.store, created);

    // A table the manifest describes as empty has never been written.
    await expect(
      harness.store.readTable({ workspaceId: created.id, tableId: 'tbl_1' }),
    ).resolves.toEqual({ jsonl: '', bytes: 0 });

    await harness.store.writeTable({
      workspaceId: created.id,
      tableId: 'tbl_1',
      jsonl: 'v1\n',
    });
    await harness.store.close({ workspaceId: created.id });

    // SPEC §7.5: opening repairs the hint and says so.
    const reopened = await harness.store.open({ dir: root });
    expect(reopened.manifest.tables[0]?.rowCount).toBe(1);
    expect(reopened.warnings.join('\n')).toContain('row count');
    const persisted = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as {
      tables: { rowCount: number }[];
    };
    expect(persisted.tables[0]?.rowCount).toBe(1);

    await harness.store.trash({ workspaceId: reopened.manifest.id, tableId: 'tbl_1' });
    await expect(
      harness.store.readTable({ workspaceId: reopened.manifest.id, tableId: 'tbl_1' }),
    ).rejects.toMatchObject({ code: 'E_TABLE_NOT_FOUND' });

    await harness.store.close({ workspaceId: reopened.manifest.id });
  });

  it('rejects a table write above the 200k row cap with E_TABLE_LIMIT', async () => {
    const harness = createHarness();
    const { parent } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await addTable(harness.store, created);

    const jsonl = `${Array.from(
      { length: MAX_ROWS_PER_TABLE + 1 },
      (_, index) => `{"id":"row_${index}","v":["x"]}`,
    ).join('\n')}\n`;

    await expect(
      harness.store.writeTable({ workspaceId: created.id, tableId: 'tbl_1', jsonl }),
    ).rejects.toMatchObject({ code: 'E_TABLE_LIMIT' });
    // The rejected write must not leave a file behind.
    await expect(
      harness.store.readTable({ workspaceId: created.id, tableId: 'tbl_1' }),
    ).resolves.toEqual({ jsonl: '', bytes: 0 });
  });

  it('rejects an invalid manifest without overwriting the old one', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    const withTable = await addTable(harness.store, created);
    const manifestPath = join(root, 'manifest.json');
    const before = readFileSync(manifestPath);

    const invalid: WorkspaceManifest = {
      ...withTable,
      tables: [table({ file: 'tables/other.jsonl' })],
    };
    await expect(
      harness.store.writeManifest({ workspaceId: created.id, manifest: invalid }),
    ).rejects.toMatchObject({ code: 'E_WS_INVALID_MANIFEST' });
    expect(readFileSync(manifestPath)).toEqual(before);
  });

  it('prunes backups older than seven days on open', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await harness.store.close({ workspaceId: created.id });

    const oldTimestamp = formatBackupTimestamp(new Date('2026-10-01T00:00:00.000Z'));
    const oldBackup = join(root, 'backups', `manifest.${oldTimestamp}.json.bak`);
    writeFileSync(oldBackup, '{}');

    await harness.store.open({ dir: root });
    expect(existsSync(oldBackup)).toBe(false);
    await harness.store.close({ workspaceId: created.id });
  });

  it('closes an unknown workspace idempotently', async () => {
    const harness = createHarness();
    await expect(harness.store.close({ workspaceId: 'ws_unknown' })).resolves.toEqual({ ok: true });
  });

  it('archives an import source with a hash sidecar and rejects changed bytes', async () => {
    const harness = createHarness();
    const { parent, root } = workspacePath(harness);
    const created = await harness.store.create({ dir: parent, name: 'Demo' });
    await addTable(harness.store, created);

    const sourcePath = join(harness.temp, 'gbk.csv');
    const bytes = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0x0a]);
    writeFileSync(sourcePath, bytes);
    const actualHash = createHash('sha256').update(bytes).digest('hex');

    const result = await harness.store.archiveImport({
      workspaceId: created.id,
      sourcePath,
      name: 'gbk.csv',
      sha256: actualHash,
      size: bytes.byteLength,
      encoding: 'gb18030',
      format: 'csv',
      tableId: 'tbl_1',
      mode: 'append',
    });

    expect(result.copied).toBe(true);
    expect(result.archivePath).toMatch(/^imports\//);
    expect(result.sidecarPath).toMatch(/^imports\/.+\.json$/);
    expect(readFileSync(join(root, result.archivePath ?? ''))).toEqual(bytes);
    const sidecar = JSON.parse(readFileSync(join(root, result.sidecarPath), 'utf8')) as {
      sha256: string;
      encoding: string;
      copied: boolean;
    };
    expect(sidecar).toMatchObject({ sha256: actualHash, encoding: 'gb18030', copied: true });

    await expect(
      harness.store.archiveImport({
        workspaceId: created.id,
        sourcePath,
        name: 'gbk.csv',
        sha256: actualHash.replace(/^./, (character) => (character === 'a' ? 'b' : 'a')),
        size: bytes.byteLength,
        encoding: 'gb18030',
        format: 'csv',
        tableId: 'tbl_1',
        mode: 'append',
      }),
    ).rejects.toMatchObject({ code: 'E_IMPORT_FORMAT' });
  });
});
