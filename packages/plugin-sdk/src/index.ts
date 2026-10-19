/**
 * @curve/plugin-sdk — plugin manifest, contribution registries and host API types.
 *
 * Dependency rule (SPEC §4.2): may import @curve/domain types only.
 * Plugins import this package; they must never reach into app internals.
 *
 * Placeholder export created in T0.1; the real public API lands in T6.1.
 */
export const PACKAGE_NAME = '@curve/plugin-sdk' as const;
