/**
 * Renderer-side IPC client.
 *
 * The preload bridge is a dumb pipe, so this layer re-validates both directions
 * (AGENTS §2.1: payloads are checked in main *and* renderer) and turns every
 * failure into an `IpcResult` envelope — the UI never sees a rejected promise or
 * a stack trace.
 */

import {
  appInfoResponseSchema,
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
  quitRequestSchema,
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
  workspaceRecentResponseSchema,
} from '../shared/contracts/ipc';

import type { IpcResult } from '../shared/contracts/envelope';
import type {
  ArchiveImportReply,
  ArchiveImportRequest,
  CurveApi,
  ExportCsvReply,
  ExportCsvRequest,
  ExportTextReply,
  ExportTextRequest,
  ImportTextReply,
  ImportTextRequest,
  LogWriteRequest,
  ManifestWriteRequest,
  OkReply,
  PickDirectoryRequest,
  PickDirectoryResult,
  QuitRequest,
  QuitResponseRequest,
  RecentEntry,
  RecentRemoveRequest,
  TableReadReply,
  TableRefRequest,
  TableWriteReply,
  TableWriteRequest,
  WorkspaceCloseRequest,
  WorkspaceCreateRequest,
  WorkspaceInspectRequest,
  WorkspaceInspection,
  WorkspaceManifest,
  WorkspaceOpenRequest,
  WorkspaceOpenResult,
} from '../shared/contracts/ipc';
import type { z } from 'zod';

const BRIDGE_UNAVAILABLE: IpcResult<never> = {
  ok: false,
  error: { code: 'E_UNKNOWN', message: 'The preload bridge is unavailable.' },
};

const BRIDGE_FAILED: IpcResult<never> = {
  ok: false,
  error: { code: 'E_UNKNOWN', message: 'The main process did not answer.' },
};

const MALFORMED_RESPONSE: IpcResult<never> = {
  ok: false,
  error: {
    code: 'E_UNKNOWN',
    message: 'The main process returned a malformed response.',
  },
};

const INVALID_REQUEST: IpcResult<never> = {
  ok: false,
  error: { code: 'E_VALIDATION', message: 'The request payload is invalid.' },
};

async function call<TResponse>(
  schema: z.ZodType<TResponse, unknown>,
  run: () => Promise<IpcResult<unknown>>,
): Promise<IpcResult<TResponse>> {
  let result: IpcResult<unknown>;
  try {
    result = await run();
  } catch {
    return BRIDGE_FAILED;
  }
  if (!result.ok) {
    return result;
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    return MALFORMED_RESPONSE;
  }
  return { ok: true, data: parsed.data };
}

function unavailable<TResponse>(): Promise<IpcResult<TResponse>> {
  return Promise.resolve(BRIDGE_UNAVAILABLE);
}

