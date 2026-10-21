import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAppError } from '@curve/domain';
import { formatBackupTimestamp } from '@curve/persistence';

import {
  backupTablesForMigration,
  restoreMigrationBackup,
  runWithMigrationBackup,
} from './migration-backup';

import type { CopyFile } from './migration-backup';

const AT = new Date('2026-10-20T05:45:00.123Z');
const TEMP_DIRECTORIES: string[] = [];

function makeTemp(): string {
  const directory = mkdtempSync(join(tmpdir(), 'curve-migration-'));
  TEMP_DIRECTORIES.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of TEMP_DIRECTORIES.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface Workspace {
  root: string;
  tables: string;
}

function makeWorkspace(
  files: Record<string, string> = {
    'tbl_a.jsonl': '{"id":"row_1","v":[1]}\n',
    'tbl_b.jsonl': '{"id":"row_2","v":[2]}\n',
  },
): Workspace {
  const root = makeTemp();
  const tables = join(root, 'tables');
  mkdirSync(tables, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(tables, name), content);
  }
  return { root, tables };
}

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function snapshotDirectory(root: string, date = AT): string {
  return join(root, 'backups', `migration-${formatBackupTimestamp(date)}`);
}

describe('backupTablesForMigration', () => {
  it('copies every table file byte-for-byte into backups/migration-<ts>/', async () => {
    const { root, tables } = makeWorkspace();

    const backup = await backupTablesForMigration({ root, now: () => AT });

    expect(backup.relativePath).toBe(`backups/migration-${formatBackupTimestamp(AT)}`);
    expect(backup.directory).toBe(snapshotDirectory(root));
    expect(backup.files).toEqual(['tbl_a.jsonl', 'tbl_b.jsonl']);
    expect(readdirSync(backup.directory).sort()).toEqual(['tbl_a.jsonl', 'tbl_b.jsonl']);
    for (const fileName of backup.files) {
      expect(hash(join(backup.directory, fileName))).toBe(hash(join(tables, fileName)));
    }
  });

  it('shifts the snapshot name when that millisecond is already taken', async () => {
    const { root } = makeWorkspace();
    mkdirSync(snapshotDirectory(root), { recursive: true });

    const backup = await backupTablesForMigration({ root, now: () => AT });

    expect(backup.relativePath).toBe(
      `backups/migration-${formatBackupTimestamp(new Date(AT.getTime() + 1))}`,
    );
  });

  it('creates an empty snapshot when tables/ has no files or does not exist', async () => {
    const root = makeTemp();

    const backup = await backupTablesForMigration({ root, now: () => AT });

    expect(backup.files).toEqual([]);
    expect(existsSync(backup.directory)).toBe(true);
  });

  it('removes the partial snapshot when a copy fails', async () => {
    const { root } = makeWorkspace();
    const failingCopy: CopyFile = async (source, target) => {
      if (target.endsWith('tbl_b.jsonl')) {
        throw new Error('disk full');
      }
      await copyFile(source, target);
    };

    await expect(
      backupTablesForMigration({ root, now: () => AT, copyFile: failingCopy }),
    ).rejects.toMatchObject({ code: 'E_FS_WRITE' });

    expect(existsSync(snapshotDirectory(root))).toBe(false);
  });
});

describe('restoreMigrationBackup', () => {
  it('writes the original bytes back and drops files created after the snapshot', async () => {
    const { root, tables } = makeWorkspace();
    const backup = await backupTablesForMigration({ root, now: () => AT });
    const before = hash(join(tables, 'tbl_a.jsonl'));

    writeFileSync(join(tables, 'tbl_a.jsonl'), '{"id":"row_1","v":[999]}\n');
    writeFileSync(join(tables, 'tbl_new.jsonl'), '{"id":"row_9","v":[9]}\n');

    await restoreMigrationBackup(backup, { root });

    expect(hash(join(tables, 'tbl_a.jsonl'))).toBe(before);
    expect(existsSync(join(tables, 'tbl_new.jsonl'))).toBe(false);
    expect(backup.files).toEqual(['tbl_a.jsonl', 'tbl_b.jsonl']);
  });

  it('refuses a snapshot path that is not backups/migration-<ts>', async () => {
    const { root } = makeWorkspace();

    await expect(
      restoreMigrationBackup({ relativePath: '../escape', directory: root, files: [] }, { root }),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });
    await expect(
      restoreMigrationBackup(
        { relativePath: 'backups/not-a-migration', directory: root, files: [] },
        { root },
      ),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });
  });
});

describe('runWithMigrationBackup', () => {
  it('takes the snapshot before running and keeps it on success', async () => {
    const { root, tables } = makeWorkspace();

    const outcome = await runWithMigrationBackup({
      root,
      now: () => AT,
      run: async (backup) => {
        expect(backup.files).toEqual(['tbl_a.jsonl', 'tbl_b.jsonl']);
        expect(hash(join(backup.directory, 'tbl_a.jsonl'))).toBe(hash(join(tables, 'tbl_a.jsonl')));
        return 'migrated';
      },
    });

    expect(outcome.result).toBe('migrated');
    expect(existsSync(outcome.backup.directory)).toBe(true);
  });

  it('keeps the original hashes and removes half-migrated files when the run fails', async () => {
    const { root, tables } = makeWorkspace();
    const beforeA = hash(join(tables, 'tbl_a.jsonl'));
    const beforeB = hash(join(tables, 'tbl_b.jsonl'));

    await expect(
      runWithMigrationBackup({
        root,
        now: () => AT,
        run: async () => {
          writeFileSync(join(tables, 'tbl_a.jsonl'), '{"id":"row_1","v":[999]}\n');
          writeFileSync(join(tables, 'tbl_extra.jsonl'), '{"id":"row_x","v":[0]}\n');
          throw createAppError('E_MIGRATION_FAILED', 'step failed');
        },
      }),
    ).rejects.toMatchObject({ code: 'E_MIGRATION_FAILED', retryable: true });

    expect(hash(join(tables, 'tbl_a.jsonl'))).toBe(beforeA);
    expect(hash(join(tables, 'tbl_b.jsonl'))).toBe(beforeB);
    expect(existsSync(join(tables, 'tbl_extra.jsonl'))).toBe(false);
    expect(existsSync(snapshotDirectory(root))).toBe(true);
  });

  it('surfaces both the migration and the rollback failure', async () => {
    const { root, tables } = makeWorkspace();
    const failingRestore: CopyFile = async (source, target) => {
      if (target.endsWith('.migration-restore')) {
        throw new Error('disk full');
      }
      await copyFile(source, target);
    };

    await expect(
      runWithMigrationBackup({
        root,
        now: () => AT,
        copyFile: failingRestore,
        run: async () => {
          writeFileSync(join(tables, 'tbl_a.jsonl'), 'broken');
          throw new Error('migration boom');
        },
      }),
    ).rejects.toMatchObject({
      code: 'E_MIGRATION_FAILED',
      detail: expect.stringContaining('rollback='),
    });
  });
});
