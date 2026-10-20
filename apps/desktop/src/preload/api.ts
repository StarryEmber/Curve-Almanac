/**
 * Builds the `window.api` object. Kept free of Electron imports so the
 * preload bridge can be unit tested with a fake `invoke`.
 *
 * Only whitelisted methods are exposed; `ipcRenderer` itself must never cross
 * the context bridge (AGENTS §2.1).
 */

import {
  IPC_CHANNELS,
  isIpcResult,
  type AppInfo,
  type CurveApi,
  type IpcResult,
} from '../shared/ipc';

/** Mirrors `ipcRenderer.invoke` without importing Electron. */
export type InvokeFn = (channel: string) => Promise<unknown>;

const MALFORMED_RESPONSE = {
  ok: false,
  error: {
    code: 'E_UNKNOWN',
    message: 'The main process returned a malformed response.',
  },
} as const satisfies IpcResult<never>;

export function createCurveApi(invoke: InvokeFn): CurveApi {
  return {
    app: {
      info: async (): Promise<IpcResult<AppInfo>> => {
        const response = await invoke(IPC_CHANNELS.appInfo);
        return isIpcResult<AppInfo>(response) ? response : MALFORMED_RESPONSE;
      },
    },
  };
}
