/**
 * @curve/persistence — WorkspaceStore port and in-memory adapter.
 *
 * Dependency rule (SPEC §4.2): may import @curve/domain only.
 * Electron is forbidden; the file-system adapter lives in apps/desktop/src/main.
 *
 * Placeholder export created in T0.1; the real public API lands in T1.2.
 */
export const PACKAGE_NAME = '@curve/persistence' as const;
