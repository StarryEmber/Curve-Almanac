/**
 * IPC contract shared by the Electron main, preload and renderer processes.
 *
 * T0.2 only ships the `app:info` channel. T0.3 replaces this module with the
 * typed channel registry (SPEC §15.1) and moves `ErrorCode` / `AppError` into
 * `@curve/domain`, re-exporting them from the desktop contracts.
 */

/** Channels implemented so far; names are frozen by SPEC §15.1. */
export const IPC_CHANNELS = {
  appInfo: 'app:info',
} as const;

/** Error codes from SPEC §18. */
export type ErrorCode =
  | 'E_WS_NOT_FOUND'
  | 'E_WS_INVALID_MANIFEST'
  | 'E_WS_VERSION_UNSUPPORTED'
  | 'E_WS_LOCKED'
  | 'E_WS_BUSY'
  | 'E_MIGRATION_FAILED'
  | 'E_TABLE_NOT_FOUND'
  | 'E_TABLE_PARSE'
  | 'E_TABLE_LIMIT'
  | 'E_IMPORT_ENCODING'
  | 'E_IMPORT_FORMAT'
  | 'E_IMPORT_ABORTED'
  | 'E_VALIDATION'
  | 'E_DUPLICATE_KEY'
  | 'E_TYPE'
  | 'E_PATH_DENIED'
  | 'E_FS_READ'
  | 'E_FS_WRITE'
  | 'E_BACKUP_NOT_FOUND'
  | 'E_IPC_INVALID_PAYLOAD'
  | 'E_PAYLOAD_TOO_LARGE'
  | 'E_PLUGIN_INVALID'
  | 'E_PLUGIN_INCOMPATIBLE'
  | 'E_PLUGIN_ACTIVATE'
  | 'E_EXPORT_FAILED'
  | 'E_UNKNOWN';

/** Error envelope from SPEC §18. `message` is developer-facing English only. */
export interface AppError {
  code: ErrorCode;
  message: string;
  detail?: string;
  retryable?: boolean;
}

/** Every IPC response is wrapped (SPEC §15.1). */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

/** Payload of `app:info` (SPEC §15.4). */
export interface AppInfo {
  version: string;
  platform: string;
  locale: string;
}

/** `window.api` surface. Grows in T0.3; only whitelisted methods may appear. */
export interface CurveApi {
  app: {
    info(): Promise<IpcResult<AppInfo>>;
  };
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
