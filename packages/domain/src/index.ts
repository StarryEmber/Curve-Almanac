/**
 * @curve/domain — pure domain model, Zod schemas, invariants, coercion and
 * formatting. No UI, IO, Electron or chart-library imports (SPEC §4.2).
 */

export const PACKAGE_NAME = '@curve/domain' as const;

export * from './column-ops';
export * from './condition';
export * from './errors';
export * from './invariants';
export * from './limits';
export * from './migrations';
export * from './predicate';
export * from './schemas';
export * from './coerce';
export * from './factories';
export * from './format';
export * from './table-style';
export * from './style-export';
export type * from './types';
