/**
 * Typed IPC contract (SPEC §15.1, §15.4).
 *
 * Every channel declares a request schema and a response schema; the main
 * process validates both (see `src/main/ipc/dispatch.ts`) and the renderer
 * client re-validates the response it receives. Only channels wired in this
 * milestone have schemas — later milestones add theirs with their handlers.
 */

import { z } from 'zod';

import {
  isoTimestampSchema,
  tableIdSchema,
  workspaceIdSchema,
  workspaceManifestSchema,
} from '@curve/domain';
import type { WorkspaceManifest } from '@curve/domain';

import type { IpcResult } from './envelope';

export { ALL_IPC_CHANNELS, IMPLEMENTED_IPC_CHANNELS, IPC_CHANNELS } from './channels';
export type { IpcChannel } from './channels';
export { ipcFail, ipcOk, isIpcResult } from './envelope';
export type { AppError, ErrorCode, WorkspaceManifest } from '@curve/domain';

/** Payload of `app:info` (SPEC §15.4). */
export interface AppInfo {
  version: string;
  platform: string;
  locale: string;
  /** OS documents directory; the welcome page derives its default parent from it. */
  documentsDir: string;
}

/** `dialog:pickDirectory` request (SPEC §15.1; T2.1 default-path extension). */
export interface PickDirectoryRequest {
  title?: string;
  defaultPath?: string;
}

/** `dialog:pickDirectory` reply: the chosen directory, or `null` when cancelled. */
export interface PickDirectoryResult {
  path: string;
}

/** Request of `log:write` (SPEC §15.1). `level` is validated in the main process. */
export interface LogWriteRequest {
  level: string;
  message: string;
  detail?: unknown;
}

/** Reply used by channels that only acknowledge (SPEC §15.1 `{ ok: true }`). */
export interface OkReply {
  ok: true;
}

