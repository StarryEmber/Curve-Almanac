import { createAppError, isId } from '@curve/domain';
import type { TableMeta, UuidFactory, WorkspaceManifest } from '@curve/domain';

import {
  MAX_BACKUPS_PER_TARGET,
  backupPathForFileName,
  parseBackupPath,
  parseTableBackupFileName,
  planBackupRotation,
  tableBackupFileName,
} from './backup';
import {
  joinPathLike,
  rootKey,
  tableFilePath,
  utf8ByteLength,
  workspaceFolderName,
} from './layout';
import { createEmptyManifest, validateManifest } from './manifest';

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
} from './types';

interface MemoryBackup {
  fileName: string;
  content: string;
  createdAt: string;
  bytes: number;
}

interface MemoryWorkspace {
  root: string;
  manifest: WorkspaceManifest;
  tables: Map<string, string>;
  backups: Map<string, MemoryBackup[]>;
  trash: Map<string, string>;
}

export interface MemoryWorkspaceStoreOptions {
  appVersion?: string;
  now?: () => Date;
  uuid?: UuidFactory;
}

const DEFAULT_APP_VERSION = '0.0.0';

/**
 * In-memory `WorkspaceStore` used by tests and, from T1.5 on, by the command
 * bus when no real filesystem is needed. It follows the same port contract and
 * error codes as the Electron adapter, but never touches the disk.
 */
export class MemoryWorkspaceStore implements WorkspaceStore {
  private readonly workspaces = new Map<string, MemoryWorkspace>();
  private readonly roots = new Map<string, string>();
  private readonly appVersion: string;
  private readonly now: () => Date;
  private readonly uuid: UuidFactory | undefined;

  constructor(options: MemoryWorkspaceStoreOptions = {}) {
    this.appVersion = options.appVersion ?? DEFAULT_APP_VERSION;
    this.now = options.now ?? (() => new Date());
    this.uuid = options.uuid;
  }

  async create(request: CreateWorkspaceRequest): Promise<WorkspaceManifest> {
    const folder = workspaceFolderName(request.name);
    if (folder.length === 0) {
      throw createAppError(
        'E_VALIDATION',
        'Workspace name must contain at least one usable character.',
      );
    }
    const root = joinPathLike(request.dir, folder);
    const key = rootKey(root);
    if (this.roots.has(key)) {
      throw createAppError('E_WS_BUSY', 'A workspace already exists at this location.');
    }

    const manifest = createEmptyManifest({
      name: request.name,
      appVersion: this.appVersion,
      now: this.now(),
      ...(this.uuid === undefined ? {} : { uuid: this.uuid }),
    });
    this.workspaces.set(manifest.id, {
      root,
      manifest,
      tables: new Map(),
      backups: new Map(),
      trash: new Map(),
    });
    this.roots.set(key, manifest.id);
    return manifest;
  }

  async open(request: OpenWorkspaceRequest): Promise<WorkspaceOpenResult> {
    const workspace = this.findByRoot(request.dir);
    if (workspace === undefined) {
      throw createAppError('E_WS_NOT_FOUND', 'The workspace is not available in memory.');
    }
    const validated = validateManifest(workspace.manifest);
    workspace.manifest = validated.manifest;
    return { manifest: validated.manifest, warnings: validated.warnings };
  }

  async close(_request: CloseWorkspaceRequest): Promise<OkReply> {
    // The memory adapter keeps data alive so a later `open` can succeed.
    return { ok: true };
  }

  async readTable(request: TableRef): Promise<TableReadResult> {
    const { workspace, tableId, table } = this.requireTable(request);
    const jsonl = workspace.tables.get(tableId);
    if (jsonl === undefined) {
      // Same semantics as the file adapter (ADR-022): a table the manifest
      // still describes as empty has never been written; anything else is data
      // loss and must not be reported as an empty table.
      if (table.rowCount === 0) {
        return { jsonl: '', bytes: 0 };
      }
      throw createAppError('E_TABLE_NOT_FOUND', 'The table data file is missing.');
    }
    return { jsonl, bytes: utf8ByteLength(jsonl) };
  }

