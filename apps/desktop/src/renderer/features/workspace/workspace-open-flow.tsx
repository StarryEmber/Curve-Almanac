import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { createAppError } from '@curve/domain';
import type { AppError } from '@curve/domain';
import type { WorkspaceRecoveryChoice } from '@curve/persistence';

import { useWorkspaceController } from '../../app-core/use-workspace-controller';

import { WorkspaceRecoveryDialog } from './WorkspaceRecoveryDialog';

import type { PendingRecovery } from './WorkspaceRecoveryDialog';
import type { ReactElement, ReactNode } from 'react';

export interface WorkspaceOpenFlow {
  /**
   * Opens a workspace, first running the read-only pre-flight. Returns `null`
   * when the open succeeded *or* when a recovery dialog took over.
   */
  openWorkspace(dir: string): Promise<AppError | null>;
}

const WorkspaceOpenFlowContext = createContext<WorkspaceOpenFlow | null>(null);

export function useWorkspaceOpenFlow(): WorkspaceOpenFlow {
  const value = useContext(WorkspaceOpenFlowContext);
  if (value === null) {
    throw new Error('useWorkspaceOpenFlow must be used inside <WorkspaceOpenProvider>.');
  }
  return value;
}

/**
 * Central place for "open a workspace" (T5.3).
 *
 * A pre-flight read reports the lock and manifest state without writing
 * anything. Clean workspaces open immediately; an unclean exit or a corrupt
 * manifest opens the recovery dialog instead, so the user makes the
 * "try recovery / open directly / rebuild from backup" decision exactly once
 * (SPEC §7.5).
 */
export function WorkspaceOpenProvider({ children }: { children: ReactNode }): ReactElement {
  const controller = useWorkspaceController();
  const [pending, setPending] = useState<PendingRecovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<AppError | null>(null);

  const openWorkspace = useCallback(
    async (dir: string): Promise<AppError | null> => {
      const inspected = await controller.inspectWorkspace(dir);
      if (!inspected.ok) {
        return inspected.error;
      }
      const info = inspected.data;
      if (info.lock === 'active') {
        return createAppError('E_WS_LOCKED', 'The workspace is locked by another window.');
      }
      if (info.manifest === 'unsupported') {
        return createAppError(
          'E_WS_VERSION_UNSUPPORTED',
          'The workspace was created by a newer Curve Studio version.',
        );
      }

      const needsRecovery =
        info.manifest === 'invalid' ||
        (info.manifest === 'missing' && info.backups.length > 0) ||
        info.lock === 'stale' ||
        info.lock === 'corrupt';
      if (needsRecovery) {
        setDialogError(null);
        setPending({ dir, inspection: info });
        return null;
      }
      return controller.openWorkspace(dir);
    },
    [controller],
  );

  const confirm = useCallback(
    (recovery?: WorkspaceRecoveryChoice): void => {
      if (pending === null) {
        return;
      }
      setBusy(true);
      setDialogError(null);
      void controller.openWorkspace(pending.dir, recovery).then((failure) => {
        setBusy(false);
        if (failure === null) {
          setPending(null);
          return;
        }
        setDialogError(failure);
      });
    },
    [controller, pending],
  );

  const cancel = useCallback((): void => {
    if (busy) {
      return;
    }
    setPending(null);
    setDialogError(null);
  }, [busy]);

  const value = useMemo<WorkspaceOpenFlow>(() => ({ openWorkspace }), [openWorkspace]);

  return (
    <WorkspaceOpenFlowContext.Provider value={value}>
      {children}
      <WorkspaceRecoveryDialog
        pending={pending}
        busy={busy}
        error={dialogError}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </WorkspaceOpenFlowContext.Provider>
  );
}
