import { z } from 'zod';

/**
 * Error contract (SPEC §18).
 *
 * `code` is the only field the UI may use to pick a user-facing message;
 * `message` is a developer-facing English diagnostic. Nothing in here may ever
 * carry a stack trace across the process boundary.
 */

/** Every error code from SPEC §18, in the order the specification lists them. */
export const ERROR_CODES = [
  'E_WS_NOT_FOUND',
  'E_WS_INVALID_MANIFEST',
  'E_WS_VERSION_UNSUPPORTED',
  'E_WS_LOCKED',
  'E_WS_BUSY',
  'E_MIGRATION_FAILED',
  'E_TABLE_NOT_FOUND',
  'E_TABLE_PARSE',
  'E_TABLE_LIMIT',
  'E_IMPORT_ENCODING',
  'E_IMPORT_FORMAT',
  'E_IMPORT_ABORTED',
  'E_VALIDATION',
  'E_DUPLICATE_KEY',
  'E_TYPE',
  'E_PATH_DENIED',
  'E_FS_READ',
  'E_FS_WRITE',
  'E_BACKUP_NOT_FOUND',
  'E_IPC_INVALID_PAYLOAD',
  'E_PAYLOAD_TOO_LARGE',
  'E_PLUGIN_INVALID',
  'E_PLUGIN_INCOMPATIBLE',
  'E_PLUGIN_ACTIVATE',
  'E_EXPORT_FAILED',
  'E_UNKNOWN',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Strict on purpose: an envelope with extra fields (a `stack`, a `cause`) is
 * rejected instead of being forwarded to the renderer.
 */
export const appErrorSchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  message: z.string().min(1),
  detail: z.string().optional(),
  retryable: z.boolean().optional(),
});

export interface AppError {
  code: ErrorCode;
  message: string;
  detail?: string;
  retryable?: boolean;
}

export interface AppErrorOptions {
  detail?: string;
  retryable?: boolean;
}

const FALLBACK_MESSAGE = 'Unexpected error';

export function createAppError(
  code: ErrorCode,
  message: string,
  options?: AppErrorOptions,
): AppError {
  const error: AppError = { code, message };
  if (options?.detail !== undefined) {
    error.detail = options.detail;
  }
  if (options?.retryable !== undefined) {
    error.retryable = options.retryable;
  }
  return error;
}

export function isAppError(value: unknown): value is AppError {
  return appErrorSchema.safeParse(value).success;
}

/**
 * Maps anything thrown in the main process to the SPEC §18 envelope.
 *
 * A well-formed envelope is preserved (so use cases can throw typed errors);
 * everything else collapses to `E_UNKNOWN`. Stack traces stay in the process log.
 */
export function toAppError(error: unknown): AppError {
  const parsed = appErrorSchema.safeParse(error);
  if (parsed.success) {
    return parsed.data;
  }

  const candidate = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const message = candidate.trim();
  return { code: 'E_UNKNOWN', message: message.length > 0 ? message : FALLBACK_MESSAGE };
}
