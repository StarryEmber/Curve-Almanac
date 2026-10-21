import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { MIGRATIONS, runMigrations } from '@curve/domain';
import type { Row } from '@curve/domain';
import { parseManifestDocument } from '@curve/persistence';
import { decodeJsonl } from '@curve/table-engine';

import { FileWorkspaceStore } from './file-workspace-store';

const FIXTURES = fileURLToPath(new URL('../../../../../fixtures/workspaces/', import.meta.url));
const NOW = new Date('2026-10-21T00:00:00.000Z');

const EXPECTED_ROWS: Row[] = [
  { id: 'row_0001', values: ['sensor-1', 1735689600000, 21.5] },
  { id: 'row_0002', values: ['sensor-2', 1735689660000, 23.1] },
  { id: 'row_0003', values: ['sensor-3', 1735689720000, 19.8] },
];

const TEMP_DIRECTORIES: string[] = [];

afterEach(() => {
  for (const directory of TEMP_DIRECTORIES.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTemp(): string {
  const directory = mkdtempSync(join(tmpdir(), 'curve-fixture-'));
  TEMP_DIRECTORIES.push(directory);
  return directory;
}

/** Copies a fixture so opening it cannot dirty the repository. */
function copyFixture(name: string): string {
  const root = join(makeTemp(), `${name}.cstudio`);
  cpSync(join(FIXTURES, name), root, { recursive: true });
  return root;
}

function createStore(): FileWorkspaceStore {
  return new FileWorkspaceStore({
    userDataPath: join(makeTemp(), 'userData'),
    appVersion: '0.1.0',
    now: () => new Date(NOW),
  });
}

describe('fixtures/workspaces/v1-min', () => {
  it('opens the v1 snapshot and returns every row unchanged', async () => {
    const root = copyFixture('v1-min');
    const manifestBefore = readFileSync(join(root, 'manifest.json'), 'utf8');
    const store = createStore();

    const { manifest, warnings } = await store.open({ dir: root });

    expect(warnings).toEqual([]);
    expect(manifest.id).toBe('ws_v1min');
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.tables).toHaveLength(1);
    expect(readFileSync(join(root, 'manifest.json'), 'utf8')).toBe(manifestBefore);

    const table = manifest.tables[0];
    expect(table).toBeDefined();
    if (table === undefined) {
      return;
    }
    expect(table).toMatchObject({
      id: 'tbl_v1min',
      file: 'tables/tbl_v1min.jsonl',
      primaryKey: 'col_id',
      rowCount: 3,
    });
    expect(table.columns.map((column) => column.type)).toEqual(['text', 'date', 'number']);

    const { jsonl } = await store.readTable({
      workspaceId: manifest.id,
      tableId: 'tbl_v1min',
    });
    const decoded = decodeJsonl(jsonl, table);
    expect(decoded.issues).toEqual([]);
    expect(decoded.rows).toEqual(EXPECTED_ROWS);
    expect(decoded.rows).toHaveLength(table.rowCount);

    // The production registry is empty (ADR-024), so a v1 fixture must pass
    // through the executor unchanged.
    const migrated = await runMigrations({
      manifest,
      tables: new Map([[table.id, decoded.rows]]),
      registry: MIGRATIONS,
    });
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.manifest).toEqual(manifest);
      expect(migrated.applied).toEqual([]);
      expect(migrated.tables.get(table.id)).toEqual(EXPECTED_ROWS);
    }

    await store.close({ workspaceId: manifest.id });
  });

  it('writes and removes the lock around the open workspace (SPEC §7.5)', async () => {
    const root = copyFixture('v1-min');
    const store = createStore();

    const { manifest } = await store.open({ dir: root });

    const lockPath = join(root, '.lock');
    expect(existsSync(lockPath)).toBe(true);
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toMatchObject({ pid: process.pid });

    await store.close({ workspaceId: manifest.id });
    expect(existsSync(lockPath)).toBe(false);
  });
});

describe('fixtures/workspaces/future-version', () => {
  it('is rejected by the persistence document parser before any schema parsing', () => {
    const root = copyFixture('future-version');
    const raw = readFileSync(join(root, 'manifest.json'), 'utf8');

    expect(() => parseManifestDocument(raw)).toThrow(
      expect.objectContaining({
        code: 'E_WS_VERSION_UNSUPPORTED',
        detail: 'formatVersion=2',
      }),
    );
  });

  it('refuses to open, leaves the manifest byte-identical and writes no lock', async () => {
    const root = copyFixture('future-version');
    const manifestBefore = readFileSync(join(root, 'manifest.json'), 'utf8');

    await expect(createStore().open({ dir: root })).rejects.toMatchObject({
      code: 'E_WS_VERSION_UNSUPPORTED',
    });

    expect(readFileSync(join(root, 'manifest.json'), 'utf8')).toBe(manifestBefore);
    expect(existsSync(join(root, '.lock'))).toBe(false);
  });
});

describe('fixtures/workspaces/corrupt-manifest', () => {
  it('reports E_WS_INVALID_MANIFEST and never overwrites the broken file', async () => {
    const root = copyFixture('corrupt-manifest');
    const manifestBefore = readFileSync(join(root, 'manifest.json'), 'utf8');

    await expect(createStore().open({ dir: root })).rejects.toMatchObject({
      code: 'E_WS_INVALID_MANIFEST',
    });

    expect(readFileSync(join(root, 'manifest.json'), 'utf8')).toBe(manifestBefore);
    expect(existsSync(join(root, '.lock'))).toBe(false);
  });
});

describe('fixtures/workspaces/stale-lock', () => {
  it('opens past the stale lock, warns, replaces it and keeps the rows', async () => {
    const root = copyFixture('stale-lock');
    const store = createStore();

    const { manifest, warnings } = await store.open({ dir: root });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('stale lock');

    const lockPath = join(root, '.lock');
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toMatchObject({
      pid: process.pid,
      startedAt: NOW.toISOString(),
    });

    const { jsonl } = await store.readTable({
      workspaceId: manifest.id,
      tableId: 'tbl_stalelock',
    });
    const table = manifest.tables[0];
    expect(table).toBeDefined();
    if (table === undefined) {
      return;
    }
    const decoded = decodeJsonl(jsonl, table);
    expect(decoded.issues).toEqual([]);
    expect(decoded.rows).toEqual(EXPECTED_ROWS);

    await store.close({ workspaceId: manifest.id });
    expect(existsSync(lockPath)).toBe(false);
  });
});
