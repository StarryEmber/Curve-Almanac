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

/** Native file dialog filter (SPEC §15.4). */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/** `file:importText` request: the dialog filters for the import source. */
export interface ImportTextRequest {
  filters: FileFilter[];
}

/** Raw import bytes; the renderer Worker decodes them without losing GBK. */
export interface ImportTextReply {
  token: string;
  name: string;
  bytes: Uint8Array;
  sha256: string;
  size: number;
  format: 'csv' | 'json';
}

/** `file:exportText` request (SPEC §15.1). */
export interface ExportTextRequest {
  suggestedName: string;
  content: string;
  filters: FileFilter[];
}

export interface ExportTextReply {
  path: string;
}

/** Largest single CSV chunk accepted by `file:exportCsv` (T3.6, ADR-039). */
export const MAX_EXPORT_CSV_CHUNK_BYTES = 8 * 1024 * 1024;

/**
 * `file:exportCsv` is a four-step streaming protocol on one channel: `begin`
 * opens the save dialog and a temporary file, `append` writes one chunk,
 * `finish` renames the temporary file into place, and `cancel` removes it.
 * Only the opaque token crosses the boundary; renderer never sends a path.
 */
export type ExportCsvRequest =
  | { op: 'begin'; suggestedName: string; filters: FileFilter[] }
  | { op: 'append'; token: string; chunk: string }
  | { op: 'finish'; token: string; rows: number }
  | { op: 'cancel'; token: string };

export type ExportCsvReply =
  | { op: 'begin'; token: string; path: string }
  | { op: 'append'; bytes: number }
  | { op: 'finish'; path: string; bytes: number; rows: number }
  | { op: 'cancel'; removed: boolean };

/** `file:archiveImport` request: commits the selected source to `imports/`. */
export interface ArchiveImportRequest {
  workspaceId: string;
  token: string;
  tableId: string;
  mode: 'append' | 'replace';
  name: string;
  sha256: string;
  size: number;
  encoding: string;
  format: 'csv' | 'json';
}

export interface ArchiveImportReply {
  copied: boolean;
  archivePath: string | null;
  sidecarPath: string;
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
  file: {
    importText(request: ImportTextRequest): Promise<IpcResult<ImportTextReply | null>>;
    exportText(request: ExportTextRequest): Promise<IpcResult<ExportTextReply | null>>;
    exportCsv(request: ExportCsvRequest): Promise<IpcResult<ExportCsvReply | null>>;
    archiveImport(request: ArchiveImportRequest): Promise<IpcResult<ArchiveImportReply>>;
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

export const fileFilterSchema: z.ZodType<FileFilter, FileFilter> = z.strictObject({
  name: z.string().min(1).max(80),
  extensions: z.array(z.string().min(1).max(16)).min(1).max(20),
});

const exportCsvTokenSchema = z.string().min(1).max(200);

export const exportCsvRequestSchema: z.ZodType<ExportCsvRequest, ExportCsvRequest> =
  z.discriminatedUnion('op', [
    z.strictObject({
      op: z.literal('begin'),
      suggestedName: z.string().min(1).max(200),
      filters: z.array(fileFilterSchema).min(1).max(10),
    }),
    z.strictObject({
      op: z.literal('append'),
      token: exportCsvTokenSchema,
      chunk: z.string().max(MAX_EXPORT_CSV_CHUNK_BYTES),
    }),
    z.strictObject({
      op: z.literal('finish'),
      token: exportCsvTokenSchema,
      rows: z.number().int().nonnegative(),
    }),
    z.strictObject({
      op: z.literal('cancel'),
      token: exportCsvTokenSchema,
    }),
  ]);

export const exportCsvResponseSchema: z.ZodType<ExportCsvReply | null, ExportCsvReply | null> = z
  .discriminatedUnion('op', [
    z.strictObject({
      op: z.literal('begin'),
      token: exportCsvTokenSchema,
      path: z.string().min(1),
    }),
    z.strictObject({
      op: z.literal('append'),
      bytes: z.number().int().nonnegative(),
    }),
    z.strictObject({
      op: z.literal('finish'),
      path: z.string().min(1),
      bytes: z.number().int().nonnegative(),
      rows: z.number().int().nonnegative(),
    }),
    z.strictObject({
      op: z.literal('cancel'),
      removed: z.boolean(),
    }),
  ])
  .nullable();

export const importTextRequestSchema: z.ZodType<ImportTextRequest, ImportTextRequest> =
  z.strictObject({
    filters: z.array(fileFilterSchema).min(1).max(10),
  });

const rawBytesSchema = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array,
  'Expected raw import bytes.',
);

export const importTextResponseSchema: z.ZodType<ImportTextReply | null> = z.union([
  z.strictObject({
    token: z.string().min(1),
    name: z.string().min(1),
    bytes: rawBytesSchema,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().nonnegative(),
    format: z.enum(['csv', 'json']),
  }),
  z.null(),
]);

export const exportTextRequestSchema: z.ZodType<ExportTextRequest, ExportTextRequest> =
  z.strictObject({
    suggestedName: z.string().min(1).max(200),
    content: z.string(),
    filters: z.array(fileFilterSchema).min(1).max(10),
  });

export const exportTextResponseSchema: z.ZodType<ExportTextReply | null> = z.union([
  z.strictObject({ path: z.string().min(1) }),
  z.null(),
]);

export const archiveImportRequestSchema: z.ZodType<ArchiveImportRequest, ArchiveImportRequest> =
  z.strictObject({
    workspaceId: workspaceIdSchema,
    token: z.string().min(1),
    tableId: tableIdSchema,
    mode: z.enum(['append', 'replace']),
    name: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().nonnegative(),
    encoding: z.string().min(1).max(32),
    format: z.enum(['csv', 'json']),
  });

export const archiveImportResponseSchema: z.ZodType<ArchiveImportReply> = z.strictObject({
  copied: z.boolean(),
  archivePath: z.string().min(1).nullable(),
  sidecarPath: z.string().min(1),
});
