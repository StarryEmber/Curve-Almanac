import type { UuidFactory, TableMeta } from '@curve/domain';
import type { WorkspaceStore } from '@curve/persistence';
import type { JsonlDecodeResult } from '@curve/table-engine';

import { createCommandBus } from './commands/bus';
import {
  createChartCreateCommand,
  createChartDeleteCommand,
  createChartUpdateCommand,
} from './commands/charts';
import {
  createColumnAddCommand,
  createColumnDeleteCommand,
  createColumnReorderCommand,
  createColumnUpdateCommand,
} from './commands/columns';
import { createImportCommand } from './commands/import';
import { createPasteCommand } from './commands/paste';
import { createRowInsertCommand } from './commands/rows';
import {
  createStyleApplyCommand,
  createStyleCreateCommand,
  createStyleDeleteCommand,
  createStyleUpdateCommand,
} from './commands/styles';
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
import type {
  ImportArchiveRequest,
  ImportArchiveResult,
  WorkspaceActions,
} from './usecases/workspace-actions';

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
  /** Archive writer for imported source files (main-process IPC adapter). */
  archiveImport?: (request: ImportArchiveRequest) => Promise<ImportArchiveResult>;
}

export interface AppCore {
  readonly store: AppStore;
  readonly commands: CommandBus;
  readonly openWorkspace: OpenWorkspace;
  readonly actions: WorkspaceActions;
  readonly history: EditHistory;
}

/**
 * The table a committed row command changed, used to enqueue its save.
 * Cell edits, pastes and explicit row inserts write table data; structural
 * commands either write the manifest themselves or do not touch rows.
 */
const ROW_SAVING_COMMANDS = new Set([
  'table.cell.set',
  'table.paste',
  'table.import',
  'table.rows.insert',
]);

/** Manifest-only document commands (no table JSONL to write). */
const MANIFEST_SAVING_COMMANDS = new Set([
  'style.create',
  'style.update',
  'style.delete',
  'style.apply',
  'chart.create',
  'chart.update',
  'chart.delete',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function changedTableId(result: CommandResult): string | null {
  if (!ROW_SAVING_COMMANDS.has(result.name) || result.patches.length === 0) {
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
    onWorkspaceChanged: () => {
      saveQueue.enqueueManifest();
    },
  });
  const commands = createCommandBus(store, {
    logger,
    onCommand: (result) => {
      history.record(result);
      const tableId = changedTableId(result);
      if (tableId !== null) {
        saveQueue.enqueue(tableId);
      } else if (result.patches.length > 0 && MANIFEST_SAVING_COMMANDS.has(result.name)) {
        saveQueue.enqueueManifest();
      }
    },
  });
  const commandOptions = {
    now,
    ...(options.uuid === undefined ? {} : { uuid: options.uuid }),
  };

  commands.register(createTableCellSetCommand({ now }));
  commands.register(createPasteCommand(commandOptions));
  commands.register(createImportCommand(commandOptions));
  commands.register(createRowInsertCommand(commandOptions));
  commands.register(createStyleCreateCommand(commandOptions));
  commands.register(createStyleUpdateCommand(commandOptions));
  commands.register(createStyleDeleteCommand(commandOptions));
  commands.register(createStyleApplyCommand(commandOptions));
  commands.register(createChartCreateCommand(commandOptions));
  commands.register(createChartUpdateCommand(commandOptions));
  commands.register(createChartDeleteCommand(commandOptions));
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
    ...(options.archiveImport === undefined ? {} : { archiveImport: options.archiveImport }),
  });

  return { store, commands, openWorkspace, actions, history };
}
