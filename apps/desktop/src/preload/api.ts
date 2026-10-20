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

import { IPC_CHANNELS } from '../shared/contracts/channels';
import { isIpcResult } from '../shared/contracts/envelope';

import type { IpcResult } from '../shared/contracts/envelope';
import type {
  AppInfo,
  CurveApi,
  LogWriteRequest,
  ManifestWriteRequest,
  OkReply,
  RecentEntry,
  WorkspaceCloseRequest,
  WorkspaceCreateRequest,
  WorkspaceManifest,
  WorkspaceOpenRequest,
  WorkspaceOpenResult,
} from '../shared/contracts/ipc';

/** Mirrors `ipcRenderer.invoke` without importing Electron. */
export type InvokeFn = (channel: string, payload?: unknown) => Promise<unknown>;

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

export function createCurveApi(invoke: InvokeFn): CurveApi {
  return {
    app: {
      info: (): Promise<IpcResult<AppInfo>> => call<AppInfo>(invoke, IPC_CHANNELS.appInfo),
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
      close: (request: WorkspaceCloseRequest): Promise<IpcResult<OkReply>> =>
        call<OkReply>(invoke, IPC_CHANNELS.workspaceClose, request),
      recent: (): Promise<IpcResult<RecentEntry[]>> =>
        call<RecentEntry[]>(invoke, IPC_CHANNELS.workspaceRecent),
    },
    manifest: {
      write: (request: ManifestWriteRequest): Promise<IpcResult<OkReply>> =>
        call<OkReply>(invoke, IPC_CHANNELS.manifestWrite, request),
    },
  };
}
