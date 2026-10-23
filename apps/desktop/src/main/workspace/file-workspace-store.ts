/**
 * File-system `WorkspaceStore` (SPEC §7, §15.2).
 *
 * This is the Electron-main adapter: it owns the canonical roots, the `.lock`
 * lifecycle, backups, the recent list and all `fs` access. `@curve/persistence`
 * only supplies the port, the layout names and the pure backup/path helpers.
 *
 * Write order for a table is always: backup the old file, then atomically
 * replace it. `manifest.json` is written last by the caller (SPEC §7.4.4).
 */

import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import { basename, join } from 'node:path';

import { createAppError, isAppError, isId, toAppError } from '@curve/domain';
import type { TableMeta, UuidFactory } from '@curve/domain';
import {
  MAX_BACKUPS_PER_TARGET,
  WORKSPACE_BACKUPS_DIR,
  WORKSPACE_IMPORTS_DIR,
  WORKSPACE_LOCK_FILE,
  WORKSPACE_MANIFEST_FILE,
  WORKSPACE_TABLES_DIR,
  WORKSPACE_TRASH_DIR,
  backupPathForFileName,
  createEmptyManifest,
  formatBackupTimestamp,
  isExpiredBackup,
  isManifestBackupFileName,
  isTableBackupFor,
  manifestBackupFileName,
  parseBackupPath,
  parseManifestDocument,
  parseTableBackupFileName,
  planBackupRotation,
  rootKey,
  serializeManifest,
  tableBackupFileName,
  tableFileName,
  tableFilePath,
  validateManifest,
  workspaceFolderName,
} from '@curve/persistence';
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
import { countJsonlRows, reconcileRowCounts, tableWriteLimitError } from '@curve/table-engine';

import { atomicWrite } from './atomic-write';
import { inspectLock, lockDocument, removeLockIfOwned, writeLock } from './lock-file';
import {
  isEnoent,
  resolveInsideRoot,
  resolveWorkspaceRelativePath,
  toFsError,
} from './path-safety';
import { createRecentList } from './recent-list';

import type { RecentEntry, WorkspaceManifest } from '../../shared/contracts/ipc';
import type { Logger } from '../logger';
import type { AtomicWrite } from './atomic-write';
import type { LockInspection } from './lock-file';

export interface FileWorkspaceStoreOptions {
  /** Electron `app.getPath('userData')`; recent.json lives here. */
  userDataPath: string;
  appVersion: string;
  now?: () => Date;
  uuid?: UuidFactory;
  logger?: Pick<Logger, 'warn'>;
  isProcessAlive?: (pid: number) => boolean;
  /** Injectable for the interrupted-write test; defaults to `write-file-atomic`. */
  writeFile?: AtomicWrite;
}

interface OpenWorkspace {
  id: string;
  root: string;
  manifest: WorkspaceManifest;
  warnings: string[];
}

/** Files at or below this size are copied into `imports/`; larger ones only get metadata. */
export const MAX_ARCHIVE_COPY_BYTES = 50 * 1024 * 1024;

export interface ArchiveImportFileRequest {
  workspaceId: string;
  sourcePath: string;
  name: string;
  sha256: string;
  size: number;
  encoding: string;
  format: 'csv' | 'json';
  tableId: string;
  mode: 'append' | 'replace';
}

export interface ArchiveImportFileResult {
  copied: boolean;
  /** Workspace-relative path, or null when the file exceeded the copy limit. */
  archivePath: string | null;
  sidecarPath: string;
}

