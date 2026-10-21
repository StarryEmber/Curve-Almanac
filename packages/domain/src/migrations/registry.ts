import { createAppError } from '../errors';

import type {
  Migration,
  MigrationPathRequest,
  MigrationPathResult,
  MigrationRegistry,
} from './types';

function invalidRegistry(message: string, detail?: string): never {
  throw createAppError('E_VALIDATION', message, detail === undefined ? undefined : { detail });
}

/**
 * Builds the ordered registry used by `runMigrations`.
 *
 * A bad registry is a programming error, not user input, so it throws
 * `E_VALIDATION` immediately: every step must advance exactly one version, no
 * two steps may share a source version, and versions are non-negative integers.
 */
export function createMigrationRegistry(migrations: readonly Migration[]): MigrationRegistry {
  const byFrom = new Map<number, Migration>();

  for (const migration of migrations) {
    if (!Number.isInteger(migration.from) || migration.from < 0) {
      invalidRegistry(
        'A migration must start at a non-negative integer format version.',
        `from=${String(migration.from)}`,
      );
    }
    if (!Number.isInteger(migration.to) || migration.to !== migration.from + 1) {
      invalidRegistry(
        'A migration must advance the format version by exactly one.',
        `from=${String(migration.from)} to=${String(migration.to)}`,
      );
    }
    if (byFrom.has(migration.from)) {
      invalidRegistry(
        'Two migrations start at the same format version.',
        `from=${String(migration.from)}`,
      );
    }
    byFrom.set(migration.from, migration);
  }

  return {
    get(from: number): Migration | undefined {
      return byFrom.get(from);
    },
    versions(): readonly number[] {
      return [...byFrom.keys()].sort((left, right) => left - right);
    },
  };
}

/**
 * Resolves the ordered steps from `from` to `to`. A version without a
 * registered step is a failure, never a silent skip (SPEC §7.6).
 */
export function resolveMigrationPath(request: MigrationPathRequest): MigrationPathResult {
  const { from, to, registry } = request;

  if (!Number.isInteger(from) || from < 0 || !Number.isInteger(to) || to < 0) {
    return {
      ok: false,
      error: createAppError(
        'E_MIGRATION_FAILED',
        'The migration path is not a pair of format versions.',
        { detail: `from=${String(from)} to=${String(to)}` },
      ),
    };
  }

  if (from > to) {
    return {
      ok: false,
      error: createAppError('E_MIGRATION_FAILED', 'Downgrading a workspace is not supported.', {
        detail: `from=${String(from)} to=${String(to)}`,
      }),
    };
  }

  const steps: Migration[] = [];
  for (let version = from; version < to; version += 1) {
    const migration = registry.get(version);
    if (migration === undefined) {
      return {
        ok: false,
        error: createAppError(
          'E_MIGRATION_FAILED',
          'No migration is registered for this workspace format version.',
          { detail: `missing=${String(version)}->${String(version + 1)}` },
        ),
      };
    }
    steps.push(migration);
  }

  return { ok: true, steps };
}
