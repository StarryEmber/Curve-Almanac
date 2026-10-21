/**
 * Pre-migration snapshot and rollback (SPEC §7.6).
 *
 * `@curve/domain` runs migrations as pure transformations; this adapter owns
 * the file-system half. Before a migration it copies every file in `tables/` to
 * `backups/migration-<timestamp>/`; when the migration fails it restores those
 * exact bytes and removes files the failed attempt created, so the workspace is
 * never left half migrated.
 *
 * The manifest is *not* snapshotted here. The caller only writes it after the
 * migration succeeded, through `FileWorkspaceStore.writeManifest`, which already
 * keeps its own `manifest.<ts>.json.bak` backups (SPEC §7.4, ADR-021).
 */

import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { createAppError, toAppError } from '@curve/domain';
import {
  WORKSPACE_BACKUPS_DIR,
  WORKSPACE_TABLES_DIR,
  isMigrationBackupDirectoryName,
  migrationBackupDirectoryName,
} from '@curve/persistence';

import {
  isEnoent,
  resolveInsideRoot,
  resolveWorkspaceRelativePath,
  toFsError,
} from './path-safety';

/** Byte-for-byte copy; injectable so tests can simulate a failing restore. */
export type CopyFile = (source: string, target: string) => Promise<void>;

const copyFileBytes: CopyFile = async (source, target) => {
  await copyFile(source, target);
};

export interface MigrationBackup {
  /** Workspace-relative POSIX directory, `backups/migration-<timestamp>`. */
  relativePath: string;
  /** Absolute directory that holds the snapshot. */
  directory: string;
  /** Table file names copied, sorted; empty when `tables/` is empty. */
  files: readonly string[];
}

export interface BackupTablesOptions {
  root: string;
  now?: () => Date;
  copyFile?: CopyFile;
}

export interface RestoreMigrationBackupOptions {
  root: string;
  copyFile?: CopyFile;
}

export interface RunWithMigrationBackupOptions<T> {
  root: string;
  now?: () => Date;
  copyFile?: CopyFile;
  /** The migration work. Receives the snapshot that was just written. */
  run: (backup: MigrationBackup) => Promise<T>;
}

export interface MigrationBackupOutcome<T> {
  result: T;
  /** Kept after a successful migration so it can be inspected or re-run. */
  backup: MigrationBackup;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }
}

/** Regular files in `tables/`, sorted; a missing directory counts as empty. */
async function listTableFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) {
      return [];
    }
    throw toFsError('E_FS_READ', 'Cannot list the table files.', error);
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Copies the whole `tables/` directory into a fresh `backups/migration-<ts>/`.
 * A name already taken at that millisecond shifts forward by one millisecond,
 * mirroring `FileWorkspaceStore`'s backup naming (ADR-021).
 */
export async function backupTablesForMigration(
  options: BackupTablesOptions,
): Promise<MigrationBackup> {
  const backupsDirectory = await resolveWorkspaceRelativePath(
    options.root,
    WORKSPACE_BACKUPS_DIR,
    'backups directory',
  );
  const tablesDirectory = await resolveWorkspaceRelativePath(
    options.root,
    WORKSPACE_TABLES_DIR,
    'tables directory',
  );

  let date = (options.now ?? (() => new Date()))();
  let directoryName = migrationBackupDirectoryName(date);
  let directory = join(backupsDirectory, directoryName);
  while (await pathExists(directory)) {
    date = new Date(date.getTime() + 1);
    directoryName = migrationBackupDirectoryName(date);
    directory = join(backupsDirectory, directoryName);
  }

  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    throw toFsError('E_FS_WRITE', 'Cannot create the migration backup directory.', error);
  }

  const files = await listTableFiles(tablesDirectory);
  const copy = options.copyFile ?? copyFileBytes;
  for (const fileName of files) {
    try {
      await copy(join(tablesDirectory, fileName), join(directory, fileName));
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      throw toFsError('E_FS_WRITE', `Cannot back up the table file ${fileName}.`, error);
    }
  }

  return {
    relativePath: `${WORKSPACE_BACKUPS_DIR}/${directoryName}`,
    directory,
    files,
  };
}