export function createApiClient(bridge: CurveApi | undefined): CurveApi {
  if (!bridge) {
    return {
      app: {
        info: unavailable,
        onQuitRequested: () => () => undefined,
        respondToQuit: unavailable,
      },
      dialog: { pickDirectory: unavailable },
      log: { write: unavailable },
      workspace: {
        create: unavailable,
        open: unavailable,
        inspect: unavailable,
        close: unavailable,
        recent: unavailable,
        recentRemove: unavailable,
        recentClear: unavailable,
      },
      manifest: { write: unavailable },
      table: { read: unavailable, write: unavailable, trash: unavailable },
      file: {
        importText: unavailable,
        exportText: unavailable,
        exportCsv: unavailable,
        archiveImport: unavailable,
      },
    };
  }

  return {
    app: {
      info: () => call(appInfoResponseSchema, () => bridge.app.info()),
      onQuitRequested: (handler: (request: QuitRequest) => void): (() => void) => {
        // Test doubles and older bridges may not implement the event surface.
        if (typeof bridge.app.onQuitRequested !== 'function') {
          return () => undefined;
        }
        return bridge.app.onQuitRequested((request) => {
          const parsed = quitRequestSchema.safeParse(request);
          if (parsed.success) {
            handler(parsed.data);
          }
        });
      },
      respondToQuit: (request: QuitResponseRequest): Promise<IpcResult<OkReply>> => {
        const parsed = quitResponseRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(quitResponseResponseSchema, () => bridge.app.respondToQuit(parsed.data));
      },
    },
    dialog: {
      pickDirectory: (
        request: PickDirectoryRequest,
      ): Promise<IpcResult<PickDirectoryResult | null>> => {
        const parsed = pickDirectoryRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(pickDirectoryResponseSchema, () => bridge.dialog.pickDirectory(parsed.data));
      },
    },
    log: {
      write: (request: LogWriteRequest): Promise<IpcResult<OkReply>> => {
        const parsed = logWriteRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(logWriteResponseSchema, () => bridge.log.write(parsed.data));
      },
    },
    workspace: {
      create: (request: WorkspaceCreateRequest): Promise<IpcResult<WorkspaceManifest>> => {
        const parsed = workspaceCreateRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(workspaceCreateResponseSchema, () => bridge.workspace.create(parsed.data));
      },
      open: (request: WorkspaceOpenRequest): Promise<IpcResult<WorkspaceOpenResult>> => {
        const parsed = workspaceOpenRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(workspaceOpenResponseSchema, () => bridge.workspace.open(parsed.data));
      },
      inspect: (request: WorkspaceInspectRequest): Promise<IpcResult<WorkspaceInspection>> => {
        const parsed = workspaceInspectRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(workspaceInspectResponseSchema, () => bridge.workspace.inspect(parsed.data));
      },
      close: (request: WorkspaceCloseRequest): Promise<IpcResult<OkReply>> => {
        const parsed = workspaceCloseRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(workspaceCloseResponseSchema, () => bridge.workspace.close(parsed.data));
      },
      recent: (): Promise<IpcResult<RecentEntry[]>> =>
        call(workspaceRecentResponseSchema, () => bridge.workspace.recent()),
      recentRemove: (request: RecentRemoveRequest): Promise<IpcResult<OkReply>> => {
        const parsed = workspaceRecentRemoveRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(okReplySchema, () => bridge.workspace.recentRemove(parsed.data));
      },
      recentClear: (): Promise<IpcResult<OkReply>> => {
        const parsed = workspaceRecentClearRequestSchema.safeParse(undefined);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(okReplySchema, () => bridge.workspace.recentClear());
      },
    },
    manifest: {
      write: (request: ManifestWriteRequest): Promise<IpcResult<OkReply>> => {
        const parsed = manifestWriteRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(manifestWriteResponseSchema, () => bridge.manifest.write(parsed.data));
      },
    },
    table: {
      read: (request: TableRefRequest): Promise<IpcResult<TableReadReply>> => {
        const parsed = tableReadRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(tableReadResponseSchema, () => bridge.table.read(parsed.data));
      },
      write: (request: TableWriteRequest): Promise<IpcResult<TableWriteReply>> => {
        const parsed = tableWriteRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(tableWriteResponseSchema, () => bridge.table.write(parsed.data));
      },
      trash: (request: TableRefRequest): Promise<IpcResult<OkReply>> => {
        const parsed = tableTrashRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(tableTrashResponseSchema, () => bridge.table.trash(parsed.data));
      },
    },
    file: {
      importText: (request: ImportTextRequest): Promise<IpcResult<ImportTextReply | null>> => {
        const parsed = importTextRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(importTextResponseSchema, () => bridge.file.importText(parsed.data));
      },
      exportText: (request: ExportTextRequest): Promise<IpcResult<ExportTextReply | null>> => {
        const parsed = exportTextRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(exportTextResponseSchema, () => bridge.file.exportText(parsed.data));
      },
      exportCsv: (request: ExportCsvRequest): Promise<IpcResult<ExportCsvReply | null>> => {
        const parsed = exportCsvRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(exportCsvResponseSchema, () => bridge.file.exportCsv(parsed.data));
      },
      archiveImport: (request: ArchiveImportRequest): Promise<IpcResult<ArchiveImportReply>> => {
        const parsed = archiveImportRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(archiveImportResponseSchema, () => bridge.file.archiveImport(parsed.data));
      },
    },
  };
}
