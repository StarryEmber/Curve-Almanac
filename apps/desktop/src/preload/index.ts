/**
 * Preload entry. Runs in an isolated, sandboxed context; the only modules it may
 * import are `electron` and bundled, dependency-free local code (SPEC §15.4).
 */

import { contextBridge, ipcRenderer } from 'electron';

import { createCurveApi } from './api';

import type { IpcRendererEvent } from 'electron';

const api = createCurveApi(
  (channel, payload): Promise<unknown> => ipcRenderer.invoke(channel, payload),
  (channel, listener): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
      listener(payload);
    };
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
);

contextBridge.exposeInMainWorld('api', api);
