/**
 * Workspace format migrations (SPEC §7.6).
 *
 * The production registry is intentionally empty: v1 is the only format that
 * ever shipped, so there is no real v0 -> v1 history to register (ADR-024).
 * The framework and its tests are ready for the first real version bump.
 */

import { createMigrationRegistry } from './registry';

export * from './registry';
export * from './run';
export * from './types';

/** Migrations shipped by this build. Empty until v1 gets a successor (ADR-024). */
export const MIGRATIONS = createMigrationRegistry([]);
