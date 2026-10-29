/**
 * The channels wired so far: app/log (T0.3), workspace/manifest (T1.2) and
 * table data (T1.3).
 *
 * Each handler is a thin adapter over an injected dependency so it can be unit
 * tested without Electron (see handlers.test.ts). Table bytes never reach the
 * renderer through this layer: `table:read` returns the JSONL document and the
 * Worker decodes it.
 */

import type { WorkspaceStore } from '@curve/persistence';

import { IPC_CHANNELS } from '../../shared/contracts/channels';
import {
  appInfoRequestSchema,
  appInfoResponseSchema,
  appSettingsRequestSchema,
  appSettingsResponseSchema,
  appSettingsUpdateRequestSchema,
  archiveImportRequestSchema,
  archiveImportResponseSchema,
  exportCsvRequestSchema,
  exportCsvResponseSchema,
  exportTextRequestSchema,
  exportTextResponseSchema,
  importTextRequestSchema,
  importTextResponseSchema,
  logWriteRequestSchema,
  logWriteResponseSchema,
  manifestWriteRequestSchema,
  manifestWriteResponseSchema,
  okReplySchema,
  pickDirectoryRequestSchema,
  pickDirectoryResponseSchema,
  quitResponseRequestSchema,
  quitResponseResponseSchema,
  tableReadRequestSchema,
  tableReadResponseSchema,
  tableTrashRequestSchema,
  tableTrashResponseSchema,
  tableWriteRequestSchema,
  tableWriteResponseSchema,
  workspaceCloseRequestSchema,
  workspaceCloseResponseSchema,
  workspaceCreateRequestSchema,
  workspaceCreateResponseSchema,
  workspaceInspectRequestSchema,
  workspaceInspectResponseSchema,
  workspaceOpenRequestSchema,
  workspaceOpenResponseSchema,
  workspaceRecentClearRequestSchema,
  workspaceRecentRemoveRequestSchema,
  workspaceRecentRequestSchema,
  workspaceRecentResponseSchema,
} from '../../shared/contracts/ipc';
import { normalizeLogLevel } from '../logger';

import type {
  AppInfo,
  AppSettings,
  ArchiveImportReply,
  ArchiveImportRequest,
  ExportCsvReply,
  ExportCsvRequest,
  ExportTextReply,
  ExportTextRequest,
  ImportTextReply,
  ImportTextRequest,
  OkReply,
  PickDirectoryRequest,
  PickDirectoryResult,
  QuitResponseRequest,
  RecentEntry,
  RecentRemoveRequest,
  WorkspaceInspectRequest,
  WorkspaceInspection,
} from '../../shared/contracts/ipc';
import type { Logger } from '../logger';
import type { IpcRegistrar } from './register';

export interface RegisterIpcHandlersOptions {
  registrar: IpcRegistrar;
  logger: Logger;
  /** Injected so tests can answer without an Electron `app` module. */
  getAppInfo: () => AppInfo;
  /** Reads the in-memory settings loaded from `userData/settings.json`. */
  getAppSettings: () => AppSettings;
  /** Persists a complete settings document and returns the normalised value. */
  updateAppSettings: (settings: AppSettings) => Promise<AppSettings>;
  /** Injected so tests can answer without Electron's native dialog. */
  pickDirectory: (request: PickDirectoryRequest) => Promise<PickDirectoryResult | null>;
  readImportFile: (request: ImportTextRequest) => Promise<ImportTextReply | null>;
  exportTextFile: (request: ExportTextRequest) => Promise<ExportTextReply | null>;
  exportCsv: (request: ExportCsvRequest) => Promise<ExportCsvReply | null>;
  archiveImport: (request: ArchiveImportRequest) => Promise<ArchiveImportReply>;
  workspaceStore: WorkspaceStore;
  listRecentWorkspaces: () => Promise<RecentEntry[]>;
  inspectWorkspace: (request: WorkspaceInspectRequest) => Promise<WorkspaceInspection>;
  removeRecentWorkspace: (request: RecentRemoveRequest) => Promise<OkReply>;
  clearRecentWorkspaces: () => Promise<OkReply>;
  /** Main-process quit guard; the renderer answers after flushing (T5.3). */
  respondToQuit: (request: QuitResponseRequest) => OkReply;
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const { registrar, logger, workspaceStore } = options;

  registrar.handle(
    IPC_CHANNELS.appInfo,
    { request: appInfoRequestSchema, response: appInfoResponseSchema },
    () => options.getAppInfo(),
  );

