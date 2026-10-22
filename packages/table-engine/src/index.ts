/**
 * @curve/table-engine — row sets, JSONL codec, worker protocol and dirty-table
 * primitives.
 *
 * Dependency rule (SPEC §4.2): may import `@curve/domain` and pure parsing
 * libraries. React, Electron, ECharts, Zustand and Node builtins are forbidden
 * here; see `.dependency-cruiser.cjs`.
 *
 * Query/sort/filter/paste/import land in later milestones on top of these
 * primitives.
 */

export const PACKAGE_NAME = '@curve/table-engine' as const;

export * from './dirty-set';
export * from './jsonl';
export * from './paste';
export * from './row-set';
export * from './worker-protocol';
