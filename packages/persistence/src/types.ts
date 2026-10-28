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
  /**
   * T5.3 crash-recovery choices. `open` without `recovery` keeps the pre-T5.3
   * behaviour: a stale/corrupt lock is replaced with a warning, while a corrupt
   * manifest is rejected without touching any file (ADR-026, ADR-048).
   */
  recovery?: WorkspaceRecoveryChoice;
}

/** Explicit user choices from the crash-recovery dialog (T5.3, ADR-048). */
export interface WorkspaceRecoveryChoice {
  /**
   * The user chose "try recovery" after an unclean exit. Together with a
   * stale/corrupt lock this allows `open` to rebuild the manifest from the
   * newest `backups/manifest.*.json.bak` when the current manifest is corrupt.
   */
  acceptStaleLock?: boolean;
  /**
   * Workspace-relative `backups/manifest.<timestamp>.json.bak` selected by the
   * user. The backup is validated first, then written with the normal backup +
   * atomic-replace path before the workspace opens.
   */
  manifestBackup?: string;
}

/** Lock state reported by `workspace:inspect` (SPEC §7.5). */
export type WorkspaceLockStatus = 'none' | 'active' | 'stale' | 'corrupt';

/** Manifest state reported by `workspace:inspect` (SPEC §7.5). */
export type WorkspaceManifestStatus = 'ok' | 'missing' | 'invalid' | 'unsupported';

/**
 * Read-only pre-flight used before `open` so the renderer can offer
 * "try recovery / open directly" (T5.3, SPEC §7.5). `inspect` never creates,
 * replaces or deletes a lock, manifest or backup.
 */
export interface WorkspaceInspection {
  /** Canonical (`realpath`) workspace root. */
  dir: string;
  /** Manifest `name` when the manifest is readable, otherwise `null`. */
  name: string | null;
  lock: WorkspaceLockStatus;
  manifest: WorkspaceManifestStatus;
  /** `AppError.code` when `manifest` is `invalid`/`unsupported`/`missing`. */
  errorCode?: string;
  /** Manifest backups in `backups/`, newest first. */
  backups: BackupEntry[];
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
