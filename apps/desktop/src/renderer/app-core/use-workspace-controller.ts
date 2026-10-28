/**
 * High-level workspace use cases for the renderer: create/open/close plus the
 * recent list and the native directory picker. Document changes delegate to
 * app-core's `WorkspaceActions`; this file only orchestrates IO and paths.
 */

import { useCallback, useMemo } from 'react';

import { createAppError } from '@curve/domain';
import type { AppError } from '@curve/domain';
import { joinPathLike, workspaceFolderName } from '@curve/persistence';
import type { WorkspaceInspection, WorkspaceRecoveryChoice } from '@curve/persistence';

import { useRendererCore } from './use-app-core';
import { unwrapIpc } from './workspace-store';

import type { RecentEntry } from '../../shared/contracts/ipc';

export type InspectionOutcome =
  | { readonly ok: true; readonly data: WorkspaceInspection }
  | { readonly ok: false; readonly error: AppError };

export interface WorkspaceController {
  createWorkspace(parentDir: string, name: string): Promise<AppError | null>;
  /** Read-only pre-flight; never changes the workspace on disk (T5.3). */
  inspectWorkspace(dir: string): Promise<InspectionOutcome>;
  openWorkspace(dir: string, recovery?: WorkspaceRecoveryChoice): Promise<AppError | null>;
  closeWorkspace(): Promise<AppError | null>;
  listRecent(): Promise<RecentEntry[]>;
  removeRecent(path: string): Promise<AppError | null>;
  clearRecent(): Promise<AppError | null>;
  pickDirectory(title: string, defaultPath?: string): Promise<string | null>;
}

/**
 * T2.7/ADR-033: starts the open measurement. The grid marks `curve:open-ready`
 * when the table's first frame is mounted; the perf E2E spec reads the
 * `curve:open` measure instead of click-to-assert wall time.
 */
function markOpenStart(): void {
  performance.clearMarks('curve:open-start');
  performance.clearMarks('curve:open-ready');
  performance.clearMeasures('curve:open');
  performance.mark('curve:open-start');
}

export function useWorkspaceController(): WorkspaceController {
  const { api, workspaceStore, core } = useRendererCore();

  const createWorkspace = useCallback(
    async (parentDir: string, name: string): Promise<AppError | null> => {
      if (parentDir.trim().length === 0) {
        return createAppError('E_VALIDATION', 'Choose a parent directory first.');
      }
      let workspaceId: string;
      try {
        const manifest = await workspaceStore.create({ dir: parentDir, name });
        workspaceId = manifest.id;
      } catch (thrown) {
        return thrown as AppError;
      }
      const root = joinPathLike(parentDir, workspaceFolderName(name));
      markOpenStart();
      const opened = await core.openWorkspace({ dir: root });
      if (!opened.ok) {
        await workspaceStore.close({ workspaceId }).catch(() => undefined);
        return opened.error;
      }
      return null;
    },
    [core, workspaceStore],
  );

  const inspectWorkspace = useCallback(
    async (dir: string): Promise<InspectionOutcome> => {
      try {
        return { ok: true, data: await workspaceStore.inspect({ dir }) };
      } catch (thrown) {
        return { ok: false, error: thrown as AppError };
      }
    },
    [workspaceStore],
  );

  const openWorkspace = useCallback(
    async (dir: string, recovery?: WorkspaceRecoveryChoice): Promise<AppError | null> => {
      markOpenStart();
      const opened = await core.openWorkspace({
        dir,
        ...(recovery === undefined ? {} : { recovery }),
      });
      return opened.ok ? null : opened.error;
    },
    [core],
  );

  const closeWorkspace = useCallback(async (): Promise<AppError | null> => {
    const closed = await core.actions.closeWorkspace();
    return closed.ok ? null : closed.error;
  }, [core]);

  const listRecent = useCallback(async (): Promise<RecentEntry[]> => {
    try {
      return await workspaceStore.listRecent();
    } catch {
      // A missing bridge in unit tests or a corrupt recent.json both degrade to
      // an empty list; opening still goes through `workspace.open`.
      return [];
    }
  }, [workspaceStore]);

  const removeRecent = useCallback(
    async (path: string): Promise<AppError | null> => {
      try {
        await workspaceStore.recentRemove(path);
        return null;
      } catch (thrown) {
        return thrown as AppError;
      }
    },
    [workspaceStore],
  );

  const clearRecent = useCallback(async (): Promise<AppError | null> => {
    try {
      await workspaceStore.recentClear();
      return null;
    } catch (thrown) {
      return thrown as AppError;
    }
  }, [workspaceStore]);

  const pickDirectory = useCallback(
    async (title: string, defaultPath?: string): Promise<string | null> => {
      try {
        const result = unwrapIpc(
          await api.dialog.pickDirectory({
            title,
            ...(defaultPath === undefined ? {} : { defaultPath }),
          }),
        );
        return result === null ? null : result.path;
      } catch {
        return null;
      }
    },
    [api],
  );

  return useMemo(
    () => ({
      createWorkspace,
      inspectWorkspace,
      openWorkspace,
      closeWorkspace,
      listRecent,
      removeRecent,
      clearRecent,
      pickDirectory,
    }),
    [
      clearRecent,
      closeWorkspace,
      createWorkspace,
      inspectWorkspace,
      listRecent,
      openWorkspace,
      pickDirectory,
      removeRecent,
    ],
  );
}
