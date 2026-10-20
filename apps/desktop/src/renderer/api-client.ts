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
  logWriteRequestSchema,
  logWriteResponseSchema,
  manifestWriteRequestSchema,
  manifestWriteResponseSchema,
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
  workspaceOpenRequestSchema,
  workspaceOpenResponseSchema,
  workspaceRecentResponseSchema,
} from '../shared/contracts/ipc';

import type { IpcResult } from '../shared/contracts/envelope';
import type {
  CurveApi,
  LogWriteRequest,
  ManifestWriteRequest,
  OkReply,
  RecentEntry,
  TableReadReply,
  TableRefRequest,
  TableWriteReply,
  TableWriteRequest,
  WorkspaceCloseRequest,
  WorkspaceCreateRequest,
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
      app: { info: unavailable },
      log: { write: unavailable },
      workspace: {
        create: unavailable,
        open: unavailable,
        close: unavailable,
        recent: unavailable,
      },
      manifest: { write: unavailable },
      table: { read: unavailable, write: unavailable, trash: unavailable },
    };
  }

  return {
    app: {
      info: () => call(appInfoResponseSchema, () => bridge.app.info()),
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
      close: (request: WorkspaceCloseRequest): Promise<IpcResult<OkReply>> => {
        const parsed = workspaceCloseRequestSchema.safeParse(request);
        if (!parsed.success) {
          return Promise.resolve(INVALID_REQUEST);
        }
        return call(workspaceCloseResponseSchema, () => bridge.workspace.close(parsed.data));
      },
      recent: (): Promise<IpcResult<RecentEntry[]>> =>
        call(workspaceRecentResponseSchema, () => bridge.workspace.recent()),
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
  };
}
