import type { CurveApi } from '../shared/ipc';

declare global {
  interface Window {
    /** Exposed by the preload bridge; see src/preload/api.ts. */
    api: CurveApi;
  }
}

export {};
