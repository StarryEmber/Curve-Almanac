/**
 * @curve/domain — pure domain model, Zod schemas, invariants and migrations.
 *
 * Dependency rule (SPEC §4.2): this package may only import `zod`.
 * React, Electron, ECharts, Zustand and Node builtins are forbidden here.
 *
 * Placeholder export created in T0.1; the real public API lands in T1.1.
 */
export const PACKAGE_NAME = '@curve/domain' as const;
