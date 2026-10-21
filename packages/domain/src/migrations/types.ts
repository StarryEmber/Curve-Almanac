import type { AppError } from '../errors';
import type { Row, WorkspaceManifest } from '../types';

/**
 * Workspace format migration contract (SPEC §7.6).
 *
 * Migrations are pure data transformations: they receive the manifest and the
 * rows the caller already loaded and return the next version. File-system work
 * (the pre-migration `backups/migration-<ts>/` copy and the rollback) is the
 * Electron main adapter's job, because `@curve/domain` must stay Node-free.
 */

/** Format version this build reads and writes (SPEC §7.6). */
export const CURRENT_FORMAT_VERSION = 1;

/**
 * Rows of every table, keyed by table id. Read-only so a migration cannot
 * silently mutate its input; a step must return a new map when it changes rows.
 */
export type MigrationTables = ReadonlyMap<string, readonly Row[]>;

/** What one migration step returns (SPEC §7.6). */
export interface MigrationResult {
  manifest: WorkspaceManifest;
  tables: MigrationTables;
  warnings?: readonly string[];
}

/**
 * One format-version step. `to` must be exactly `from + 1`: skipping a version
 * is rejected when the registry is built.
 */
export interface Migration {
  from: number;
  to: number;
  migrate(
    manifest: WorkspaceManifest,
    tables: MigrationTables,
  ): MigrationResult | Promise<MigrationResult>;
}

export interface MigrationRegistry {
  get(from: number): Migration | undefined;
  /** Registered source versions, ascending. */
  versions(): readonly number[];
}

export interface MigrationPathRequest {
  from: number;
  to: number;
  registry: MigrationRegistry;
}

export type MigrationPathResult =
  { ok: true; steps: readonly Migration[] } | { ok: false; error: AppError };

export interface RunMigrationsRequest {
  /** Manifest as loaded by the caller; its `formatVersion` is the start. */
  manifest: WorkspaceManifest;
  tables: MigrationTables;
  registry: MigrationRegistry;
  /** Defaults to `CURRENT_FORMAT_VERSION`. */
  target?: number;
}

export interface MigrationRunSuccess {
  ok: true;
  manifest: WorkspaceManifest;
  tables: MigrationTables;
  /** `from` versions of the steps that ran and passed validation, in order. */
  applied: readonly number[];
  warnings: readonly string[];
}

/**
 * Failure carries no partially migrated manifest: the caller must treat the
 * workspace as unchanged and fall back to its pre-migration backup.
 */
export interface MigrationRunFailure {
  ok: false;
  /** Always `E_MIGRATION_FAILED` (SPEC §7.6). */
  error: AppError;
  applied: readonly number[];
  warnings: readonly string[];
}

export type MigrationRunOutcome = MigrationRunSuccess | MigrationRunFailure;
