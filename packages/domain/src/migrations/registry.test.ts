import { describe, expect, it } from 'vitest';

import { createMigrationRegistry, resolveMigrationPath } from './registry';

import type { Migration } from './types';

function migration(from: number, to: number): Migration {
  return {
    from,
    to,
    migrate: (manifest) => ({ manifest, tables: new Map() }),
  };
}

describe('migration registry', () => {
  describe('createMigrationRegistry', () => {
    it('indexes migrations by their source version and sorts the versions', () => {
      const registry = createMigrationRegistry([migration(2, 3), migration(0, 1), migration(1, 2)]);

      expect(registry.get(0)?.to).toBe(1);
      expect(registry.get(2)?.to).toBe(3);
      expect(registry.get(9)).toBeUndefined();
      expect(registry.versions()).toEqual([0, 1, 2]);
    });

    it('rejects a migration that skips a format version', () => {
      expect(() => createMigrationRegistry([migration(0, 2)])).toThrow(
        expect.objectContaining({ code: 'E_VALIDATION' }),
      );
    });

    it('rejects duplicate source versions', () => {
      expect(() => createMigrationRegistry([migration(0, 1), migration(0, 1)])).toThrow(
        expect.objectContaining({ code: 'E_VALIDATION' }),
      );
    });

    it('rejects negative or fractional versions', () => {
      expect(() => createMigrationRegistry([migration(-1, 0)])).toThrow(
        expect.objectContaining({ code: 'E_VALIDATION' }),
      );
      expect(() => createMigrationRegistry([migration(0.5, 1.5)])).toThrow(
        expect.objectContaining({ code: 'E_VALIDATION' }),
      );
    });

    it('accepts an empty registry for the current v1-only format', () => {
      const registry = createMigrationRegistry([]);
      expect(registry.versions()).toEqual([]);
      expect(registry.get(0)).toBeUndefined();
    });
  });

  describe('resolveMigrationPath', () => {
    it('returns no steps when the manifest already is at the target version', () => {
      const result = resolveMigrationPath({
        from: 1,
        to: 1,
        registry: createMigrationRegistry([]),
      });

      expect(result).toEqual({ ok: true, steps: [] });
    });

    it('chains contiguous steps in ascending order', () => {
      const first = migration(0, 1);
      const second = migration(1, 2);
      const result = resolveMigrationPath({
        from: 0,
        to: 2,
        registry: createMigrationRegistry([second, first]),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.steps).toEqual([first, second]);
      }
    });

    it('reports the missing step instead of skipping a version', () => {
      const result = resolveMigrationPath({
        from: 0,
        to: 2,
        registry: createMigrationRegistry([migration(0, 1)]),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_MIGRATION_FAILED');
        expect(result.error.detail).toBe('missing=1->2');
      }
    });

    it('rejects downgrades and invalid version numbers', () => {
      const registry = createMigrationRegistry([migration(0, 1)]);

      expect(resolveMigrationPath({ from: 1, to: 0, registry })).toMatchObject({
        ok: false,
        error: { code: 'E_MIGRATION_FAILED', detail: 'from=1 to=0' },
      });
      expect(resolveMigrationPath({ from: -1, to: 1, registry })).toMatchObject({
        ok: false,
        error: { code: 'E_MIGRATION_FAILED' },
      });
      expect(resolveMigrationPath({ from: 0, to: 1.5, registry })).toMatchObject({
        ok: false,
        error: { code: 'E_MIGRATION_FAILED' },
      });
    });
  });
});