function workspaceRootKey(root: string): string {
  const key = rootKey(root);
  return process.platform === 'win32' ? key.toLowerCase() : key;
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

function safeImportFileName(name: string): string {
  const cleaned = basename(name)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return cleaned.length === 0 ? 'import' : cleaned;
}

/**
 * Byte-level `countJsonlRows` for the open-time `rowCount` repair (SPEC §7.5).
 *
 * A UTF-8 newline byte can never appear inside a multi-byte sequence, so
 * counting `0x0A` over the buffer is exact. It also counts only non-empty
 * segments, matching `countJsonlRows` for blank lines (T2.7/ADR-033: avoids
 * decoding a 100k table file to a string just to count rows).
 */
function countBufferJsonlRows(buffer: Buffer): number {
  if (buffer.length === 0) {
    return 0;
  }
  let count = 0;
  let start = 0;
  for (;;) {
    const newline = buffer.indexOf(0x0a, start);
    const end = newline === -1 ? buffer.length : newline;
    if (end > start) {
      count += 1;
    }
    if (newline === -1) {
      return count;
    }
    start = newline + 1;
  }
}

export class FileWorkspaceStore implements WorkspaceStore {
  private readonly workspaces = new Map<string, OpenWorkspace>();
  private readonly rootIndex = new Map<string, string>();
  private readonly appVersion: string;
  private readonly now: () => Date;
  private readonly uuid: UuidFactory | undefined;
  private readonly logger: Pick<Logger, 'warn'> | undefined;
  private readonly isProcessAlive: ((pid: number) => boolean) | undefined;
  private readonly writeFile: AtomicWrite;
  private readonly recent: ReturnType<typeof createRecentList>;

  constructor(options: FileWorkspaceStoreOptions) {
    this.appVersion = options.appVersion;
    this.now = options.now ?? (() => new Date());
    this.uuid = options.uuid;
    this.logger = options.logger;
    this.isProcessAlive = options.isProcessAlive;
    this.writeFile = options.writeFile ?? atomicWrite;
    this.recent = createRecentList({
      userDataPath: options.userDataPath,
      now: this.now,
    });
  }

  async create(request: CreateWorkspaceRequest): Promise<WorkspaceManifest> {
    const name = request.name.trim();
    if (name.length === 0) {
      throw createAppError('E_VALIDATION', 'Workspace name must not be empty.');
    }
    const folder = workspaceFolderName(name);
    if (folder.length === 0) {
      throw createAppError(
        'E_VALIDATION',
        'Workspace name must contain at least one usable character.',
      );
    }

    let parent: string;
    try {
      await mkdir(request.dir, { recursive: true });
      parent = await realpath(request.dir);
    } catch (error) {
      throw toFsError('E_FS_WRITE', 'Cannot create the workspace parent directory.', error);
    }

    const root = join(parent, folder);
    try {
      await mkdir(root);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'EEXIST'
      ) {
        throw createAppError('E_WS_BUSY', 'A workspace already exists at this location.');
      }
      throw toFsError('E_FS_WRITE', 'Cannot create the workspace directory.', error);
    }

    try {
      for (const directory of [
        WORKSPACE_TABLES_DIR,
        WORKSPACE_BACKUPS_DIR,
        WORKSPACE_IMPORTS_DIR,
        WORKSPACE_TRASH_DIR,
      ]) {
        await mkdir(join(root, directory), { recursive: true });
      }

      const realRoot = await realpath(root);
      const manifest = createEmptyManifest({
        name,
        appVersion: this.appVersion,
        now: this.now(),
        ...(this.uuid === undefined ? {} : { uuid: this.uuid }),
      });

      const manifestPath = await resolveInsideRoot(
        realRoot,
        join(realRoot, WORKSPACE_MANIFEST_FILE),
        'workspace manifest',
      );
      await this.writeAtomic(
        manifestPath,
        serializeManifest(manifest),
        'Cannot write the workspace manifest.',
      );

      const lockPath = await resolveInsideRoot(
        realRoot,
        join(realRoot, WORKSPACE_LOCK_FILE),
        'workspace lock',
      );
      await writeLock(
        lockPath,
        lockDocument(process.pid, this.now(), this.appVersion),
        this.writeFile,
      );

      this.workspaces.set(manifest.id, {
        id: manifest.id,
        root: realRoot,
        manifest,
        warnings: [],
      });
      this.rootIndex.set(workspaceRootKey(realRoot), manifest.id);
      await this.rememberRecent(realRoot, manifest.name);
      return manifest;
    } catch (error) {
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
      if (isAppError(error)) {
        throw error;
      }
      throw toFsError('E_FS_WRITE', 'Cannot finish creating the workspace.', error);
    }
  }

  async open(request: OpenWorkspaceRequest): Promise<WorkspaceOpenResult> {
    let realRoot: string;
    try {
      realRoot = await realpath(request.dir);
    } catch (error) {
      if (isEnoent(error)) {
        throw createAppError('E_WS_NOT_FOUND', 'The workspace directory does not exist.');
      }
      throw toFsError('E_FS_READ', 'Cannot open the workspace directory.', error);
    }

    const existingId = this.rootIndex.get(workspaceRootKey(realRoot));
    const existing = existingId === undefined ? undefined : this.workspaces.get(existingId);
    if (existing !== undefined) {
      await this.rememberRecent(existing.root, existing.manifest.name);
      return { manifest: existing.manifest, warnings: existing.warnings };
    }

    const manifestPath = await resolveInsideRoot(
      realRoot,
      join(realRoot, WORKSPACE_MANIFEST_FILE),
      'workspace manifest',
    );
    let raw: string;
    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch (error) {
      if (isEnoent(error)) {
        throw createAppError('E_WS_NOT_FOUND', 'The workspace manifest does not exist.');
      }
      throw toFsError('E_FS_READ', 'Cannot read the workspace manifest.', error);
    }

    const validated = parseManifestDocument(raw);
    const warnings = [...validated.warnings];
    await this.collectMissingTableWarnings(realRoot, validated.manifest, warnings);

    const existingById = this.workspaces.get(validated.manifest.id);
    if (existingById !== undefined && existingById.root !== realRoot) {
      throw createAppError('E_WS_BUSY', 'Another open workspace uses the same manifest id.');
    }

    const lockPath = await resolveInsideRoot(
      realRoot,
      join(realRoot, WORKSPACE_LOCK_FILE),
      'workspace lock',
    );
    let lockInspection: LockInspection;
    try {
      lockInspection = await inspectLock(lockPath, {
        now: this.now(),
        ...(this.isProcessAlive === undefined ? {} : { isProcessAlive: this.isProcessAlive }),
      });
    } catch (error) {
      throw toFsError('E_FS_READ', 'Cannot inspect the workspace lock.', error);
    }

    if (lockInspection.status === 'active') {
      throw createAppError(
        'E_WS_LOCKED',
        'The workspace is locked by another Curve Studio window.',
        {
          detail: `pid=${String(lockInspection.lock?.pid ?? 'unknown')}`,
        },
      );
    }
    if (lockInspection.status === 'stale') {
      warnings.push(
        'The previous session did not close this workspace cleanly; its stale lock was replaced.',
      );
    }
    if (lockInspection.status === 'corrupt') {
      warnings.push('The workspace lock file was unreadable and has been replaced.');
    }

    try {
      await writeLock(
        lockPath,
        lockDocument(process.pid, this.now(), this.appVersion),
        this.writeFile,
      );
    } catch (error) {
      await removeLockIfOwned(lockPath, process.pid).catch(() => undefined);
      throw toFsError('E_FS_WRITE', 'Cannot write the workspace lock.', error);
    }

    this.workspaces.set(validated.manifest.id, {
      id: validated.manifest.id,
      root: realRoot,
      manifest: validated.manifest,
      warnings,
    });
    this.rootIndex.set(workspaceRootKey(realRoot), validated.manifest.id);

    // SPEC §7.5: recompute every rowCount hint right after opening. A failure
    // to write the repaired manifest must not fail the open itself.
    const workspace = this.workspaces.get(validated.manifest.id);
    if (workspace !== undefined) {
      await this.reconcileTableRowCounts(workspace);
    }

    await this.pruneOldBackups(realRoot);
    await this.rememberRecent(realRoot, validated.manifest.name);
    return { manifest: workspace?.manifest ?? validated.manifest, warnings };
  }

  async close(request: CloseWorkspaceRequest): Promise<OkReply> {
    const workspace = this.workspaces.get(request.workspaceId);
    if (workspace === undefined) {
      return { ok: true };
    }

    const lockPath = await resolveInsideRoot(
      workspace.root,
      join(workspace.root, WORKSPACE_LOCK_FILE),
      'workspace lock',
    );
    try {
      await removeLockIfOwned(lockPath, process.pid);
    } catch (error) {
      throw toFsError('E_FS_WRITE', 'Cannot remove the workspace lock.', error);
    }

    this.workspaces.delete(request.workspaceId);
    this.rootIndex.delete(workspaceRootKey(workspace.root));
    return { ok: true };
  }

  async readTable(request: TableRef): Promise<TableReadResult> {
    const { workspace, table } = this.requireTable(request);
    const filePath = await this.resolveTableFile(workspace, table);
    let jsonl: string;
    try {
      // Read straight to UTF-8 instead of Buffer + toString: the IPC reply needs
      // the string anyway, and the extra ~15MB buffer only adds to the 100k open
      // memory peak (T2.7 memory budget, ADR-033).
      jsonl = await readFile(filePath, 'utf8');
    } catch (error) {
      if (isEnoent(error)) {
        // SPEC §7.5 + ADR-022: a table that the manifest still describes as
        // empty has simply never been written. Anything else is data loss and
        // must not be silently reported as an empty table.
        if (table.rowCount === 0) {
          return { jsonl: '', bytes: 0 };
        }
        throw createAppError('E_TABLE_NOT_FOUND', 'The table data file is missing.', {
          detail: `table=${table.id} rowCount=${table.rowCount}`,
        });
      }
      throw toFsError('E_FS_READ', 'Cannot read the table data file.', error);
    }
    return { jsonl, bytes: Buffer.byteLength(jsonl, 'utf8') };
  }

  async writeTable(request: WriteTableRequest): Promise<WriteTableResult> {
    const { workspace, table } = this.requireTable(request);
    const filePath = await this.resolveTableFile(workspace, table);

    // SPEC §2.2: refuse to persist a table above the row or file-size budget.
    const bytes = Buffer.byteLength(request.jsonl, 'utf8');
    const limitError = tableWriteLimitError({
      rowCount: countJsonlRows(request.jsonl),
      bytes,
    });
    if (limitError !== null) {
      throw limitError;
    }

    if (await pathExists(filePath)) {
      await this.backupTableFile(workspace, table.id, filePath);
    }

    await this.writeAtomic(filePath, request.jsonl, 'Cannot write the table data file.');
    return { bytes };
  }

  async writeManifest(request: WriteManifestRequest): Promise<OkReply> {
    const workspace = this.requireWorkspace(request.workspaceId);
    const validated = validateManifest(request.manifest, { workspaceId: workspace.id });
    const manifestPath = await resolveInsideRoot(
      workspace.root,
      join(workspace.root, WORKSPACE_MANIFEST_FILE),
      'workspace manifest',
    );

    if (await pathExists(manifestPath)) {
      await this.backupManifestFile(workspace, manifestPath);
    }

    await this.writeAtomic(
      manifestPath,
      serializeManifest(validated.manifest),
      'Cannot write the workspace manifest.',
    );
    workspace.manifest = validated.manifest;
    return { ok: true };
  }

  async trash(request: TableRef): Promise<OkReply> {
    // T2.1 deletes by writing the manifest first and moving the file second
    // (ADR-027), so `trash` must resolve the file by id instead of requiring a
    // manifest entry that the caller has already removed.
    if (!isId('tbl', request.tableId)) {
      throw createAppError('E_PATH_DENIED', 'The table id is not a safe table id.');
    }
    const workspace = this.requireWorkspace(request.workspaceId);
    const tablesDirectory = await resolveWorkspaceRelativePath(
      workspace.root,
      WORKSPACE_TABLES_DIR,
      'tables directory',
    );
    const source = await resolveInsideRoot(
      workspace.root,
      join(tablesDirectory, tableFileName(request.tableId)),
      `table ${request.tableId}`,
    );
    if (!(await pathExists(source))) {
      return { ok: true };
    }

    const trashDirectory = await resolveWorkspaceRelativePath(
      workspace.root,
      WORKSPACE_TRASH_DIR,
      'trash directory',
    );
    let date = this.now();
    let target = join(trashDirectory, `${request.tableId}.${formatBackupTimestamp(date)}.jsonl`);
    while (await pathExists(target)) {
      date = new Date(date.getTime() + 1);
      target = join(trashDirectory, `${request.tableId}.${formatBackupTimestamp(date)}.jsonl`);
    }

    try {
      await rename(source, target);
    } catch (error) {
      throw toFsError('E_FS_WRITE', 'Cannot move the table file to the trash.', error);
    }
    return { ok: true };
  }

  async listBackups(request: TableRef): Promise<BackupEntry[]> {
    const { workspace, table } = this.requireTable(request);
    const backupsDirectory = await resolveWorkspaceRelativePath(
      workspace.root,
      WORKSPACE_BACKUPS_DIR,
      'backups directory',
    );

    let names: string[];
    try {
      names = await readdir(backupsDirectory);
    } catch (error) {
      if (isEnoent(error)) {
        return [];
      }
      throw toFsError('E_FS_READ', 'Cannot list workspace backups.', error);
    }

    const entries = await Promise.all(
      names
        .filter((fileName) => isTableBackupFor(fileName, table.id))
        .map(async (fileName): Promise<BackupEntry | null> => {
          const parsed = parseTableBackupFileName(fileName);
          if (parsed === null) {
            return null;
          }
          try {
            const backupPath = await resolveInsideRoot(
              workspace.root,
              join(backupsDirectory, fileName),
              `backup ${fileName}`,
            );
            const info = await stat(backupPath);
            return {
              path: backupPathForFileName(fileName),
              createdAt: parsed.createdAt,
              bytes: info.size,
            };
          } catch {
            // A backup removed between readdir and stat must not fail the list.
            return null;
          }
        }),
    );

    return entries
      .filter((entry): entry is BackupEntry => entry !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async restore(request: RestoreBackupRequest): Promise<OkReply> {
    const { workspace, table } = this.requireTable(request);
    const fileName = parseBackupPath(request.backupPath);
    if (fileName === null) {
      throw createAppError('E_PATH_DENIED', 'The backup path is not allowed.');
    }
    const parsed = parseTableBackupFileName(fileName);
    if (parsed === null || parsed.tableId !== table.id) {
      throw createAppError('E_PATH_DENIED', 'The backup does not belong to this table.');
    }

    const backupsDirectory = await resolveWorkspaceRelativePath(
      workspace.root,
      WORKSPACE_BACKUPS_DIR,
      'backups directory',
    );
    const backupPath = await resolveInsideRoot(
      workspace.root,
      join(backupsDirectory, fileName),
      `backup ${fileName}`,
    );

    let content: string;
    try {
      content = await readFile(backupPath, 'utf8');
    } catch (error) {
      if (isEnoent(error)) {
        throw createAppError('E_BACKUP_NOT_FOUND', 'The requested backup does not exist.');
      }
      throw toFsError('E_FS_READ', `Cannot read the backup ${fileName}.`, error);
    }

    const tablePath = await this.resolveTableFile(workspace, table);
    if (await pathExists(tablePath)) {
      await this.backupTableFile(workspace, table.id, tablePath);
    }
    await this.writeAtomic(tablePath, content, 'Cannot restore the table backup.');
    return { ok: true };
  }

  /**
   * Records an import source in `imports/` (T2.5).
   *
   * Files up to 50 MB are copied byte-for-byte next to a JSON sidecar; larger
   * files keep only the original path and SHA-256. The source hash is verified
   * again here because the renderer selected it earlier and the file could have
   * changed before the commit click.
   */
  async archiveImport(request: ArchiveImportFileRequest): Promise<ArchiveImportFileResult> {
    if (!isId('tbl', request.tableId)) {
      throw createAppError('E_PATH_DENIED', 'The table id is not a safe table id.');
    }
    const workspace = this.requireWorkspace(request.workspaceId);

    let sourcePath: string;
    let sourceBytes: Buffer;
    try {
      sourcePath = await realpath(request.sourcePath);
      sourceBytes = await readFile(sourcePath);
    } catch (error) {
      throw toFsError('E_FS_READ', 'Cannot read the import source file.', error);
    }
    const sha256 = createHash('sha256').update(sourceBytes).digest('hex');
    if (sourceBytes.byteLength !== request.size || sha256 !== request.sha256) {
      throw createAppError(
        'E_IMPORT_FORMAT',
        'The import source changed after it was selected; choose it again.',
        { detail: `bytes=${String(sourceBytes.byteLength)}` },
      );
    }

    const importsDirectory = await resolveWorkspaceRelativePath(
      workspace.root,
      WORKSPACE_IMPORTS_DIR,
      'imports directory',
    );
    try {
      await mkdir(importsDirectory, { recursive: true });
    } catch (error) {
      throw toFsError('E_FS_WRITE', 'Cannot create the imports directory.', error);
    }

    const safeName = safeImportFileName(request.name);
    let date = this.now();
    let baseName = `${formatBackupTimestamp(date)}-${safeName}`;
    let archiveFile = join(importsDirectory, baseName);
    let sidecarFile = join(importsDirectory, `${baseName}.json`);
    while ((await pathExists(archiveFile)) || (await pathExists(sidecarFile))) {
      date = new Date(date.getTime() + 1);
      baseName = `${formatBackupTimestamp(date)}-${safeName}`;
      archiveFile = join(importsDirectory, baseName);
      sidecarFile = join(importsDirectory, `${baseName}.json`);
    }

    const copied = sourceBytes.byteLength <= MAX_ARCHIVE_COPY_BYTES;
    if (copied) {
      const temporary = `${archiveFile}.tmp`;
      try {
        await copyFile(sourcePath, temporary);
        await rename(temporary, archiveFile);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw toFsError('E_FS_WRITE', 'Cannot copy the import source into the workspace.', error);
      }
    }

    const sidecar = {
      name: request.name,
      originalPath: sourcePath,
      sha256,
      bytes: sourceBytes.byteLength,
      encoding: request.encoding,
      format: request.format,
      tableId: request.tableId,
      mode: request.mode,
      importedAt: this.now().toISOString(),
      copied,
      archivePath: copied ? `${WORKSPACE_IMPORTS_DIR}/${baseName}` : null,
    };
    await this.writeAtomic(
      sidecarFile,
      `${JSON.stringify(sidecar, null, 2)}\n`,
      'Cannot write the import metadata file.',
    );

    return {
      copied,
      archivePath: copied ? `${WORKSPACE_IMPORTS_DIR}/${baseName}` : null,
      sidecarPath: `${WORKSPACE_IMPORTS_DIR}/${baseName}.json`,
    };
  }

  /** Reads `userData/recent.json`; corrupt files degrade to an empty list. */
  async listRecent(): Promise<RecentEntry[]> {
    return this.recent.list();
  }

  private requireWorkspace(workspaceId: string): OpenWorkspace {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace === undefined) {
      throw createAppError('E_WS_NOT_FOUND', 'The workspace is not open.');
    }
    return workspace;
  }

  private requireTable(request: TableRef): { workspace: OpenWorkspace; table: TableMeta } {
    if (!isId('tbl', request.tableId)) {
      throw createAppError('E_PATH_DENIED', 'The table id is not a safe table id.');
    }
    const workspace = this.requireWorkspace(request.workspaceId);
    const table = workspace.manifest.tables.find((candidate) => candidate.id === request.tableId);
    if (table === undefined) {
      throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.');
    }
    if (table.file !== tableFilePath(table.id)) {
      throw createAppError('E_WS_INVALID_MANIFEST', 'The table file path is invalid.');
    }
    return { workspace, table };
  }

  private async resolveTableFile(workspace: OpenWorkspace, table: TableMeta): Promise<string> {
    const tablesDirectory = await resolveWorkspaceRelativePath(
      workspace.root,
      WORKSPACE_TABLES_DIR,
      'tables directory',
    );
    return resolveInsideRoot(
      workspace.root,
      join(tablesDirectory, tableFileName(table.id)),
      `table ${table.id}`,
    );
  }

  private async writeAtomic(path: string, data: string, message: string): Promise<void> {
    try {
      await this.writeFile(path, data);
    } catch (error) {
      throw toFsError('E_FS_WRITE', message, error);
    }
  }

  private async backupTableFile(
    workspace: OpenWorkspace,
    tableId: string,
    sourcePath: string,
  ): Promise<void> {
    const backupsDirectory = await resolveWorkspaceRelativePath(
      workspace.root,
      WORKSPACE_BACKUPS_DIR,
      'backups directory',
    );

    let date = this.now();
    let fileName = tableBackupFileName(tableId, date);
    while (await pathExists(join(backupsDirectory, fileName))) {
      date = new Date(date.getTime() + 1);
      fileName = tableBackupFileName(tableId, date);
    }

    await this.copyToBackup(backupsDirectory, fileName, sourcePath);
    await this.rotateBackups(backupsDirectory, (candidate) => isTableBackupFor(candidate, tableId));
  }

  private async backupManifestFile(workspace: OpenWorkspace, sourcePath: string): Promise<void> {
    const backupsDirectory = await resolveWorkspaceRelativePath(
      workspace.root,
      WORKSPACE_BACKUPS_DIR,
      'backups directory',
    );

    let date = this.now();
    let fileName = manifestBackupFileName(date);
    while (await pathExists(join(backupsDirectory, fileName))) {
      date = new Date(date.getTime() + 1);
      fileName = manifestBackupFileName(date);
    }

    await this.copyToBackup(backupsDirectory, fileName, sourcePath);
    await this.rotateBackups(backupsDirectory, isManifestBackupFileName);
  }

  private async copyToBackup(
    backupsDirectory: string,
    fileName: string,
    sourcePath: string,
  ): Promise<void> {
    let content: Buffer;
    try {
      content = await readFile(sourcePath);
    } catch (error) {
      throw toFsError('E_FS_READ', 'Cannot read the file before backing it up.', error);
    }

    const target = join(backupsDirectory, fileName);
    try {
      await this.writeFile(target, content.toString('utf8'));
    } catch (error) {
      throw toFsError('E_FS_WRITE', 'Cannot write the workspace backup.', error);
    }
  }

  private async rotateBackups(
    backupsDirectory: string,
    belongs: (fileName: string) => boolean,
  ): Promise<void> {
    let names: string[];
    try {
      names = await readdir(backupsDirectory);
    } catch (error) {
      if (isEnoent(error)) {
        return;
      }
      throw toFsError('E_FS_READ', 'Cannot list workspace backups.', error);
    }

    const plan = planBackupRotation(names.filter(belongs), MAX_BACKUPS_PER_TARGET);
    for (const fileName of plan.remove) {
      try {
        await unlink(join(backupsDirectory, fileName));
      } catch (error) {
        this.logger?.warn(
          `[workspace] failed to remove an old backup: ${toAppError(error).message}`,
        );
      }
    }
  }

  private async pruneOldBackups(root: string): Promise<void> {
    let backupsDirectory: string;
    try {
      backupsDirectory = await resolveWorkspaceRelativePath(
        root,
        WORKSPACE_BACKUPS_DIR,
        'backups directory',
      );
    } catch {
      return;
    }

    let names: string[];
    try {
      names = await readdir(backupsDirectory);
    } catch {
      return;
    }

    const now = this.now();
    for (const fileName of names) {
      if (!isExpiredBackup(fileName, now)) {
        continue;
      }
      try {
        await unlink(join(backupsDirectory, fileName));
      } catch (error) {
        this.logger?.warn(
          `[workspace] failed to prune an expired backup: ${toAppError(error).message}`,
        );
      }
    }
  }

  /**
   * SPEC §7.5: recompute every `rowCount` hint from the files on disk.
   *
   * A missing file keeps its declared count (the open path already warns about
   * it), so data loss is never laundered into "0 rows". Repairing a hint is not
   * a user edit, so `updatedAt` is left alone. A failed manifest write degrades
   * to a warning: opening the workspace must still succeed.
   */
  private async reconcileTableRowCounts(workspace: OpenWorkspace): Promise<void> {
    const actual = new Map<string, number>();
    for (const table of workspace.manifest.tables) {
      let tablePath: string;
      try {
        tablePath = await this.resolveTableFile(workspace, table);
      } catch {
        continue;
      }
      let content: Buffer;
      try {
        // Row counting only needs the `\n` bytes: decoding 15MB to a string here
        // doubled the main-process heap on every 100k open (ADR-033).
        content = await readFile(tablePath);
      } catch (error) {
        if (!isEnoent(error)) {
          workspace.warnings.push(
            `The data file for table "${table.name}" could not be read; its row count was not verified.`,
          );
        }
        continue;
      }
      actual.set(table.id, countBufferJsonlRows(content));
      if (content.length > 0 && content[content.length - 1] !== 0x0a) {
        workspace.warnings.push(
          `The data file for table "${table.name}" does not end with a newline.`,
        );
      }
    }

    const reconciled = reconcileRowCounts(workspace.manifest, actual);
    if (!reconciled.changed) {
      return;
    }

    try {
      const manifestPath = await resolveInsideRoot(
        workspace.root,
        join(workspace.root, WORKSPACE_MANIFEST_FILE),
        'workspace manifest',
      );
      if (await pathExists(manifestPath)) {
        await this.backupManifestFile(workspace, manifestPath);
      }
      await this.writeAtomic(
        manifestPath,
        serializeManifest(reconciled.manifest),
        'Cannot write the workspace manifest.',
      );
      workspace.manifest = reconciled.manifest;
      for (const drift of reconciled.drifts) {
        const table = reconciled.manifest.tables.find(
          (candidate) => candidate.id === drift.tableId,
        );
        workspace.warnings.push(
          `The row count of table "${table?.name ?? drift.tableId}" was ${drift.declared} ` +
            `in the manifest and is ${drift.actual} on disk; the manifest was updated.`,
        );
      }
    } catch (error) {
      this.logger?.warn(
        `[workspace] failed to repair the row counts: ${toAppError(error).message}`,
      );
      workspace.warnings.push('The row counts could not be written back to the manifest.');
    }
  }

  private async collectMissingTableWarnings(
    root: string,
    manifest: WorkspaceManifest,
    warnings: string[],
  ): Promise<void> {
    for (const table of manifest.tables) {
      try {
        const tablePath = await resolveWorkspaceRelativePath(root, table.file, `table ${table.id}`);
        if (!(await pathExists(tablePath))) {
          warnings.push(`The data file for table "${table.name}" is missing.`);
        }
      } catch {
        warnings.push(`The data file for table "${table.name}" is not accessible.`);
      }
    }
  }

  private async rememberRecent(root: string, name: string): Promise<void> {
    try {
      await this.recent.add(root, name);
    } catch (error) {
      this.logger?.warn(
        `[workspace] failed to update the recent-workspaces list: ${toAppError(error).message}`,
      );
    }
  }
}
