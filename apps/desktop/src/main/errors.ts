/**
 * Maps anything thrown in the main process to the SPEC §18 envelope.
 *
 * Renderer-facing errors never carry a stack trace; the stack stays in the main
 * process log (T0.3 turns this into the shared error mapper).
 */

import type { AppError } from '../shared/ipc';

export function toAppError(error: unknown): AppError {
  if (error instanceof Error) {
    const message = error.message.trim();
    return { code: 'E_UNKNOWN', message: message.length > 0 ? message : 'Unexpected error' };
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return { code: 'E_UNKNOWN', message: error.trim() };
  }
  return { code: 'E_UNKNOWN', message: 'Unexpected error' };
}
