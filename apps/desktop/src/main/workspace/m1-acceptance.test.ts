/**
 * M1 acceptance demo (docs/TASKS.md, milestone M1).
 *
 * The milestone asks for one reproducible run that:
 *
 * 1. creates `Demo.cstudio`, writes 1,000 rows, closes the workspace and
 *    reopens it from a fresh adapter instance (an app restart), then compares
 *    every row with the rows that were written;
 * 2. tampers with `manifest.json` and proves the open fails with a typed error
 *    while the file on disk stays byte-identical;
 * 3. forges `.lock` and proves the recovery path runs (stale lock is reported
 *    and replaced; an active lock is refused).
 *
 * It deliberately uses only the production main-process adapter,
 * `@curve/persistence` and `@curve/table-engine`; no fake store. The renderer
 * side of the M1 gate is covered by the T1.5 app-core suite and the workspace
 * E2E spec.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ColumnDef, Row, TableMeta, ViewDef, WorkspaceManifest } from '@curve/domain';
import { countJsonlRows, decodeJsonl, encodeJsonl } from '@curve/table-engine';

import { FileWorkspaceStore } from './file-workspace-store';

const NOW = new Date('2026-10-21T00:00:00.000Z');
const CREATED_AT = NOW.toISOString();
const UPDATED_AT = '2026-10-21T00:05:00.000Z';
const APP_VERSION = '0.1.0';
const ROW_COUNT = 1_000;

const TABLE_ID = 'tbl_m1demo';
const VIEW_ID = 'viw_m1demo';
const COLUMN_ID = 'col_m1_id';
const COLUMN_TIME = 'col_m1_time';
const COLUMN_VALUE = 'col_m1_value';

const COLUMNS: ColumnDef[] = [
  { id: COLUMN_ID, key: 'id', label: 'ID', type: 'text', role: 'none' },
  { id: COLUMN_TIME, key: 'time', label: 'Time', type: 'date', role: 'x' },
  {
    id: COLUMN_VALUE,
    key: 'sensor_a',
    label: 'Sensor A',
    type: 'number',
    role: 'y',
    unit: '°C',
    precision: 1,
  },
];

const VIEW: ViewDef = {
  id: VIEW_ID,
  kind: 'table',
  refId: TABLE_ID,
  title: 'Sensor readings',
  tableView: {
    tableId: TABLE_ID,
    styleId: 'builtin.report-light',
    columnOrder: COLUMNS.map((column) => column.id),
    widths: {},
    hiddenColumnIds: [],
    sort: [],
    frozenColumnCount: 0,
  },
};

const TEMP_DIRECTORIES: string[] = [];

afterEach(() => {
  for (const directory of TEMP_DIRECTORIES.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTemp(): string {
  const directory = mkdtempSync(join(tmpdir(), 'curve-m1-'));
  TEMP_DIRECTORIES.push(directory);
  return directory;
}

function createStore(userDataPath: string): FileWorkspaceStore {
  return new FileWorkspaceStore({
    userDataPath,
    appVersion: APP_VERSION,
    now: () => new Date(NOW),
    // A fixed workspace id keeps the demo workspace and its manifest hash
    // reproducible across runs; production uses `crypto.randomUUID()`.
    uuid: () => 'm1demo',
  });
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Deterministic 1,000-row fixture: text key, epoch-ms date, nullable number. */
function demoRows(): Row[] {
  const epoch = Date.UTC(2026, 0, 1);
  const rows: Row[] = [];
  for (let index = 1; index <= ROW_COUNT; index += 1) {
    rows.push({
      id: `row_${String(index).padStart(4, '0')}`,
      values: [
        `sensor-${String(index)}`,
        epoch + index * 60_000,
        index % 97 === 0 ? null : Math.round((20 + (index % 50) / 10) * 10) / 10,
      ],
    });
  }
  return rows;
}

function demoTable(rowCount: number, updatedAt: string): TableMeta {
  return {
    id: TABLE_ID,
    name: 'Sensor readings',
    file: `tables/${TABLE_ID}.jsonl`,
    schemaVersion: 1,
    columns: COLUMNS,
    primaryKey: COLUMN_ID,
    rowCount,
    createdAt: CREATED_AT,
    updatedAt,
  };
}

function withTable(base: WorkspaceManifest, table: TableMeta): WorkspaceManifest {
  return {
    ...base,
    tables: [table],
    views: [VIEW],
    layout: { type: 'pane', viewIds: [VIEW.id], activeViewId: VIEW.id },
    updatedAt: UPDATED_AT,
  };
}

interface SeededWorkspace {
  temp: string;
  root: string;
  userDataPath: string;
  store: FileWorkspaceStore;
  manifest: WorkspaceManifest;
  table: TableMeta;
  rows: Row[];
  jsonl: string;
  bytes: number;
}

