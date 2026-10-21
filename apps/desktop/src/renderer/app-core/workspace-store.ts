/**
 * `WorkspaceStore` adapter over the typed IPC bridge (T2.1).
 *
 * The preload bridge returns `IpcResult` envelopes; app-core expects the
 * persistence port to throw typed `AppError`s. This adapter is the only place
 * that unwraps the envelope, and it never swallows an error.
 */

import { createAppError } from '@curve/domain';
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

import type { IpcResult } from '../../shared/contracts/envelope';
import type { CurveApi, RecentEntry } from '../../shared/contracts/ipc';

export function unwrapIpc<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.data;
}

export interface RendererWorkspaceStore extends WorkspaceStore {
  listRecent(): Promise<RecentEntry[]>;
}

export function createRendererWorkspaceStore(api: CurveApi): RendererWorkspaceStore {
  return {
    async create(
      request: CreateWorkspaceRequest,
    ): Promise<Awaited<ReturnType<WorkspaceStore['create']>>> {
      return unwrapIpc(await api.workspace.create(request));
    },
    async open(request: OpenWorkspaceRequest): Promise<WorkspaceOpenResult> {
      return unwrapIpc(await api.workspace.open(request));
    },
    async close(request: CloseWorkspaceRequest): Promise<OkReply> {
      return unwrapIpc(await api.workspace.close(request));
    },
    async readTable(request: TableRef): Promise<TableReadResult> {
      return unwrapIpc(await api.table.read(request));
    },
    async writeTable(request: WriteTableRequest): Promise<WriteTableResult> {
      return unwrapIpc(await api.table.write(request));
    },
    async writeManifest(request: WriteManifestRequest): Promise<OkReply> {
      return unwrapIpc(await api.manifest.write(request));
    },
    async trash(request: TableRef): Promise<OkReply> {
      return unwrapIpc(await api.table.trash(request));
    },
    // T2.1 does not expose backups in the renderer yet; T5.3 wires the UI.
    async listBackups(_request: TableRef): Promise<BackupEntry[]> {
      throw createAppError('E_UNKNOWN', 'Workspace backups are not available in this view.');
    },
    async restore(_request: RestoreBackupRequest): Promise<OkReply> {
      throw createAppError('E_UNKNOWN', 'Workspace backups are not available in this view.');
    },
    async listRecent() {
      return unwrapIpc(await api.workspace.recent());
    },
  };
}
