/**
 * Generates the large fixtures shared by `pnpm bench` and the E2E perf spec
 * (TESTPLAN §4, TASKS T2.7).
 *
 * Usage:
 *   pnpm exec tsx scripts/gen-100k.ts [--if-missing] [--out <csv path>]
 *   pnpm exec tsx scripts/gen-100k.ts --workspace <dir> [--if-missing]
 *
 * The GBK CSV (import fixture) and the 100k × 10 workspace (performance fixture)
 * are deterministic and git-ignored; the committed small fixtures live under
 * `fixtures/`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import iconv from 'iconv-lite';

import type { ColumnDef, Row, TableMeta, ViewDef, WorkspaceManifest } from '@curve/domain';
import { createEmptyManifest, serializeManifest, validateManifest } from '@curve/persistence';
import { encodeJsonl } from '@curve/table-engine';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultPath = resolve(repositoryRoot, 'fixtures/csv/gbk-100k.csv');

/** Fixed seed (TESTPLAN §5.2); two runs produce byte-identical fixtures. */
export const BENCH_SEED = 42;
export const BENCH_ROWS = 100_000;
export const BENCH_COLUMNS = 10;
export const BENCH_WORKSPACE_NAME = 'Bench 100k';
export const BENCH_TABLE_ID = 'tbl_bench';
export const BENCH_VIEW_ID = 'viw_bench';

const SITES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '成都',
  '武汉',
  '西安',
  '南京',
  '重庆',
] as const;
const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜';
const GIVEN_NAMES = '伟芳娜秀英敏静丽强磊军洋勇艳杰娟涛明超霞平刚桂英海燕建国志强秀兰春梅';

