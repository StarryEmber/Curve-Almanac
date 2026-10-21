import { describe, expect, it } from 'vitest';

import { createAppError } from '../errors';

import { createMigrationRegistry } from './registry';
import { runMigrations } from './run';

import type { Row, TableMeta, WorkspaceManifest } from '../types';
import type { Migration, MigrationResult, MigrationTables } from './types';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function table(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Table',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [{ id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' }],
    primaryKey: 'col_id',
    rowCount: 2,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

const ROWS: Row[] = [
  { id: 'row_1', values: ['a'] },
  { id: 'row_2', values: ['b'] },
];

function v1Manifest(overrides: Partial<WorkspaceManifest> = {}): WorkspaceManifest {
  return {
    formatVersion: 1,
    id: 'ws_test',
    name: 'Test',
    appVersion: '0.1.0',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    tables: [table()],
    charts: [],
    views: [],
    tableStyles: [],
    layout: { type: 'pane', viewIds: [], activeViewId: null },
    settings: {
      theme: 'system',
      locale: 'zh-CN',
      defaultTableStyleId: 'builtin.report-light',
      autosave: true,
    },
    ...overrides,
  };
}

function tables(entries: Array<[string, readonly Row[]]> = [['tbl_1', ROWS]]): MigrationTables {
  return new Map(entries);
}

/** v0 tables had no `schemaVersion`; the type below only exists in tests. */
interface LegacyTable extends Omit<TableMeta, 'schemaVersion'> {
  schemaVersion?: number;
}

function legacyV0Manifest(): WorkspaceManifest {
  const current = v1Manifest();
  const legacyTables = current.tables.map((entry): LegacyTable => {
    const copy: LegacyTable = { ...entry };
    delete copy.schemaVersion;
    return copy;
  });
  return { ...current, formatVersion: 0, tables: legacyTables } as unknown as WorkspaceManifest;
}

/** Test-only v0 -> v1 step: adds the table `schemaVersion` introduced in v1. */
const V0_TO_V1: Migration = {
  from: 0,
  to: 1,
  migrate(manifest, currentTables): MigrationResult {
    const legacy = manifest as unknown as { tables: LegacyTable[] };
    return {
      manifest: {
        ...manifest,
        formatVersion: 1,
        tables: legacy.tables.map((entry) => ({ ...entry, schemaVersion: 1 })),
      },
      tables: currentTables,
      warnings: ['table schemaVersion defaulted to 1'],
    };
  },
};

describe('migration execution', () => {
  describe('runMigrations', () => {
    it('opens a v0 document through the injected test migration and keeps rows equal', async () => {
      const inputRows = tables();
      const outcome = await runMigrations({
        manifest: legacyV0Manifest(),
        tables: inputRows,
        registry: createMigrationRegistry([V0_TO_V1]),
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) {
        return;
      }
      expect(outcome.manifest.formatVersion).toBe(1);
      expect(outcome.manifest.tables[0]?.schemaVersion).toBe(1);
      expect(outcome.tables.get('tbl_1')).toEqual(inputRows.get('tbl_1'));
      expect(outcome.applied).toEqual([0]);
      expect(outcome.warnings).toContain('table schemaVersion defaulted to 1');
    });

    it('is a no-op for a v1 workspace with the production (empty) registry', async () => {
      const manifest = v1Manifest();

      const outcome = await runMigrations({
        manifest,
        tables: tables(),
        registry: createMigrationRegistry([]),
      });

      expect(outcome).toEqual({
        ok: true,
        manifest,
        tables: tables(),
        applied: [],
        warnings: [],
      });
    });

    it('fails when no migration bridges the requested versions', async () => {
      const outcome = await runMigrations({
        manifest: legacyV0Manifest(),
        tables: tables(),
        registry: createMigrationRegistry([]),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.code).toBe('E_MIGRATION_FAILED');
        expect(outcome.error.detail).toBe('missing=0->1');
        expect(outcome.applied).toEqual([]);
      }
    });

    it('runs several contiguous steps and reports each applied version', async () => {
      const v1ToV2: Migration = {
        from: 1,
        to: 2,
        migrate: (manifest, currentTables) => ({
          manifest: { ...manifest, formatVersion: 2 } as unknown as WorkspaceManifest,
          tables: currentTables,
        }),
      };

      const outcome = await runMigrations({
        manifest: legacyV0Manifest(),
        tables: tables(),
        registry: createMigrationRegistry([V0_TO_V1, v1ToV2]),
        target: 2,
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.applied).toEqual([0, 1]);
        expect((outcome.manifest as unknown as { formatVersion: number }).formatVersion).toBe(2);
      }
    });

    it('fails a step that produces a manifest violating an invariant', async () => {
      const brokenInvariant: Migration = {
        from: 0,
        to: 1,
        migrate: () => ({
          manifest: {
            ...v1Manifest(),
            layout: { type: 'pane', viewIds: ['viw_missing'], activeViewId: null },
          },
          tables: tables(),
        }),
      };

      const outcome = await runMigrations({
        manifest: legacyV0Manifest(),
        tables: tables(),
        registry: createMigrationRegistry([brokenInvariant]),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.code).toBe('E_MIGRATION_FAILED');
        expect(outcome.error.detail).toContain('layout');
        expect(outcome.applied).toEqual([]);
      }
    });

    it('fails a step that produces a structurally invalid v1 manifest', async () => {
      const brokenSchema: Migration = {
        from: 0,
        to: 1,
        migrate: (manifest, currentTables) => ({
          manifest: {
            ...manifest,
            formatVersion: 1,
            settings: undefined,
          } as unknown as WorkspaceManifest,
          tables: currentTables,
        }),
      };

      const outcome = await runMigrations({
        manifest: legacyV0Manifest(),
        tables: tables(),
        registry: createMigrationRegistry([brokenSchema]),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.code).toBe('E_MIGRATION_FAILED');
        expect(outcome.error.detail).toContain('settings');
      }
    });

    it('fails a step that does not advance the format version', async () => {
      const stuck: Migration = {
        from: 0,
        to: 1,
        migrate: (manifest, currentTables) => ({
          manifest: { ...manifest, formatVersion: 0 } as unknown as WorkspaceManifest,
          tables: currentTables,
        }),
      };

      const outcome = await runMigrations({
        manifest: legacyV0Manifest(),
        tables: tables(),
        registry: createMigrationRegistry([stuck]),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.detail).toBe('expected formatVersion=1, got 0');
      }
    });

    it('fails a step that throws and keeps the earlier applied versions', async () => {
      const throwing: Migration = {
        from: 1,
        to: 2,
        migrate: () => {
          throw createAppError('E_MIGRATION_FAILED', 'step exploded');
        },
      };

      const outcome = await runMigrations({
        manifest: legacyV0Manifest(),
        tables: tables(),
        registry: createMigrationRegistry([V0_TO_V1, throwing]),
        target: 2,
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.code).toBe('E_MIGRATION_FAILED');
        expect(outcome.error.detail).toContain('step exploded');
        expect(outcome.applied).toEqual([0]);
      }
    });

    it('fails a step that emits rows for an unknown table', async () => {
      const orphanRows: Migration = {
        from: 0,
        to: 1,
        migrate: (manifest, currentTables) => ({
          manifest: { ...manifest, formatVersion: 1 },
          tables: new Map([...currentTables, ['tbl_ghost', ROWS]]),
        }),
      };

      const outcome = await runMigrations({
        manifest: legacyV0Manifest(),
        tables: tables(),
        registry: createMigrationRegistry([orphanRows]),
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.detail).toContain('tbl_ghost');
      }
    });
  });
});