/**
 * Creates `Demo.cstudio` through the production adapter and fills it with the
 * demo table. The write order follows SPEC §7.4 and ADR-022: the table entry
 * first exists as an unwritten empty table (`rowCount: 0`), the data file is
 * written next, and the manifest is rewritten last.
 */
async function seedDemoWorkspace(): Promise<SeededWorkspace> {
  const temp = makeTemp();
  const parent = join(temp, 'parent');
  mkdirSync(parent, { recursive: true });
  const userDataPath = join(temp, 'userData');
  const store = createStore(userDataPath);

  const created = await store.create({ dir: parent, name: 'Demo' });
  const root = join(parent, 'Demo.cstudio');

  const rows = demoRows();
  const jsonl = encodeJsonl(rows);
  expect(jsonl.length).toBeGreaterThan(0);

  await store.writeManifest({
    workspaceId: created.id,
    manifest: withTable(created, demoTable(0, CREATED_AT)),
  });
  const written = await store.writeTable({
    workspaceId: created.id,
    tableId: TABLE_ID,
    jsonl,
  });
  const manifest = withTable(created, demoTable(rows.length, UPDATED_AT));
  await store.writeManifest({ workspaceId: created.id, manifest });

  const table = manifest.tables[0];
  if (table === undefined) {
    throw new Error('The seeded manifest has no table entry.');
  }

  return {
    temp,
    root,
    userDataPath,
    store,
    manifest,
    table,
    rows,
    jsonl,
    bytes: written.bytes,
  };
}

