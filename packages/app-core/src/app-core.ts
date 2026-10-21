import type { UuidFactory, TableMeta } from '@curve/domain';
import type { WorkspaceStore } from '@curve/persistence';
import type { JsonlDecodeResult } from '@curve/table-engine';

import { createCommandBus } from './commands/bus';
import { createTableCellSetCommand } from './commands/table-cell-set';
import {
  createTableCreateCommand,
  createTableDeleteCommand,
  createTableMetaUpdateCommand,
} from './commands/tables';
import {
  createViewCreateCommand,
  createViewDeleteCommand,
  createViewLayoutCommand,
  createViewUpdateCommand,
} from './commands/views';
import { defaultAppLogger } from './logging';
import { createAppStore } from './state/store';
import { createOpenWorkspace } from './usecases/open-workspace';
import { createWorkspaceActions } from './usecases/workspace-actions';

import type { CommandBus } from './commands/types';
import type { AppLogger } from './logging';
import type { AppStore } from './state/types';
import type { OpenWorkspace } from './usecases/open-workspace';
import type { WorkspaceActions } from './usecases/workspace-actions';

export interface CreateAppCoreOptions {
  /** Injected persistence port (FileWorkspaceStore or MemoryWorkspaceStore). */
  workspaceStore: WorkspaceStore;
  logger?: AppLogger;
  /** Injected clock for command timestamps and dirty-table markers. */
  now?: () => Date;
  /** Injected id source; production uses `crypto.randomUUID()`. */
  uuid?: UuidFactory;
  /** Async table decoder (renderer Worker); omitted means inline decode. */
  decodeTable?: (jsonl: string, table: TableMeta) => Promise<JsonlDecodeResult>;
}

export interface AppCore {
  readonly store: AppStore;
  readonly commands: CommandBus;
  readonly openWorkspace: OpenWorkspace;
  readonly actions: WorkspaceActions;
}

/**
 * Composition root for app-core.
 *
 * The renderer builds one instance with `window.api`-backed stores and the
 * table Worker; tests build the same object with fakes. T2.1 adds the table and
 * view commands plus the explicit-manifest-save actions (ADR-027).
 */
export function createAppCore(options: CreateAppCoreOptions): AppCore {
  const logger = options.logger ?? defaultAppLogger;
  const now = options.now ?? ((): Date => new Date());
  const store = createAppStore({ now: () => now().getTime() });
  const commands = createCommandBus(store, { logger });
  const commandOptions = {
    now,
    ...(options.uuid === undefined ? {} : { uuid: options.uuid }),
  };

  commands.register(createTableCellSetCommand({ now }));
  commands.register(createTableCreateCommand(commandOptions));
  commands.register(createTableDeleteCommand(commandOptions));
  commands.register(createTableMetaUpdateCommand(commandOptions));
  commands.register(createViewCreateCommand({ now }));
  commands.register(createViewDeleteCommand({ now }));
  commands.register(createViewUpdateCommand({ now }));
  commands.register(createViewLayoutCommand({ now }));

  const openWorkspace = createOpenWorkspace({
    store: options.workspaceStore,
    appStore: store,
    logger,
    ...(options.decodeTable === undefined ? {} : { decodeTable: options.decodeTable }),
  });

  const actions = createWorkspaceActions({
    store,
    commands,
    workspaceStore: options.workspaceStore,
    logger,
    now,
    ...(options.uuid === undefined ? {} : { uuid: options.uuid }),
  });

  return { store, commands, openWorkspace, actions };
}
