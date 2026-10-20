/**
 * Turns an error envelope into user-facing text (SPEC §18: localise by `code`,
 * never display `message`/`detail`). The code stays in parentheses as a support
 * handle. Since T0.4 every code comes from the message table.
 */

import type { Translate } from './i18n';
import type { AppError } from '../shared/contracts/ipc';

export function describeAppError(error: AppError, t: Translate): string {
  return `${t(`error.${error.code}`)} (${error.code})`;
}
