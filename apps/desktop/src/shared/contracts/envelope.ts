/**
 * Result envelope shared by every IPC channel (SPEC §15.1).
 *
 * This module has no runtime dependencies beyond the type-only `AppError`
 * import, so the preload can narrow responses without pulling Zod into the
 * sandboxed bundle.
 */

import type { AppError } from '@curve/domain';

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function ipcOk<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function ipcFail(error: AppError): IpcResult<never> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Runtime guard for the response envelope. Anything that does not match is
 * treated as a malformed response by the caller instead of leaking a partially
 * shaped object into the renderer.
 */
export function isIpcResult<T>(value: unknown): value is IpcResult<T> {
  if (!isRecord(value)) {
    return false;
  }
  if (value['ok'] === true) {
    return 'data' in value;
  }
  if (value['ok'] !== false) {
    return false;
  }
  const error = value['error'];
  return (
    isRecord(error) && typeof error['code'] === 'string' && typeof error['message'] === 'string'
  );
}