describe('M1 acceptance demo', () => {
  it('creates Demo.cstudio, writes 1,000 rows and reads them back row-for-row after a restart', async () => {
    const seed = await seedDemoWorkspace();
    const tablePath = join(seed.root, 'tables', `${TABLE_ID}.jsonl`);
    const manifestPath = join(seed.root, 'manifest.json');

    // 1. SPEC §7.1 layout and the manifest written by `workspace:create`.
    expect(seed.manifest.name).toBe('Demo');
    expect(seed.manifest.formatVersion).toBe(1);
    expect(seed.manifest.tables).toHaveLength(1);
    expect(seed.manifest.views).toHaveLength(1);
    for (const directory of ['tables', 'backups', 'imports', '.trash']) {
      expect(existsSync(join(seed.root, directory))).toBe(true);
    }
    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(join(seed.root, '.lock'))).toBe(true);

    // 2. The .jsonl file is UTF-8 without BOM, ends with \n and has 1,000 lines.
    const writtenBytes = readFileSync(tablePath);
    const writtenText = writtenBytes.toString('utf8');
    expect(writtenText).toBe(seed.jsonl);
    expect(writtenText.startsWith('\uFEFF')).toBe(false);
    expect(writtenText.endsWith('\n')).toBe(true);
    expect(writtenText.split('\n')).toHaveLength(ROW_COUNT + 1);
    expect(countJsonlRows(writtenText)).toBe(ROW_COUNT);
    expect(writtenBytes.byteLength).toBe(seed.bytes);
    expect(statSync(tablePath).size).toBe(seed.bytes);

    const decoded = decodeJsonl(writtenText, seed.table);
    expect(decoded.issues).toEqual([]);
    expect(decoded.stats).toEqual({ total: ROW_COUNT, accepted: ROW_COUNT, skipped: 0 });
    expect(decoded.rows).toEqual(seed.rows);

    const manifestBefore = readFileSync(manifestPath);
    const tableBefore = readFileSync(tablePath);
    const manifestSha = sha256(manifestBefore);
    const tableSha = sha256(tableBefore);

    // 3. Close: the lock disappears and the recent list remembers the workspace.
    await seed.store.close({ workspaceId: seed.manifest.id });
    expect(existsSync(join(seed.root, '.lock'))).toBe(false);
    await expect(seed.store.listRecent()).resolves.toEqual([
      expect.objectContaining({ path: seed.root, name: 'Demo' }),
    ]);

    // 4. Reopen from a fresh adapter instance, i.e. an application restart.
    const reopened = createStore(seed.userDataPath);
    const opened = await reopened.open({ dir: seed.root });
    expect(opened.warnings).toEqual([]);
    expect(opened.manifest).toEqual(seed.manifest);
    expect(opened.manifest.updatedAt).toBe(UPDATED_AT);
    expect(opened.manifest.tables[0]?.rowCount).toBe(ROW_COUNT);
    expect(existsSync(join(seed.root, '.lock'))).toBe(true);

    const readBack = await reopened.readTable({
      workspaceId: opened.manifest.id,
      tableId: TABLE_ID,
    });
    expect(readBack.jsonl).toBe(seed.jsonl);
    expect(readBack.bytes).toBe(seed.bytes);

    const redecoded = decodeJsonl(readBack.jsonl, seed.table);
    expect(redecoded.issues).toEqual([]);
    expect(redecoded.rows).toHaveLength(ROW_COUNT);
    for (let index = 0; index < seed.rows.length; index += 1) {
      expect(redecoded.rows[index]).toEqual(seed.rows[index]);
    }
    expect(redecoded.rows).toEqual(seed.rows);

    // 5. No rewrite on open: rowCount already matched, so both files keep
    // their bytes (and `updatedAt` is not touched by the row-count check).
    expect(sha256(readFileSync(manifestPath))).toBe(manifestSha);
    expect(sha256(readFileSync(tablePath))).toBe(tableSha);

    await reopened.close({ workspaceId: opened.manifest.id });
    expect(existsSync(join(seed.root, '.lock'))).toBe(false);
  });

  it('refuses a tampered manifest and leaves every original byte untouched', async () => {
    const seed = await seedDemoWorkspace();
    await seed.store.close({ workspaceId: seed.manifest.id });

    const manifestPath = join(seed.root, 'manifest.json');
    const backupsPath = join(seed.root, 'backups');
    const good = readFileSync(manifestPath);
    const backupsBefore = readdirSync(backupsPath).sort();

    // A. Truncated JSON: the classic corrupt-manifest case.
    writeFileSync(manifestPath, good.toString('utf8').slice(0, 120));
    const truncated = readFileSync(manifestPath);
    const truncatedSha = sha256(truncated);
    await expect(createStore(seed.userDataPath).open({ dir: seed.root })).rejects.toMatchObject({
      code: 'E_WS_INVALID_MANIFEST',
    });
    expect(sha256(readFileSync(manifestPath))).toBe(truncatedSha);
    expect(existsSync(join(seed.root, '.lock'))).toBe(false);
    expect(readdirSync(backupsPath).sort()).toEqual(backupsBefore);

    // B. Valid JSON that violates an invariant: a dangling primary key. The
    // file must be rejected before any migration, repair or lock write.
    const tampered = JSON.parse(good.toString('utf8')) as { tables: { primaryKey: string }[] };
    const tableEntry = tampered.tables[0];
    expect(tableEntry).toBeDefined();
    if (tableEntry === undefined) {
      return;
    }
    tableEntry.primaryKey = 'col_missing';
    writeFileSync(manifestPath, `${JSON.stringify(tampered, null, 2)}\n`);
    const invariantTampered = readFileSync(manifestPath);
    const invariantSha = sha256(invariantTampered);
    await expect(createStore(seed.userDataPath).open({ dir: seed.root })).rejects.toMatchObject({
      code: 'E_WS_INVALID_MANIFEST',
    });
    expect(sha256(readFileSync(manifestPath))).toBe(invariantSha);
    expect(existsSync(join(seed.root, '.lock'))).toBe(false);
    expect(readdirSync(backupsPath).sort()).toEqual(backupsBefore);

    // C. A future formatVersion is rejected with its own code and the newer
    // workspace file is likewise not rewritten (SPEC §7.6).
    const future = JSON.parse(good.toString('utf8')) as { formatVersion: number };
    future.formatVersion = 2;
    writeFileSync(manifestPath, `${JSON.stringify(future, null, 2)}\n`);
    const futureSha = sha256(readFileSync(manifestPath));
    await expect(createStore(seed.userDataPath).open({ dir: seed.root })).rejects.toMatchObject({
      code: 'E_WS_VERSION_UNSUPPORTED',
      detail: 'formatVersion=2',
    });
    expect(sha256(readFileSync(manifestPath))).toBe(futureSha);
    expect(existsSync(join(seed.root, '.lock'))).toBe(false);

    // Restore the good file so cleanup never removes a half-written workspace.
    writeFileSync(manifestPath, good);
  });

  it('takes the stale-lock recovery path and refuses an active lock', async () => {
    const seed = await seedDemoWorkspace();
    await seed.store.close({ workspaceId: seed.manifest.id });
    const lockPath = join(seed.root, '.lock');

    // A. A forged lock with a dead PID and a 2020 timestamp is stale: SPEC §7.5
    // requires a "last session did not close cleanly" notice and replacement.
    const stale = { pid: 999_999, startedAt: '2020-01-01T00:00:00.000Z', appVersion: APP_VERSION };
    writeFileSync(lockPath, `${JSON.stringify(stale)}\n`);

    const store = createStore(seed.userDataPath);
    const opened = await store.open({ dir: seed.root });
    expect(opened.warnings).toHaveLength(1);
    expect(opened.warnings[0]).toContain('stale lock');
    expect(opened.warnings[0]).toContain('did not close this workspace cleanly');
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toMatchObject({
      pid: process.pid,
      startedAt: NOW.toISOString(),
      appVersion: APP_VERSION,
    });

    const readBack = await store.readTable({
      workspaceId: opened.manifest.id,
      tableId: TABLE_ID,
    });
    const decoded = decodeJsonl(readBack.jsonl, seed.table);
    expect(decoded.issues).toEqual([]);
    expect(decoded.rows).toEqual(seed.rows);

    await store.close({ workspaceId: opened.manifest.id });
    expect(existsSync(lockPath)).toBe(false);

    // B. A live lock is refused and left untouched: the second window must not
    // be able to steal the workspace.
    const active = { pid: process.pid, startedAt: NOW.toISOString(), appVersion: APP_VERSION };
    writeFileSync(lockPath, `${JSON.stringify(active)}\n`);
    const activeBytes = readFileSync(lockPath);
    await expect(createStore(seed.userDataPath).open({ dir: seed.root })).rejects.toMatchObject({
      code: 'E_WS_LOCKED',
      detail: `pid=${String(process.pid)}`,
    });
    expect(readFileSync(lockPath).equals(activeBytes)).toBe(true);

    // C. An unreadable lock is also part of the recovery path: warn and replace.
    writeFileSync(lockPath, 'not a lock document\n');
    const recoveredStore = createStore(seed.userDataPath);
    const recovered = await recoveredStore.open({ dir: seed.root });
    expect(recovered.warnings).toHaveLength(1);
    expect(recovered.warnings[0]).toContain('unreadable');
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toMatchObject({ pid: process.pid });
    await recoveredStore.close({ workspaceId: recovered.manifest.id });
    expect(existsSync(lockPath)).toBe(false);
  });

  it('offers the T5.3 recovery choices and keeps the rows row-for-row', async () => {
    const seed = await seedDemoWorkspace();
    await seed.store.close({ workspaceId: seed.manifest.id });
    const manifestPath = join(seed.root, 'manifest.json');
    const lockPath = join(seed.root, '.lock');

    // A. Read-only pre-flight: a clean workspace has no lock and reads fine.
    const cleanStore = createStore(seed.userDataPath);
    const clean = await cleanStore.inspect({ dir: seed.root });
    expect(clean.lock).toBe('none');
    expect(clean.manifest).toBe('ok');
    expect(clean.backups.length).toBeGreaterThan(0);

    // B. "Try recovery" after an unclean exit opens the readable manifest.
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        pid: 999_999,
        startedAt: '2020-01-01T00:00:00.000Z',
        appVersion: APP_VERSION,
      })}\n`,
    );
    const stale = await cleanStore.inspect({ dir: seed.root });
    expect(stale.lock).toBe('stale');
    expect(stale.manifest).toBe('ok');

    const recovered = await cleanStore.open({
      dir: seed.root,
      recovery: { acceptStaleLock: true },
    });
    const readBack = await cleanStore.readTable({
      workspaceId: recovered.manifest.id,
      tableId: TABLE_ID,
    });
    expect(decodeJsonl(readBack.jsonl, seed.table).rows).toEqual(seed.rows);
    await cleanStore.close({ workspaceId: recovered.manifest.id });

    // C. A corrupt manifest is rebuilt from the newest backup after confirmation.
    writeFileSync(manifestPath, '{"formatVersion":1,"tables":[');
    const corrupt = readFileSync(manifestPath);
    const broken = await cleanStore.inspect({ dir: seed.root });
    expect(broken.manifest).toBe('invalid');
    expect(broken.errorCode).toBe('E_WS_INVALID_MANIFEST');
    const backup = broken.backups[0];
    expect(backup).toBeDefined();
    if (backup === undefined) {
      return;
    }

    // Refusing recovery must leave the corrupt file untouched.
    await expect(cleanStore.open({ dir: seed.root })).rejects.toMatchObject({
      code: 'E_WS_INVALID_MANIFEST',
    });
    expect(readFileSync(manifestPath)).toEqual(corrupt);
    expect(existsSync(lockPath)).toBe(false);

    const rebuilt = await cleanStore.open({
      dir: seed.root,
      recovery: { manifestBackup: backup.path },
    });
    expect(rebuilt.warnings.join('\n')).toContain('rebuilt from');
    const rebuiltRows = await cleanStore.readTable({
      workspaceId: rebuilt.manifest.id,
      tableId: TABLE_ID,
    });
    expect(decodeJsonl(rebuiltRows.jsonl, seed.table).rows).toEqual(seed.rows);
    await cleanStore.close({ workspaceId: rebuilt.manifest.id });
  });
});
