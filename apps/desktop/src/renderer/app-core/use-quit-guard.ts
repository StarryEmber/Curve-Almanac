import { useEffect } from 'react';

import { useUnsavedChangesGuard } from '../features/workspace/unsaved-changes';

import { useRendererCore } from './use-app-core';

/**
 * Answers the main-process quit handshake (T5.3, SPEC §13.3).
 *
 * Main cannot flush the renderer-side save queue itself. On
 * `app:quit-requested` this hook flushes the queue (bounded by the queue's 3s
 * timeout) and reports whether the flush succeeded; on failure the main process
 * shows the native "quit anyway?" confirmation instead of hanging.
 *
 * T5.5: when autosave is off and the document is dirty the user chooses
 * Save / Discard / Cancel first. "Save" takes the T5.3 flush path; "Discard"
 * releases the workspace handle without writing; "Cancel" answers the main
 * process with `action: 'cancel'` so the window stays open.
 */
export function useQuitGuard(): void {
  const { api, core } = useRendererCore();
  const unsavedChanges = useUnsavedChangesGuard();

  useEffect(() => {
    const unsubscribe = api.app.onQuitRequested(() => {
      void (async () => {
        const workspace = core.store.getState().workspace;
        const choice = await unsavedChanges.request('quit');
        if (choice === 'cancel') {
          try {
            await api.app.respondToQuit({ action: 'cancel', flushed: true });
          } catch {
            // Main may already be gone; the window simply stays open.
          }
          return;
        }

        // "Discard" is a handled exit (the user abandoned the changes), so main
        // must not show its native confirmation. Only a failed save does.
        let flushed = choice === 'discard';
        if (choice === 'save') {
          try {
            const outcome = await core.actions.flushSaves();
            flushed = outcome.ok;
          } catch {
            flushed = false;
          }
        }
        if (workspace !== null && (choice === 'discard' || flushed)) {
          // A clean exit must not leave a stale `.lock` behind (SPEC §7.5).
          // Discarding also releases the lock: the user explicitly abandoned the
          // in-memory changes. A failed flush deliberately keeps the lock so the
          // next launch reports "did not exit normally" (ADR-048).
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
  }, [api, core, unsavedChanges]);
}