/** One entry of `workspace:recent` (SPEC §15.4). */
export interface RecentEntry {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface WorkspaceCreateRequest {
  dir: string;
  name: string;
}

export interface WorkspaceOpenRequest {
  dir: string;
}

export interface WorkspaceCloseRequest {
  workspaceId: string;
}

export interface WorkspaceOpenResult {
  manifest: WorkspaceManifest;
  warnings: string[];
}

export interface ManifestWriteRequest {
  workspaceId: string;
  manifest: WorkspaceManifest;
}

/** `table:read` / `table:trash` request (SPEC §15.1). */
export interface TableRefRequest {
  workspaceId: string;
  tableId: string;
}

/** `table:read` reply: the raw JSONL document and its byte length. */
export interface TableReadReply {
  jsonl: string;
  bytes: number;
}

/** `table:write` request: the whole document, written atomically. */
export interface TableWriteRequest extends TableRefRequest {
  jsonl: string;
}

export interface TableWriteReply {
  bytes: number;
}

/**
 * `window.api` surface. SPEC §15.4 lists the full interface; this milestone
 * ships `app`, `log`, `workspace`, `manifest` and `table`. The remaining
 * namespaces land with their handlers so an unimplemented method can never
 * appear on the bridge.
 */
export interface CurveApi {
  app: {
    info(): Promise<IpcResult<AppInfo>>;
  };
  dialog: {
    pickDirectory(request: PickDirectoryRequest): Promise<IpcResult<PickDirectoryResult | null>>;
  };
  log: {
    write(request: LogWriteRequest): Promise<IpcResult<OkReply>>;
  };
  workspace: {
    create(request: WorkspaceCreateRequest): Promise<IpcResult<WorkspaceManifest>>;
    open(request: WorkspaceOpenRequest): Promise<IpcResult<WorkspaceOpenResult>>;
    close(request: WorkspaceCloseRequest): Promise<IpcResult<OkReply>>;
    recent(): Promise<IpcResult<RecentEntry[]>>;
  };
  manifest: {
    write(request: ManifestWriteRequest): Promise<IpcResult<OkReply>>;
  };
  table: {
    read(request: TableRefRequest): Promise<IpcResult<TableReadReply>>;
    write(request: TableWriteRequest): Promise<IpcResult<TableWriteReply>>;
    trash(request: TableRefRequest): Promise<IpcResult<OkReply>>;
  };
}

/**
 * `app:info` takes no arguments. `undefined` is what `ipcRenderer.invoke`
 * delivers when the preload passes no payload; `{}` is tolerated so a caller may
 * explicitly pass an empty object. Anything else is a contract violation.
 */
export const appInfoRequestSchema = z.union([z.undefined(), z.strictObject({})]);

export const appInfoResponseSchema = z.strictObject({
  version: z.string().min(1),
  platform: z.string().min(1),
  locale: z.string().min(1),
  documentsDir: z.string().min(1),
});

export const pickDirectoryRequestSchema: z.ZodType<PickDirectoryRequest, PickDirectoryRequest> =
  z.strictObject({
    title: z.string().min(1).max(200).optional(),
    defaultPath: z.string().min(1).optional(),
  });

export const pickDirectoryResponseSchema: z.ZodType<PickDirectoryResult | null> = z.union([
  z.strictObject({ path: z.string().min(1) }),
  z.null(),
]);

export const logWriteRequestSchema = z.strictObject({
  level: z.string().min(1),
  message: z.string().min(1),
  detail: z.unknown().optional(),
});

export const okReplySchema: z.ZodType<OkReply> = z.strictObject({ ok: z.literal(true) });

export const logWriteResponseSchema = okReplySchema;

export const workspaceCreateRequestSchema: z.ZodType<
  WorkspaceCreateRequest,
  WorkspaceCreateRequest
> = z.strictObject({
  dir: z.string().min(1),
  name: z.string().min(1),
});

export const workspaceCreateResponseSchema = workspaceManifestSchema;

export const workspaceOpenRequestSchema: z.ZodType<WorkspaceOpenRequest, WorkspaceOpenRequest> =
  z.strictObject({
    dir: z.string().min(1),
  });

export const workspaceOpenResponseSchema: z.ZodType<WorkspaceOpenResult> = z.strictObject({
  manifest: workspaceManifestSchema,
  warnings: z.array(z.string()),
});

export const workspaceCloseRequestSchema: z.ZodType<WorkspaceCloseRequest, WorkspaceCloseRequest> =
  z.strictObject({
    workspaceId: workspaceIdSchema,
  });

export const workspaceCloseResponseSchema = okReplySchema;

export const workspaceRecentRequestSchema = z.union([z.undefined(), z.strictObject({})]);

export const recentEntrySchema: z.ZodType<RecentEntry> = z.strictObject({
  path: z.string().min(1),
  name: z.string().min(1),
  lastOpenedAt: isoTimestampSchema,
});

export const workspaceRecentResponseSchema: z.ZodType<RecentEntry[]> = z.array(recentEntrySchema);

export const manifestWriteRequestSchema: z.ZodType<ManifestWriteRequest> = z.strictObject({
  workspaceId: workspaceIdSchema,
  manifest: workspaceManifestSchema,
});

export const manifestWriteResponseSchema = okReplySchema;

export const tableRefRequestSchema: z.ZodType<TableRefRequest, TableRefRequest> = z.strictObject({
  workspaceId: workspaceIdSchema,
  tableId: tableIdSchema,
});

export const tableReadRequestSchema = tableRefRequestSchema;

export const tableReadResponseSchema: z.ZodType<TableReadReply> = z.strictObject({
  jsonl: z.string(),
  bytes: z.number().int().nonnegative(),
});

export const tableWriteRequestSchema: z.ZodType<TableWriteRequest, TableWriteRequest> =
  z.strictObject({
    workspaceId: workspaceIdSchema,
    tableId: tableIdSchema,
    jsonl: z.string(),
  });

export const tableWriteResponseSchema: z.ZodType<TableWriteReply> = z.strictObject({
  bytes: z.number().int().nonnegative(),
});

export const tableTrashRequestSchema = tableRefRequestSchema;

export const tableTrashResponseSchema = okReplySchema;
