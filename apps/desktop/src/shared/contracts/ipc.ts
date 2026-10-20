/**
 * Typed IPC contract (SPEC §15.1, §15.4).
 *
 * Every channel declares a request schema and a response schema; the main
 * process validates both (see `src/main/ipc/dispatch.ts`) and the renderer
 * client re-validates the response it receives. Only the two channels wired in
 * T0.3 have schemas so far — later milestones add theirs with their handlers.
 */

import { z } from 'zod';

import type { IpcResult } from './envelope';

export { ALL_IPC_CHANNELS, IMPLEMENTED_IPC_CHANNELS, IPC_CHANNELS } from './channels';
export type { IpcChannel } from './channels';
export { ipcFail, ipcOk, isIpcResult } from './envelope';
export type { AppError, ErrorCode } from '@curve/domain';

/** Payload of `app:info` (SPEC §15.4). */
export interface AppInfo {
  version: string;
  platform: string;
  locale: string;
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

/**
 * `window.api` surface. SPEC §15.4 lists the full interface; T0.3 ships `app`
 * and `log` only. The remaining namespaces land with their handlers (T1.2/T1.3)
 * so an unimplemented method can never appear on the bridge.
 */
export interface CurveApi {
  app: {
    info(): Promise<IpcResult<AppInfo>>;
  };
  log: {
    write(request: LogWriteRequest): Promise<IpcResult<OkReply>>;
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
});

export const logWriteRequestSchema = z.strictObject({
  level: z.string().min(1),
  message: z.string().min(1),
  detail: z.unknown().optional(),
});

export const logWriteResponseSchema = z.strictObject({ ok: z.literal(true) });
