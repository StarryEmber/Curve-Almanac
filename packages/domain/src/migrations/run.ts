import { createAppError, toAppError } from '../errors';
import { checkInvariants } from '../invariants';
import { parseManifest } from '../schemas';

import { resolveMigrationPath } from './registry';
import { CURRENT_FORMAT_VERSION } from './types';

import type { AppError } from '../errors';
import type { ValidationIssue, WorkspaceManifest } from '../types';
import type {
  Migration,
  MigrationResult,
  MigrationRunFailure,
  MigrationRunOutcome,
  MigrationTables,
  RunMigrationsRequest,
} from './types';

function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.length > 0 ? issue.path : '<root>'}: ${issue.code}`)
    .join('; ');
}

function failure(
  message: string,
  detail: string,
  applied: readonly number[],
  warnings: readonly string[],
): MigrationRunFailure {
  return {
    ok: false,
    error: createAppError('E_MIGRATION_FAILED', message, { detail }),
    applied,
    warnings,
  };
}

function findUnknownTableId(manifest: WorkspaceManifest, tables: MigrationTables): string | null {
  const known = new Set(manifest.tables.map((table) => table.id));
  for (const tableId of tables.keys()) {
    if (!known.has(tableId)) {
      return tableId;
    }
  }
  return null;
}

interface StepCheck {
  error: AppError | null;
  warnings: readonly string[];
}

/**
 * Validates one step's output before it is accepted.
 *
 * Every step is checked against the SPEC §6.6 invariants. When the step reaches
 * the format version this build knows, the manifest is additionally parsed with
 * the real Zod schema, so a migration can never hand back a v1 document the rest
 * of the app would refuse to load.
 */
function validateStepOutput(
  migration: Migration,
  manifest: WorkspaceManifest,
  tables: MigrationTables,
): StepCheck {
  if (manifest.formatVersion !== migration.to) {
    return {
      error: createAppError(
        'E_MIGRATION_FAILED',
        'The migration did not advance the workspace to the expected format version.',
        {
          detail: `expected formatVersion=${String(migration.to)}, got ${String(manifest.formatVersion)}`,
        },
      ),
      warnings: [],
    };
  }

  const unknownTableId = findUnknownTableId(manifest, tables);
  if (unknownTableId !== null) {
    return {
      error: createAppError(
        'E_MIGRATION_FAILED',
        'The migration produced rows for a table that is not in the manifest.',
        { detail: `table=${unknownTableId}` },
      ),
      warnings: [],
    };
  }

  if (migration.to === CURRENT_FORMAT_VERSION) {
    const parsed = parseManifest(manifest);
    if (!parsed.ok) {
      return {
        error: createAppError(
          'E_MIGRATION_FAILED',
          'The migrated workspace manifest does not match the format.',
          { detail: describeIssues(parsed.issues) },
        ),
        warnings: [],
      };
    }
  }

  const report = checkInvariants(manifest, { rowsByTable: tables });
  if (report.issues.length > 0) {
    return {
      error: createAppError(
        'E_MIGRATION_FAILED',
        'The migrated workspace manifest violates a domain invariant.',
        { detail: describeIssues(report.issues) },
      ),
      warnings: report.warnings,
    };
  }

  return { error: null, warnings: report.warnings };
}

/**
 * Runs the registered migrations in order (SPEC §7.6).
 *
 * Never throws and never returns a partially migrated document: on the first
 * failing step it returns `{ ok: false }` so the caller can restore its backup.
 */
export async function runMigrations(request: RunMigrationsRequest): Promise<MigrationRunOutcome> {
  const target = request.target ?? CURRENT_FORMAT_VERSION;
  const applied: number[] = [];
  const warnings: string[] = [];

  const from = request.manifest.formatVersion;
  const path = resolveMigrationPath({ from, to: target, registry: request.registry });
  if (!path.ok) {
    return { ok: false, error: path.error, applied, warnings };
  }

  let manifest = request.manifest;
  let tables = request.tables;

  for (const migration of path.steps) {
    let stepOutput: MigrationResult;
    try {
      stepOutput = await migration.migrate(manifest, tables);
    } catch (error) {
      const appError = toAppError(error);
      return failure(
        `Migration ${String(migration.from)}->${String(migration.to)} failed.`,
        `${appError.code}: ${appError.message}`,
        applied,
        warnings,
      );
    }

    const check = validateStepOutput(migration, stepOutput.manifest, stepOutput.tables);
    if (check.error !== null) {
      return failure(
        `Migration ${String(migration.from)}->${String(migration.to)} produced an invalid workspace.`,
        check.error.detail ?? check.error.message,
        applied,
        [...warnings, ...check.warnings],
      );
    }

    warnings.push(...check.warnings);
    if (stepOutput.warnings !== undefined) {
      warnings.push(...stepOutput.warnings);
    }

    applied.push(migration.from);
    manifest = stepOutput.manifest;
    tables = stepOutput.tables;
  }

  return { ok: true, manifest, tables, applied, warnings };
}
