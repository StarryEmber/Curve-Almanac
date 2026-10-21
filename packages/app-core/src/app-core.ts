import type { UuidFactory, TableMeta } from '@curve/domain';
import type { WorkspaceStore } from '@curve/persistence';
import type { JsonlDecodeResult } from '@curve/table-engine';

import { createCommandBus } from './commands/bus';
import {
  createColumnAddCommand,
  createColumnDeleteCommand,
  createColumnReorderCommand,
  createColumnUpdateCommand,
} from './commands/columns';
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
import { createEditHistory } from './history/edit-history';
import { defaultAppLogger } from './logging';
import { createAppStore } from './state/store';
import { createOpenWorkspace } from './usecases/open-workspace';
import { createSaveQueue } from './usecases/save-queue';
import { createWorkspaceActions } from './usecases/workspace-actions';

import type { CommandBus, CommandResult } from './commands/types';
import type { EditHistory } from './history/edit-history';
import type { AppLogger } from './logging';
import type { AppStore } from './state/types';
import type { OpenWorkspace } from './usecases/open-workspace';
import type { EncodeTable } from './usecases/save-queue';
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
  /** Async table encoder (renderer Worker); omitted means inline encode. */
  encodeTable?: EncodeTable;
}

export interface AppCore {
  readonly store: AppStore;
  readonly commands: CommandBus;
  readonly openWorkspace: OpenWorkspace;
  readonly actions: WorkspaceActions;
  readonly history: EditHistory;
}

/**
 * The table a committed `table.cell.set` changed, used to enqueue its save.
 * Other commands either write the manifest themselves or do not touch rows.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function changedTableId(result: CommandResult): string | null {
  if (result.name !== 'table.cell.set' || result.patches.length === 0) {
    return null;
  }
  const payload = result.payload;
  if (!isRecord(payload)) {
    return null;
  }
  const tableId = payload['tableId'];
  return typeof tableId === 'string' ? tableId : null;
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
  const saveQueue = createSaveQueue({
    store,
    workspaceStore: options.workspaceStore,
    logger,
    ...(options.encodeTable === undefined ? {} : { encodeTable: options.encodeTable }),
  });
  const history = createEditHistory({
    store,
    now: () => now().getTime(),
    onChanged: (tableId) => {
      store.getState().actions.markDirty(tableId);
      saveQueue.enqueue(tableId);
    },
  });
  const commands = createCommandBus(store, {
    logger,
    onCommand: (result) => {
      history.record(result);
      const tableId = changedTableId(result);
      if (tableId !== null) {
        saveQueue.enqueue(tableId);
      }
    },
  });
  const commandOptions = {
    now,
    ...(options.uuid === undefined ? {} : { uuid: options.uuid }),
  };

  commands.register(createTableCellSetCommand({ now }));
  commands.register(createColumnAddCommand({ now }));
  commands.register(createColumnUpdateCommand({ now }));
  commands.register(createColumnDeleteCommand({ now }));
  commands.register(createColumnReorderCommand({ now }));
  commands.register(createTableCreateCommand(commandOptions));
  commands.register(createTableDeleteCommand(commandOptions));
  commands.register(createTableMetaUpdateCommand(commandOptions));
  commands.register(createViewCreateCommand({ now }));
  commands.register(createViewDeleteCommand({ now }));
  commands.register(createViewUpdateCommand({ now }));
  commands.register(createViewLayoutCommand({ now }));

  const openBase = createOpenWorkspace({
    store: options.workspaceStore,
    appStore: store,
    logger,
    ...(options.decodeTable === undefined ? {} : { decodeTable: options.decodeTable }),
  });
  const openWorkspace: OpenWorkspace = async (request) => {
    const outcome = await openBase(request);
    if (outcome.ok) {
      history.clear();
      saveQueue.reset();
    }
    return outcome;
  };

  const actions = createWorkspaceActions({
    store,
    commands,
    workspaceStore: options.workspaceStore,
    history,
    saveQueue,
    logger,
    now,
    ...(options.uuid === undefined ? {} : { uuid: options.uuid }),
  });

  return { store, commands, openWorkspace, actions, history };
}