  registrar.handle(
    IPC_CHANNELS.appSettings,
    { request: appSettingsRequestSchema, response: appSettingsResponseSchema },
    () => options.getAppSettings(),
  );

  registrar.handle(
    IPC_CHANNELS.appSettingsUpdate,
    { request: appSettingsUpdateRequestSchema, response: appSettingsResponseSchema },
    (request) => options.updateAppSettings(request.settings),
  );

  registrar.handle(
    IPC_CHANNELS.dialogPickDirectory,
    { request: pickDirectoryRequestSchema, response: pickDirectoryResponseSchema },
    (request) => options.pickDirectory(request),
  );

  registrar.handle(
    IPC_CHANNELS.logWrite,
    { request: logWriteRequestSchema, response: logWriteResponseSchema },
    (request): OkReply => {
      // Renderer diagnostics are prefixed so they are distinguishable from
      // main-process log lines. The renderer owns what it puts in `detail`.
      logger[normalizeLogLevel(request.level)](`[renderer] ${request.message}`, request.detail);
      return { ok: true };
    },
  );

  registrar.handle(
    IPC_CHANNELS.workspaceCreate,
    { request: workspaceCreateRequestSchema, response: workspaceCreateResponseSchema },
    (request) => workspaceStore.create(request),
  );

  registrar.handle(
    IPC_CHANNELS.workspaceOpen,
    { request: workspaceOpenRequestSchema, response: workspaceOpenResponseSchema },
    (request) => workspaceStore.open(request),
  );

  registrar.handle(
    IPC_CHANNELS.workspaceClose,
    { request: workspaceCloseRequestSchema, response: workspaceCloseResponseSchema },
    (request) => workspaceStore.close(request),
  );

  registrar.handle(
    IPC_CHANNELS.workspaceRecent,
    { request: workspaceRecentRequestSchema, response: workspaceRecentResponseSchema },
    () => options.listRecentWorkspaces(),
  );

  registrar.handle(
    IPC_CHANNELS.workspaceInspect,
    { request: workspaceInspectRequestSchema, response: workspaceInspectResponseSchema },
    (request) => options.inspectWorkspace(request),
  );

  registrar.handle(
    IPC_CHANNELS.workspaceRecentRemove,
    { request: workspaceRecentRemoveRequestSchema, response: okReplySchema },
    (request) => options.removeRecentWorkspace(request),
  );

  registrar.handle(
    IPC_CHANNELS.workspaceRecentClear,
    { request: workspaceRecentClearRequestSchema, response: okReplySchema },
    () => options.clearRecentWorkspaces(),
  );

  registrar.handle(
    IPC_CHANNELS.appQuitResponse,
    { request: quitResponseRequestSchema, response: quitResponseResponseSchema },
    (request) => options.respondToQuit(request),
  );

  registrar.handle(
    IPC_CHANNELS.manifestWrite,
    { request: manifestWriteRequestSchema, response: manifestWriteResponseSchema },
    (request) => workspaceStore.writeManifest(request),
  );

  // SPEC §15.1: only ids cross the boundary; paths are resolved inside the
  // store. Size and row limits are enforced by the store before it writes.
  registrar.handle(
    IPC_CHANNELS.tableRead,
    { request: tableReadRequestSchema, response: tableReadResponseSchema },
    (request) => workspaceStore.readTable(request),
  );

  registrar.handle(
    IPC_CHANNELS.tableWrite,
    { request: tableWriteRequestSchema, response: tableWriteResponseSchema },
    (request) => workspaceStore.writeTable(request),
  );

  // Moves the file only; the caller updates the manifest (T2.1 delete flow).
  registrar.handle(
    IPC_CHANNELS.tableTrash,
    { request: tableTrashRequestSchema, response: tableTrashResponseSchema },
    (request) => workspaceStore.trash(request),
  );

  registrar.handle(
    IPC_CHANNELS.fileImportText,
    { request: importTextRequestSchema, response: importTextResponseSchema },
    (request) => options.readImportFile(request),
  );

  registrar.handle(
    IPC_CHANNELS.fileExportText,
    { request: exportTextRequestSchema, response: exportTextResponseSchema },
    (request) => options.exportTextFile(request),
  );

  registrar.handle(
    IPC_CHANNELS.fileExportCsv,
    { request: exportCsvRequestSchema, response: exportCsvResponseSchema },
    (request) => options.exportCsv(request),
  );

  registrar.handle(
    IPC_CHANNELS.fileArchiveImport,
    { request: archiveImportRequestSchema, response: archiveImportResponseSchema },
    (request) => options.archiveImport(request),
  );
}
