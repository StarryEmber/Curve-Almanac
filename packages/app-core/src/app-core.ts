import type { WorkspaceStore } from '@curve/persistence';

import { createCommandBus } from './commands/bus';
import { createTableCellSetCommand } from './commands/table-cell-set';
import { defaultAppLogger } from './logging';
import { createAppStore } from './state/store';
import { createOpenWorkspace } from './usecases/open-workspace';

import type { CommandBus } from './commands/types';
import type { AppLogger } from './logging';
import type { AppStore } from './state/types';
import type { OpenWorkspace } from './usecases/open-workspace';

export interface CreateAppCoreOptions {
  /** Injected persistence port (FileWorkspaceStore or MemoryWorkspaceStore). */
  workspaceStore: WorkspaceStore;
  logger?: AppLogger;
  /** Injected clock for command timestamps and dirty-table markers. */
  now?: () => Date;
}

export interface AppCore {
  readonly store: AppStore;
  readonly commands: CommandBus;
  readonly openWorkspace: OpenWorkspace;
}

/**
 * Composition root for app-core.
 *
 * T2.1 will build the same object with the renderer's `window.api`-backed
 * `WorkspaceStore`; T1.5 stays free of Electron/React imports.
 */
export function createAppCore(options: CreateAppCoreOptions): AppCore {
  const logger = options.logger ?? defaultAppLogger;
  const now = options.now ?? ((): Date => new Date());
  const store = createAppStore({ now: () => now().getTime() });
  const commands = createCommandBus(store, { logger });
  commands.register(createTableCellSetCommand({ now }));
  const openWorkspace = createOpenWorkspace({
    store: options.workspaceStore,
    appStore: store,
    logger,
  });

  return { store, commands, openWorkspace };
}
