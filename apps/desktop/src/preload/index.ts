/**
 * Preload entry. Runs in an isolated, sandboxed context; the only modules it may
 * import are `electron` and bundled, dependency-free local code (SPEC §15.4).
 */

import { contextBridge, ipcRenderer } from 'electron';

import { createCurveApi } from './api';

const api = createCurveApi((channel, payload): Promise<unknown> =>
  ipcRenderer.invoke(channel, payload),
);

contextBridge.exposeInMainWorld('api', api);