  async writeTable(request: WriteTableRequest): Promise<WriteTableResult> {
    const { workspace, tableId } = this.requireTable(request);
    const previous = workspace.tables.get(tableId);
    if (previous !== undefined) {
      this.addBackup(workspace, tableId, previous);
    }
    workspace.tables.set(tableId, request.jsonl);
    return { bytes: utf8ByteLength(request.jsonl) };
  }

  async writeManifest(request: WriteManifestRequest): Promise<OkReply> {
    const workspace = this.requireWorkspace(request.workspaceId);
    const validated = validateManifest(request.manifest, { workspaceId: workspace.manifest.id });
    workspace.manifest = validated.manifest;
    return { ok: true };
  }

  async trash(request: TableRef): Promise<OkReply> {
    const { workspace, tableId } = this.requireTable(request);
    const content = workspace.tables.get(tableId);
    if (content !== undefined) {
      workspace.trash.set(`${tableId}.${this.now().toISOString()}`, content);
      workspace.tables.delete(tableId);
    }
    return { ok: true };
  }

  async listBackups(request: TableRef): Promise<BackupEntry[]> {
    const { workspace, tableId } = this.requireTable(request);
    const entries = (workspace.backups.get(tableId) ?? [])
      .map((backup) => ({
        path: backupPathForFileName(backup.fileName),
        createdAt: backup.createdAt,
        bytes: backup.bytes,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return entries;
  }

  async restore(request: RestoreBackupRequest): Promise<OkReply> {
    const { workspace, tableId } = this.requireTable(request);
    const fileName = parseBackupPath(request.backupPath);
    if (fileName === null) {
      throw createAppError('E_PATH_DENIED', 'The backup path is not allowed.');
    }
    const parsed = parseTableBackupFileName(fileName);
    if (parsed === null || parsed.tableId !== tableId) {
      throw createAppError('E_PATH_DENIED', 'The backup does not belong to this table.');
    }
    const backups = workspace.backups.get(tableId) ?? [];
    const backup = backups.find((candidate) => candidate.fileName === fileName);
    if (backup === undefined) {
      throw createAppError('E_BACKUP_NOT_FOUND', 'The requested backup does not exist.');
    }

    const current = workspace.tables.get(tableId);
    if (current !== undefined) {
      this.addBackup(workspace, tableId, current);
    }
    workspace.tables.set(tableId, backup.content);
    return { ok: true };
  }

  private findByRoot(root: string): MemoryWorkspace | undefined {
    const id = this.roots.get(rootKey(root));
    return id === undefined ? undefined : this.workspaces.get(id);
  }

  private requireWorkspace(workspaceId: string): MemoryWorkspace {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace === undefined) {
      throw createAppError('E_WS_NOT_FOUND', 'The workspace is not open.');
    }
    return workspace;
  }

  private requireTable(request: TableRef): {
    workspace: MemoryWorkspace;
    tableId: string;
    table: TableMeta;
  } {
    if (!isId('tbl', request.tableId)) {
      throw createAppError('E_PATH_DENIED', 'The table id is not a safe table id.');
    }
    const workspace = this.requireWorkspace(request.workspaceId);
    const table = workspace.manifest.tables.find((candidate) => candidate.id === request.tableId);
    if (table === undefined) {
      throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.');
    }
    if (table.file !== tableFilePath(request.tableId)) {
      throw createAppError('E_WS_INVALID_MANIFEST', 'The table file path is invalid.');
    }
    return { workspace, tableId: request.tableId, table };
  }

  private addBackup(workspace: MemoryWorkspace, tableId: string, content: string): void {
    const backups = workspace.backups.get(tableId) ?? [];
    let date = this.now();
    let fileName = tableBackupFileName(tableId, date);
    while (backups.some((backup) => backup.fileName === fileName)) {
      date = new Date(date.getTime() + 1);
      fileName = tableBackupFileName(tableId, date);
    }
    backups.push({
      fileName,
      content,
      createdAt: date.toISOString(),
      bytes: utf8ByteLength(content),
    });
    const rotation = planBackupRotation(
      backups.map((backup) => backup.fileName),
      MAX_BACKUPS_PER_TARGET,
    );
    const keep = new Set(rotation.keep);
    workspace.backups.set(
      tableId,
      backups.filter((backup) => keep.has(backup.fileName)),
    );
  }
}