async function resolveSnapshotDirectory(root: string, backup: MigrationBackup): Promise<string> {
  const segments = backup.relativePath.split('/');
  const directoryName = segments.length === 2 ? segments[1] : undefined;
  if (
    segments[0] !== WORKSPACE_BACKUPS_DIR ||
    directoryName === undefined ||
    !isMigrationBackupDirectoryName(directoryName)
  ) {
    throw createAppError('E_PATH_DENIED', 'The migration backup directory is not allowed.', {
      detail: backup.relativePath,
    });
  }

  const backupsDirectory = await resolveWorkspaceRelativePath(
    root,
    WORKSPACE_BACKUPS_DIR,
    'backups directory',
  );
  return resolveInsideRoot(
    root,
    join(backupsDirectory, directoryName),
    'migration backup directory',
  );
}

/**
 * Restores the snapshot: every copied file is written back atomically
 * (`copy` to a sibling temporary file, then rename), then table files created
 * after the snapshot was taken are removed. New files are removed best-effort;
 * a failure to remove one never blocks restoring the original data.
 */
export async function restoreMigrationBackup(
  backup: MigrationBackup,
  options: RestoreMigrationBackupOptions,
): Promise<void> {
  const snapshotDirectory = await resolveSnapshotDirectory(options.root, backup);
  const tablesDirectory = await resolveWorkspaceRelativePath(
    options.root,
    WORKSPACE_TABLES_DIR,
    'tables directory',
  );

  try {
    await mkdir(tablesDirectory, { recursive: true });
  } catch (error) {
    throw toFsError('E_FS_WRITE', 'Cannot prepare the tables directory for the rollback.', error);
  }

  const copy = options.copyFile ?? copyFileBytes;
  for (const fileName of backup.files) {
    const target = join(tablesDirectory, fileName);
    const temporary = `${target}.migration-restore`;
    try {
      await copy(join(snapshotDirectory, fileName), temporary);
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw toFsError('E_FS_READ', `Cannot restore the table file ${fileName}.`, error);
    }
  }

  const restored = new Set(backup.files);
  for (const fileName of await listTableFiles(tablesDirectory)) {
    if (restored.has(fileName)) {
      continue;
    }
    await rm(join(tablesDirectory, fileName), { force: true }).catch(() => undefined);
  }
}

/**
 * Runs `options.run` behind a fresh snapshot. Any failure restores the snapshot
 * and surfaces `E_MIGRATION_FAILED`; the snapshot stays on disk for inspection
 * (SPEC §7.6 "迁移前：复制整个 tables/ 到 backups/migration-<ts>/").
 */
export async function runWithMigrationBackup<T>(
  options: RunWithMigrationBackupOptions<T>,
): Promise<MigrationBackupOutcome<T>> {
  const backup = await backupTablesForMigration({
    root: options.root,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.copyFile === undefined ? {} : { copyFile: options.copyFile }),
  });

  let result: T;
  try {
    result = await options.run(backup);
  } catch (error) {
    const appError = toAppError(error);
    try {
      await restoreMigrationBackup(backup, {
        root: options.root,
        ...(options.copyFile === undefined ? {} : { copyFile: options.copyFile }),
      });
    } catch (rollbackError) {
      const rollback = toAppError(rollbackError);
      throw createAppError(
        'E_MIGRATION_FAILED',
        'The migration failed and the workspace could not be restored from the backup.',
        { detail: `error=${appError.code}; rollback=${rollback.code}` },
      );
    }

    throw createAppError(
      'E_MIGRATION_FAILED',
      'The migration failed; the original table files were restored.',
      {
        detail:
          appError.code === 'E_MIGRATION_FAILED' && appError.detail !== undefined
            ? appError.detail
            : `${appError.code}: ${appError.message}`,
        retryable: true,
      },
    );
  }

  return { result, backup };
}
