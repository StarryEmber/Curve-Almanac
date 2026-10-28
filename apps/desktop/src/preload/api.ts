/**
 * Builds the `window.api` object. Kept free of Electron imports so the
 * preload bridge can be unit tested with a fake `invoke`.
 *
 * Only whitelisted methods are exposed; `ipcRenderer` itself must never cross
 * the context bridge (AGENTS §2.1). No Zod here: `sandbox: true` means the
 * preload may not load packages from `dependencies` (SPEC §15.4), so the
 * envelope is narrowed by hand and the payloads are validated in the main
 * process and again in the renderer client.
 */

import { IPC_CHANNELS, IPC_EVENT_CHANNELS } from '../shared/contracts/channels';
import { isIpcResult } from '../shared/contracts/envelope';

import type { IpcResult } from '../shared/contracts/envelope';
import type {
  AppInfo,
  ArchiveImportReply,
  ArchiveImportRequest,
  CurveApi,
  ExportCsvReply,
  ExportCsvRequest,
  ExportTextReply,
  ExportTextRequest,
  ImportTextReply,
  ImportTextRequest,
  LogWriteRequest,
  ManifestWriteRequest,
  OkReply,
  PickDirectoryRequest,
  PickDirectoryResult,
  QuitRequest,
  QuitResponseRequest,
  RecentEntry,
  RecentRemoveRequest,
  TableReadReply,
  TableRefRequest,
  TableWriteReply,
  TableWriteRequest,
  WorkspaceCloseRequest,
  WorkspaceCreateRequest,
  WorkspaceInspectRequest,
  WorkspaceInspection,
  WorkspaceManifest,
  WorkspaceOpenRequest,
  WorkspaceOpenResult,
} from '../shared/contracts/ipc';

/** Mirrors `ipcRenderer.invoke` without importing Electron. */
export type InvokeFn = (channel: string, payload?: unknown) => Promise<unknown>;

/** Mirrors the narrow `ipcRenderer.on` subscription the preload exposes. */
export type SubscribeFn = (channel: string, listener: (payload: unknown) => void) => () => void;

function isQuitRequest(value: unknown): value is QuitRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const reason = (value as { reason?: unknown }).reason;
  return reason === 'window-close' || reason === 'app-quit';
}

const MALFORMED_RESPONSE: IpcResult<never> = {
  ok: false,
  error: {
    code: 'E_UNKNOWN',
    message: 'The main process returned a malformed response.',
  },
};

async function call<TResponse>(
  invoke: InvokeFn,
  channel: string,
  payload?: unknown,
): Promise<IpcResult<TResponse>> {
  const response = await invoke(channel, payload);
  return isIpcResult<TResponse>(response) ? response : MALFORMED_RESPONSE;
}

export function createCurveApi(invoke: InvokeFn, subscribe?: SubscribeFn): CurveApi {
  return {
    app: {
      info: (): Promise<IpcResult<AppInfo>> => call<AppInfo>(invoke, IPC_CHANNELS.appInfo),
      onQuitRequested: (handler: (request: QuitRequest) => void): (() => void) => {
        if (subscribe === undefined) {
          return () => undefined;
        }
        return subscribe(IPC_EVENT_CHANNELS.appQuitRequested, (payload) => {
          if (isQuitRequest(payload)) {
            handler(payload);
          }
        });
      },
      respondToQuit: (request: QuitResponseRequest): Promise<IpcResult<OkReply>> =>
        call<OkReply>(invoke, IPC_CHANNELS.appQuitResponse, request),
    },
    dialog: {
      pickDirectory: (
        request: PickDirectoryRequest,
      ): Promise<IpcResult<PickDirectoryResult | null>> =>
        call<PickDirectoryResult | null>(invoke, IPC_CHANNELS.dialogPickDirectory, request),
    },
    log: {
      write: (request: LogWriteRequest): Promise<IpcResult<OkReply>> =>
        call<OkReply>(invoke, IPC_CHANNELS.logWrite, request),
    },
    workspace: {
      create: (request: WorkspaceCreateRequest): Promise<IpcResult<WorkspaceManifest>> =>
        call<WorkspaceManifest>(invoke, IPC_CHANNELS.workspaceCreate, request),
      open: (request: WorkspaceOpenRequest): Promise<IpcResult<WorkspaceOpenResult>> =>
        call<WorkspaceOpenResult>(invoke, IPC_CHANNELS.workspaceOpen, request),
      inspect: (request: WorkspaceInspectRequest): Promise<IpcResult<WorkspaceInspection>> =>
        call<WorkspaceInspection>(invoke, IPC_CHANNELS.workspaceInspect, request),
      close: (request: WorkspaceCloseRequest): Promise<IpcResult<OkReply>> =>
        call<OkReply>(invoke, IPC_CHANNELS.workspaceClose, request),
      recent: (): Promise<IpcResult<RecentEntry[]>> =>
        call<RecentEntry[]>(invoke, IPC_CHANNELS.workspaceRecent),
      recentRemove: (request: RecentRemoveRequest): Promise<IpcResult<OkReply>> =>
        call<OkReply>(invoke, IPC_CHANNELS.workspaceRecentRemove, request),
      recentClear: (): Promise<IpcResult<OkReply>> =>
        call<OkReply>(invoke, IPC_CHANNELS.workspaceRecentClear),
    },
    manifest: {
      write: (request: ManifestWriteRequest): Promise<IpcResult<OkReply>> =>
        call<OkReply>(invoke, IPC_CHANNELS.manifestWrite, request),
    },
    table: {
      read: (request: TableRefRequest): Promise<IpcResult<TableReadReply>> =>
        call<TableReadReply>(invoke, IPC_CHANNELS.tableRead, request),
      write: (request: TableWriteRequest): Promise<IpcResult<TableWriteReply>> =>
        call<TableWriteReply>(invoke, IPC_CHANNELS.tableWrite, request),
      trash: (request: TableRefRequest): Promise<IpcResult<OkReply>> =>
        call<OkReply>(invoke, IPC_CHANNELS.tableTrash, request),
    },
    file: {
      importText: (request: ImportTextRequest): Promise<IpcResult<ImportTextReply | null>> =>
        call<ImportTextReply | null>(invoke, IPC_CHANNELS.fileImportText, request),
      exportText: (request: ExportTextRequest): Promise<IpcResult<ExportTextReply | null>> =>
        call<ExportTextReply | null>(invoke, IPC_CHANNELS.fileExportText, request),
      exportCsv: (request: ExportCsvRequest): Promise<IpcResult<ExportCsvReply | null>> =>
        call<ExportCsvReply | null>(invoke, IPC_CHANNELS.fileExportCsv, request),
      archiveImport: (request: ArchiveImportRequest): Promise<IpcResult<ArchiveImportReply>> =>
        call<ArchiveImportReply>(invoke, IPC_CHANNELS.fileArchiveImport, request),
    },
  };
}
