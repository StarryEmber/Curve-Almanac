/**
 * @curve/domain — pure domain model, Zod schemas, invariants and migrations.
 *
 * Dependency rule (SPEC §4.2): this package may only import `zod`.
 * React, Electron, ECharts, Zustand and Node builtins are forbidden here.
 */

export const PACKAGE_NAME = '@curve/domain' as const;

export { ERROR_CODES, appErrorSchema, createAppError, isAppError, toAppError } from './errors';
export type { AppError, AppErrorOptions, ErrorCode } from './errors';
