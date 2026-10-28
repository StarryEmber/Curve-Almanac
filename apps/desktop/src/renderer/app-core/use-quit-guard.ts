import { useEffect } from 'react';

import { useRendererCore } from './use-app-core';

/**
 * Answers the main-process quit handshake (T5.3, SPEC §13.3).
 *
 * Main cannot flush the renderer-side save queue itself. On
 * `app:quit-requested` this hook flushes the queue (bounded by the queue's 3s
 * timeout) and reports whether the flush succeeded; on failure the main process
 * shows the native "quit anyway?" confirmation instead of hanging.
 */
export function useQuitGuard(): void {
  const { api, core } = useRendererCore();

  useEffect(() => {
    const unsubscribe = api.app.onQuitRequested(() => {
      void (async () => {
        const workspace = core.store.getState().workspace;
        let flushed = false;
        try {
          const outcome = await core.actions.flushSaves();
          flushed = outcome.ok;
        } catch {
          flushed = false;
        }
        if (flushed && workspace !== null) {
          // A clean exit must not leave a stale `.lock` behind (SPEC §7.5), so
          // release the main-process handle after the data is safely on disk.
          // A failed flush deliberately keeps the lock: the next launch should
          // report "did not exit normally" (ADR-048).
          try {
            await api.workspace.close({ workspaceId: workspace.id });
          } catch {
            // Losing the lock cleanup only adds a stale-lock warning next time.
          }
        }
        try {
          await api.app.respondToQuit({ action: 'quit', flushed });
        } catch {
          // The main process may already be gone (crash/force-quit); there is
          // nothing useful to do in the renderer at that point.
        }
      })();
    });
    return unsubscribe;
  }, [api, core]);
}
