import type { WorkspaceManifest } from '@curve/domain';

/**
 * The persistence port consumed by `app-core` and implemented by the Electron
 * main process (file store) and by tests (memory store).
 *
 * `@curve/persistence` is deliberately free of Node and Electron imports so the
 * port can also be used from the renderer-side command bus in later milestones.
 */
export interface CreateWorkspaceRequest {
  /** Parent directory. The adapter appends `<sanitized name>.cstudio`. */
  dir: string;
  name: string;
}

export interface OpenWorkspaceRequest {
  /** Workspace root, i.e. the `*.cstudio` directory. */
  dir: string;
}

export interface WorkspaceOpenResult {
  manifest: WorkspaceManifest;
  warnings: string[];
}

export interface CloseWorkspaceRequest {
  workspaceId: string;
}

export interface TableRef {
  workspaceId: string;
  tableId: string;
}

export interface TableReadResult {
  jsonl: string;
  bytes: number;
}

export interface WriteTableRequest extends TableRef {
  jsonl: string;
}

export interface WriteTableResult {
  bytes: number;
}

export interface WriteManifestRequest {
  workspaceId: string;
  manifest: WorkspaceManifest;
}

export interface BackupEntry {
  /** Workspace-relative POSIX path, `backups/<file>.bak`. */
  path: string;
  createdAt: string;
  bytes: number;
}

export interface RestoreBackupRequest extends TableRef {
  /** Workspace-relative POSIX path returned by `listBackups`. */
  backupPath: string;
}

export interface OkReply {
  ok: true;
}

/**
 * Workspace persistence contract (SPEC §7, §15.1). Implementations must throw
 * SPEC §18 `AppError` objects; the IPC dispatcher turns them into envelopes.
 */
export interface WorkspaceStore {
  create(request: CreateWorkspaceRequest): Promise<WorkspaceManifest>;
  open(request: OpenWorkspaceRequest): Promise<WorkspaceOpenResult>;
  close(request: CloseWorkspaceRequest): Promise<OkReply>;
  readTable(request: TableRef): Promise<TableReadResult>;
  writeTable(request: WriteTableRequest): Promise<WriteTableResult>;
  writeManifest(request: WriteManifestRequest): Promise<OkReply>;
  /** Moves the table data file to `.trash/`; the caller updates the manifest. */
  trash(request: TableRef): Promise<OkReply>;
  listBackups(request: TableRef): Promise<BackupEntry[]>;
  restore(request: RestoreBackupRequest): Promise<OkReply>;
}