/** The 100k × 10 performance table: five numbers, a date, a bool, ASCII and CJK text. */
export function benchColumns(): ColumnDef[] {
  return [
    {
      id: 'col_id',
      key: 'id',
      label: 'ID',
      type: 'text',
      role: 'label',
      required: true,
    },
    { id: 'col_time', key: 'time', label: 'Time', type: 'date', role: 'x' },
    { id: 'col_a', key: 'a', label: 'A', type: 'number', role: 'y', precision: 1 },
    { id: 'col_b', key: 'b', label: 'B', type: 'number', role: 'none', precision: 1 },
    { id: 'col_c', key: 'c', label: 'C', type: 'number', role: 'none', precision: 1 },
    { id: 'col_d', key: 'd', label: 'D', type: 'number', role: 'none', precision: 1 },
    { id: 'col_e', key: 'e', label: 'E', type: 'number', role: 'none', precision: 1 },
    { id: 'col_active', key: 'active', label: 'Active', type: 'boolean', role: 'none' },
    { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' },
    { id: 'col_note', key: 'note', label: 'Note', type: 'text', role: 'none' },
  ];
}

export function benchTableMeta(rows = BENCH_ROWS): TableMeta {
  return {
    id: BENCH_TABLE_ID,
    name: 'Bench',
    file: `tables/${BENCH_TABLE_ID}.jsonl`,
    schemaVersion: 1,
    columns: benchColumns(),
    primaryKey: 'col_id',
    rowCount: rows,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

export function benchView(): ViewDef {
  return {
    id: BENCH_VIEW_ID,
    kind: 'table',
    refId: BENCH_TABLE_ID,
    title: 'Bench',
    tableView: {
      tableId: BENCH_TABLE_ID,
      styleId: 'builtin.report-light',
      columnOrder: benchColumns().map((column) => column.id),
      widths: {},
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: 1,
    },
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function chineseName(random: () => number): string {
  const surname = SURNAMES[Math.floor(random() * SURNAMES.length)] ?? '赵';
  const second = GIVEN_NAMES[Math.floor(random() * GIVEN_NAMES.length)] ?? '伟';
  const third = GIVEN_NAMES[Math.floor(random() * GIVEN_NAMES.length)] ?? '芳';
  return `${surname}${second}${third}`;
}

/** Deterministic 100k × 10 rows; CJK values live in `col_site` and `col_note`. */
export function buildBenchRows(seed = BENCH_SEED, count = BENCH_ROWS): Row[] {
  const random = mulberry32(seed);
  const rows: Row[] = [];
  for (let index = 0; index < count; index += 1) {
    const site = SITES[index % SITES.length] ?? '北京';
    rows.push({
      id: `row_${index.toString(36).padStart(8, '0')}`,
      values: [
        `device-${String(index)}`,
        1_735_689_600_000 + index * 1000,
        Math.round(random() * 1_000_000) / 100,
        Math.round(random() * 1_000_000) / 100,
        Math.round(random() * 1_000_000) / 100,
        Math.round(random() * 1_000_000) / 100,
        Math.round(random() * 1_000_000) / 100,
        index % 2 === 0,
        `站点-${site}-${String(index % 1000)}`,
        `${chineseName(random)}-${site}-${String(Math.floor(random() * 100_000))}`,
      ],
    });
  }
  return rows;
}

export interface BenchWorkspaceResult {
  dir: string;
  manifest: WorkspaceManifest;
  table: TableMeta;
  rows: number;
  bytes: number;
  created: boolean;
}

function benchManifest(): WorkspaceManifest {
  const base = createEmptyManifest({
    name: BENCH_WORKSPACE_NAME,
    appVersion: '0.0.0-bench',
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
  const view = benchView();
  const manifest: WorkspaceManifest = {
    ...base,
    tables: [benchTableMeta()],
    views: [view],
    layout: { type: 'pane', viewIds: [view.id], activeViewId: view.id },
  };
  return validateManifest(manifest).manifest;
}

/**
 * Writes a complete, openable 100k workspace: `manifest.json` plus the JSONL
 * table. The manifest is validated before anything is written.
 */
export function writeBenchWorkspace(dir: string): BenchWorkspaceResult {
  const manifest = benchManifest();
  const table = manifest.tables[0];
  if (table === undefined) {
    throw new Error('The bench manifest has no table.');
  }
  const rows = buildBenchRows();
  const jsonl = encodeJsonl(rows);
  const bytes = Buffer.byteLength(jsonl, 'utf8');
  mkdirSync(join(dir, 'tables'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), serializeManifest(manifest));
  writeFileSync(join(dir, table.file), jsonl);
  return { dir, manifest, table, rows: rows.length, bytes, created: true };
}

/**
 * Reuses the workspace when the manifest and table are already on disk, so a
 * bench or E2E run does not rewrite ~25MB every time.
 */
export function ensureBenchWorkspace(dir: string): BenchWorkspaceResult {
  const manifestPath = join(dir, 'manifest.json');
  const tablePath = join(dir, 'tables', `${BENCH_TABLE_ID}.jsonl`);
  if (existsSync(manifestPath) && existsSync(tablePath)) {
    const manifest = validateManifest(
      JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown,
    ).manifest;
    const table = manifest.tables.find((candidate) => candidate.id === BENCH_TABLE_ID);
    if (table !== undefined && table.rowCount === BENCH_ROWS) {
      return { dir, manifest, table, rows: table.rowCount, bytes: 0, created: false };
    }
  }
  return writeBenchWorkspace(dir);
}

function csvField(value: string): string {
  return /[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildGbkCsv(rows = 100_000): string {
  const lines = ['id;name;value;day;active;site'];
  for (let index = 0; index < rows; index += 1) {
    if (index === 25_000) {
      lines.push('bad-1;;oops;not-a-date;maybe;site-x');
      continue;
    }
    if (index === 50_000) {
      lines.push('bad-2;Name 50000;12;2026-01-01;true');
      continue;
    }
    if (index === 75_000) {
      lines.push('bad-3;Name 75000;12;2026-01-01;true;site-x;extra');
      continue;
    }
    lines.push(
      [
        `id-${String(index + 1).padStart(6, '0')}`,
        `Name ${String(index + 1)}`,
        String((index % 1000) / 10),
        '2026-01-01',
        index % 2 === 0 ? 'true' : 'false',
        `站点-${String(index % 7)}`,
      ]
        .map(csvField)
        .join(';'),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

function main(argv: readonly string[]): number {
  const ifMissing = argv.includes('--if-missing');
  const workspaceIndex = argv.indexOf('--workspace');
  const outIndex = argv.indexOf('--out');

  if (workspaceIndex >= 0) {
    const target = argv[workspaceIndex + 1];
    if (target === undefined) {
      process.stderr.write('[gen-100k] --workspace requires a directory\n');
      return 2;
    }
    const dir = resolve(target);
    if (ifMissing && existsSync(join(dir, 'manifest.json'))) {
      process.stdout.write(`[gen-100k] workspace exists: ${dir}\n`);
      return 0;
    }
    const written = writeBenchWorkspace(dir);
    process.stdout.write(
      `[gen-100k] workspace ${dir} rows=${String(written.rows)} bytes=${String(written.bytes)}\n`,
    );
    return 0;
  }

  const out =
    outIndex >= 0 && argv[outIndex + 1] !== undefined
      ? resolve(argv[outIndex + 1] ?? defaultPath)
      : defaultPath;

  if (ifMissing && existsSync(out)) {
    process.stdout.write(`[gen-100k] exists: ${out}\n`);
    return 0;
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, iconv.encode(buildGbkCsv(), 'gb18030'));
  process.stdout.write(`[gen-100k] wrote ${out}\n`);
  return 0;
}

function isDirectInvocation(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
}

// The module is also imported by `scripts/bench.ts`; only the CLI entry writes.
if (isDirectInvocation()) {
  process.exitCode = main(process.argv.slice(2));
}
