/**
 * @curve/persistence — WorkspaceStore port, pure layout/backup helpers and the
 * in-memory adapter.
 *
 * Dependency rule (SPEC §4.2): may import @curve/domain only. Electron and Node
 * builtins are forbidden; the file-system adapter lives in
 * `apps/desktop/src/main/workspace`.
 */

export const PACKAGE_NAME = '@curve/persistence' as const;

export * from './backup';
export * from './layout';
export * from './manifest';
export * from './memory-workspace-store';
export type * from './types';
