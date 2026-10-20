/**
 * Turns an error envelope into user-facing text (SPEC §18: localise by `code`,
 * never display `message`/`detail`). The code stays in parentheses as a
 * support handle; T0.4 replaces this table with `t()` keys.
 */

import type { AppError, ErrorCode } from '../shared/contracts/ipc';

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  E_IPC_INVALID_PAYLOAD: 'The request could not be understood by the main process.',
  E_PAYLOAD_TOO_LARGE: 'The request was too large to send.',
  E_PATH_DENIED: 'The app is not allowed to access that location.',
  E_VALIDATION: 'Some of the values were rejected.',
  E_WS_NOT_FOUND: 'That workspace could not be found.',
  E_WS_LOCKED: 'The workspace is open in another window.',
  E_FS_READ: 'The file could not be read.',
  E_FS_WRITE: 'The file could not be written.',
  E_UNKNOWN: 'Something went wrong.',
};

const FALLBACK_MESSAGE = 'Something went wrong.';

export function describeAppError(error: AppError): string {
  const message = MESSAGES[error.code] ?? FALLBACK_MESSAGE;
  return `${message} (${error.code})`;
}
