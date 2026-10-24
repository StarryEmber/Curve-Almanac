/**
 * Performance benchmark harness (TESTPLAN §5, TASKS T2.7).
 *
 * Usage:
 *   pnpm bench                    # every suite
 *   pnpm bench -- --table-io      # open/save/encode/decode
 *   pnpm bench -- --edit          # cell commit through the command bus
 *   pnpm bench -- --query         # filter/sort, ASCII + CJK text, clone cost
 *   pnpm bench -- --import        # 100k GBK CSV import pipeline
 *   pnpm bench -- --write-baseline  # refresh bench/baseline.json
 *
 * The script is dependency-free beyond `tsx` (dev tooling): it generates its
 * data from `scripts/gen-100k.ts` with a fixed seed, never touches the network
 * or a real user directory, mirrors the main-process read/write sequence with
 * `node:fs`, and writes `bench/report.json` in the TESTPLAN §5.2 shape.
 *
 * `pnpm bench` exits non-zero when a gated case exceeds its SPEC §16.1 budget.
 * A P95 more than 20% above `bench/baseline.json` is a soft warning (workflow
 * annotation), never a failure: CI runners share hardware and are noisy.
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import iconv from 'iconv-lite';

import { createAppStore, createCommandBus, createTableCellSetCommand } from '@curve/app-core';
import { createConditionalFormat } from '@curve/domain';
import type { ConditionalRule, FilterPredicate, Row, SortSpec, TableMeta } from '@curve/domain';
import { validateManifest, serializeManifest } from '@curve/persistence';
import {
  countJsonlRows,
  decodeJsonl,
  encodeJsonlWithStats,
  parseCsv,
  planImport,
  queryRowIds,
} from '@curve/table-engine';

import {
  createBaseline,
  evaluateCases,
  parseBaseline,
  renderAnnotations,
  renderSummary,
  summarizeSamples,
} from './bench-report';
import {
  BENCH_COLUMNS,
  BENCH_ROWS,
  BENCH_SEED,
  benchTableMeta,
  buildBenchRows,
  ensureBenchWorkspace,
  writeBenchWorkspace,
} from './gen-100k';

import type { BenchCase, BenchDiagnostic, BenchEnvironment, BenchReport } from './bench-report';

/** SPEC §16.1: opening 100k × 10 must stay under 3.0s end to end. */
const OPEN_BUDGET_MS = 3_000;
const ENCODE_BUDGET_MS = 1_500;
/** SPEC §16.1: autosaving 100k stays under 500ms and never blocks the UI. */
const SAVE_BUDGET_MS = 500;
/** SPEC §16.1: a cell commit is a 1,000-iteration P95 under 50ms. */
const EDIT_BUDGET_MS = 50;
/** SPEC §16.1: 100k filter + sort stays under 400ms. */
const QUERY_BUDGET_MS = 400;
/**
 * SPEC §16.1 (T2.7): all-CJK text sort has its own 800ms budget. ICU collation
 * costs ~390ns per comparison for 1.66M comparisons; after the T2.7
 * optimisations the measured P95 is ~650ms, so 400ms is unreachable without
 * changing the documented `Intl.Collator` semantics (ADR-032/ADR-033).
 */
const CJK_QUERY_BUDGET_MS = 800;
/** SPEC §16.1: a 100k CSV import stays under 8s. */
const IMPORT_BUDGET_MS = 8_000;
/** TASKS T3.3: 50 conditional rules × 100 visible rows stay under 16ms. */
const CONDITION_BUDGET_MS = 16;
/** SPEC §16.1 ceiling; the E2E app-wide measurement owns this gate. */
const MEMORY_BUDGET_MB = 600;
const MEMORY_SAMPLE_MS = 50;

/** Warm-up runs are discarded so the JIT has compiled the hot loops. */
const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;
/** SPEC §16.1 / TESTPLAN §5.1: cell commits use a 1,000-iteration loop. */
const EDIT_ITERATIONS = 1_000;
const EDIT_WARMUP_ITERATIONS = 50;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const benchDirectory = join(repositoryRoot, 'bench');
const reportPath = join(benchDirectory, 'report.json');
const summaryPath = join(benchDirectory, 'summary.md');
const baselinePath = join(benchDirectory, 'baseline.json');
const fixtureDirectory = join(benchDirectory, '.fixtures', '100k-workspace');
const tempDirectory = join(benchDirectory, '.tmp');

interface SuiteResult {
  name: 'table-io' | 'edit' | 'query' | 'import';
  cases: BenchCase[];
  diagnostics: BenchDiagnostic[];
  rows: number;
  columns: number;
  bytes: number;
}

interface MemoryPeaks {
  peakRssMB: number;
  peakHeapUsedMB: number;
}

class MemorySampler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private peakRss = 0;
  private peakHeap = 0;

  start(): void {
    this.sample();
    this.timer = setInterval(() => {
      this.sample();
    }, MEMORY_SAMPLE_MS);
    // Never keep the process alive just to sample.
    this.timer.unref();
  }

  stop(): MemoryPeaks {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.sample();
    return { peakRssMB: Math.round(this.peakRss), peakHeapUsedMB: Math.round(this.peakHeap) };
  }

  private sample(): void {
    const usage = process.memoryUsage();
    this.peakRss = Math.max(this.peakRss, usage.rss / (1024 * 1024));
    this.peakHeap = Math.max(this.peakHeap, usage.heapUsed / (1024 * 1024));
  }
}

/** Optional major GC from `--expose-gc`; no-op when the flag is absent. */
function collectGarbage(): void {
  (globalThis as { gc?: () => void }).gc?.();
}

function environment(): BenchEnvironment {
  const cpuList = cpus();
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: (cpuList[0]?.model ?? 'unknown').trim(),
    cpus: cpuList.length,
  };
}

/** Measures `MEASURED_RUNS` whole operations and reports their P50/P95. */
function measure(name: string, budget: number, run: () => void): BenchCase {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    run();
  }
  const samples: number[] = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const started = performance.now();
    run();
    samples.push(performance.now() - started);
  }
  const summary = summarizeSamples(samples);
  return { name, p50: summary.p50, p95: summary.p95, unit: 'ms', budget };
}

/** Measures every iteration (cell commits) and reports their P50/P95. */
function measureIterations(
  name: string,
  budget: number,
  iterations: number,
  run: (index: number) => void,
): BenchCase {
  for (let index = 0; index < EDIT_WARMUP_ITERATIONS; index += 1) {
    run(index);
  }
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    run(index);
    samples.push(performance.now() - started);
  }
  const summary = summarizeSamples(samples);
  return { name, p50: summary.p50, p95: summary.p95, unit: 'ms', budget };
}

/**
 * Mirrors the main-process open sequence for one table (ADR-022): read the
 * manifest, recompute `rowCount` by scanning the file, read the JSONL again
 * for the renderer and decode it in the table Worker.
 */
function openPipeline(manifestPath: string, tablePath: string, table: TableMeta): number {
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  const manifestTable = manifest.manifest.tables.find((candidate) => candidate.id === table.id);
  if (manifestTable === undefined) {
    throw new Error(`Open benchmark could not find ${table.id} in the manifest.`);
  }
  const counted = countJsonlRows(readFileSync(tablePath, 'utf8'));
  if (counted !== manifestTable.rowCount) {
    throw new Error(`Open benchmark counted ${String(counted)} rows.`);
  }
  const jsonl = readFileSync(tablePath, 'utf8');
  const decoded = decodeJsonl(jsonl, manifestTable);
  if (decoded.issues.length > 0) {
    throw new Error(`Open benchmark decoded ${String(decoded.issues.length)} issues.`);
  }
  return decoded.rows.length;
}

/**
 * Mirrors `FileWorkspaceStore.writeTable` + `writeManifest`: limit scan, backup
 * copy, atomic table replace, manifest validate/serialize/replace.
 */
function savePipeline(
  manifestPath: string,
  tablePath: string,
  backupPath: string,
  table: TableMeta,
  rows: readonly Row[],
): number {
  const encoded = encodeJsonlWithStats(rows);
  const bytes = Buffer.byteLength(encoded.jsonl, 'utf8');
  if (countJsonlRows(encoded.jsonl) !== rows.length) {
    throw new Error('Save benchmark produced a different row count.');
  }
  if (existsSync(tablePath)) {
    copyFileSync(tablePath, backupPath);
  }
  writeFileSync(`${tablePath}.tmp`, encoded.jsonl, 'utf8');
  renameSync(`${tablePath}.tmp`, tablePath);

  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown);
  const manifestTable = manifest.manifest.tables.find((candidate) => candidate.id === table.id);
  if (manifestTable === undefined) {
    throw new Error('Save benchmark lost its manifest table.');
  }
  writeFileSync(`${manifestPath}.tmp`, serializeManifest(manifest.manifest), 'utf8');
  renameSync(`${manifestPath}.tmp`, manifestPath);
  if (bytes <= 0) {
    throw new Error('Save benchmark encoded an empty document.');
  }
  return bytes;
}

function runTableIoSuite(table: TableMeta, rows: Row[]): SuiteResult {
  const encoded = encodeJsonlWithStats(rows);

  const decoded = decodeJsonl(encoded.jsonl, table);
  if (decoded.rows.length !== rows.length || decoded.issues.length > 0) {
    throw new Error(
      `Round-trip sanity check failed: ${String(decoded.rows.length)}/${String(rows.length)} rows, ` +
        `${String(decoded.issues.length)} issues`,
    );
  }

  // The shared fixture is read-only here (E2E copies it); the save sandbox is a
  // throwaway workspace so repeated saves do not mutate the shared fixture.
  const fixture = ensureBenchWorkspace(fixtureDirectory);
  const manifestPath = join(fixture.dir, 'manifest.json');
  const tablePath = join(fixture.dir, table.file);
  const openedRows = openPipeline(manifestPath, tablePath, table);
  if (openedRows !== rows.length) {
    throw new Error(`Open benchmark decoded ${String(openedRows)} rows.`);
  }

  const saveDirectory = join(tempDirectory, 'save-workspace');
  rmSync(saveDirectory, { recursive: true, force: true });
  writeBenchWorkspace(saveDirectory);
  const saveManifestPath = join(saveDirectory, 'manifest.json');
  const saveTablePath = join(saveDirectory, table.file);
  const backupPath = join(tempDirectory, 'table.backup.jsonl');

  const cases = [
    measure('table.encode.100k', ENCODE_BUDGET_MS, () => {
      encodeJsonlWithStats(rows);
    }),
    measure('table.decode.100k', OPEN_BUDGET_MS, () => {
      decodeJsonl(encoded.jsonl, table);
    }),
    measure('table.open.100k', OPEN_BUDGET_MS, () => {
      openPipeline(manifestPath, tablePath, table);
    }),
    measure('table.save.100k', SAVE_BUDGET_MS, () => {
      savePipeline(saveManifestPath, saveTablePath, backupPath, table, rows);
    }),
  ];

  return {
    name: 'table-io',
    cases,
    diagnostics: [],
    rows: rows.length,
    columns: BENCH_COLUMNS,
    bytes: encoded.bytes,
  };
}

function runEditSuite(table: TableMeta, rows: Row[]): SuiteResult {
  const store = createAppStore();
  store.setState({
    workspace: {
      formatVersion: 1,
      id: 'ws_bench',
      name: 'Bench',
      root: fixtureDirectory,
      appVersion: '0.0.0-bench',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      settings: {
        theme: 'system',
        locale: 'zh-CN',
        defaultTableStyleId: 'builtin.report-light',
        autosave: true,
      },
      warnings: [],
    },
    tables: { [table.id]: { table, rows } },
  });
  const bus = createCommandBus(store);
  bus.register(createTableCellSetCommand({ now: () => new Date('2026-01-01T00:00:00.000Z') }));

  const commit = (index: number): void => {
    const row = rows[index % rows.length];
    if (row === undefined) {
      throw new Error('Edit benchmark lost its row.');
    }
    const dispatched = bus.dispatch('table.cell.set', {
      tableId: table.id,
      rowId: row.id,
      columnId: 'col_b',
      value: index % 10_000,
    });
    if (!dispatched.ok) {
      throw new Error(`Edit benchmark dispatch failed: ${dispatched.error.code}`);
    }
  };

  const editCase = measureIterations('edit.commit.100k', EDIT_BUDGET_MS, EDIT_ITERATIONS, commit);

  return {
    name: 'edit',
    cases: [editCase],
    diagnostics: [],
    rows: rows.length,
    columns: BENCH_COLUMNS,
    bytes: 0,
  };
}

function shuffle<T>(values: T[], seed: number): T[] {
  const random = ((): (() => number) => {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
  })();
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const first = values[index];
    const second = values[target];
    if (first === undefined || second === undefined) {
      continue;
    }
    values[index] = second;
    values[target] = first;
  }
  return values;
}

function runQuerySuite(table: TableMeta, rows: Row[]): SuiteResult {
  const filter: FilterPredicate = {
    kind: 'all',
    children: [
      { kind: 'compare', columnId: 'col_a', op: 'gt', value: 5_000 },
      { kind: 'compare', columnId: 'col_site', op: 'contains', value: '北京' },
    ],
  };
  const sort: SortSpec[] = [
    { columnId: 'col_c', direction: 'desc' },
    { columnId: 'col_time', direction: 'asc' },
    { columnId: 'col_id', direction: 'asc' },
  ];
  const filtered = queryRowIds(rows, table, { filter, sort }, { locale: 'zh-CN' });
  if (filtered.visibleRows === 0 || filtered.visibleRows === rows.length) {
    throw new Error(`Query benchmark sanity check failed: ${String(filtered.visibleRows)} rows`);
  }

  // The text cases need an unsorted input; the fixture generates ordered ids.
  const shuffled = shuffle([...rows], BENCH_SEED + 1);
  const textSort: SortSpec[] = [{ columnId: 'col_id', direction: 'asc' }];
  const cjkSort: SortSpec[] = [{ columnId: 'col_note', direction: 'asc' }];
  const conditionRules: ConditionalRule[] = Array.from({ length: 50 }, (_, index) => ({
    id: `rule_bench_${String(index)}`,
    enabled: true,
    target: { kind: 'row' },
    when: { kind: 'compare', columnId: 'col_id', op: 'notNull' },
    style: { background: '#fde2e2', ...(index % 3 === 0 ? { bold: true } : {}) },
  }));
  const conditionRows = rows.slice(0, 100);

  const cases = [
    measure('query.100k', QUERY_BUDGET_MS, () => {
      const result = queryRowIds(rows, table, { filter, sort }, { locale: 'zh-CN' });
      if (result.visibleRows !== filtered.visibleRows) {
        throw new Error('Query benchmark returned a different row count.');
      }
    }),
    measure('query.text-sort.100k', QUERY_BUDGET_MS, () => {
      const result = queryRowIds(shuffled, table, { sort: textSort }, { locale: 'zh-CN' });
      if (result.visibleRows !== rows.length) {
        throw new Error('Text-sort benchmark returned a different row count.');
      }
    }),
    measure('query.cjk-sort.100k', CJK_QUERY_BUDGET_MS, () => {
      const result = queryRowIds(shuffled, table, { sort: cjkSort }, { locale: 'zh-CN' });
      if (result.visibleRows !== rows.length) {
        throw new Error('CJK-sort benchmark returned a different row count.');
      }
    }),
    measure('condition.rules.50x100', CONDITION_BUDGET_MS, () => {
      const format = createConditionalFormat(conditionRules, table.columns, { locale: 'zh-CN' });
      for (const row of conditionRows) {
        if (format.evaluateRow(row).rowRule === null) {
          throw new Error('Conditional-format benchmark rule unexpectedly did not match.');
        }
      }
    }),
  ];

  const cloneSamples: number[] = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const started = performance.now();
    const cloned = structuredClone(shuffled);
    cloneSamples.push(performance.now() - started);
    if (cloned.length !== rows.length) {
      throw new Error('Clone diagnostic lost rows.');
    }
  }
  const cloneSummary = summarizeSamples(cloneSamples);

  return {
    name: 'query',
    cases,
    diagnostics: [
      {
        name: 'query.sync-clone.100k',
        p50: cloneSummary.p50,
        p95: cloneSummary.p95,
        unit: 'ms',
      },
    ],
    rows: rows.length,
    columns: BENCH_COLUMNS,
    bytes: 0,
  };
}

function importTable(): TableMeta {
  return {
    id: 'tbl_import_bench',
    name: 'Import Bench',
    file: 'tables/tbl_import_bench.jsonl',
    schemaVersion: 1,
    columns: [
      {
        id: 'col_id',
        key: 'id',
        label: 'ID',
        type: 'text',
        required: true,
        role: 'label',
      },
      { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'none' },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
      { id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'x' },
      { id: 'col_active', key: 'active', label: 'Active', type: 'boolean', role: 'none' },
      { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' },
    ],
    primaryKey: 'col_id',
    rowCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildImportCsv(rows = 100_000): string {
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
      ].join(';'),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

function runImportSuite(): SuiteResult {
  const csv = buildImportCsv();
  const encoded = iconv.encode(csv, 'gb18030');
  const text = new TextDecoder('gb18030').decode(encoded);
  const table = importTable();
  const mappings = table.columns.map((column, index) => ({
    sourceIndex: index,
    target: { kind: 'existing' as const, columnId: column.id },
  }));

  const parsed = parseCsv(text);
  if (parsed.totalRows !== BENCH_ROWS) {
    throw new Error(`Import fixture sanity check failed: ${String(parsed.totalRows)} rows`);
  }

  const cases = [
    measure('import.100k', IMPORT_BUDGET_MS, () => {
      const dataset = parseCsv(text);
      const plan = planImport({
        table,
        rows: [],
        dataset,
        mappings,
        mode: 'append',
        skipInvalid: true,
      });
      if (!plan.ok) {
        throw new Error(`Import benchmark failed: ${plan.error.code}`);
      }
      encodeJsonlWithStats(plan.rows);
    }),
  ];

  return {
    name: 'import',
    cases,
    diagnostics: [],
    rows: parsed.totalRows,
    columns: 6,
    bytes: encoded.byteLength,
  };
}

function loadBaseline(): ReturnType<typeof parseBaseline> | null {
  if (!existsSync(baselinePath)) {
    return null;
  }
  try {
    return parseBaseline(JSON.parse(readFileSync(baselinePath, 'utf8')) as unknown);
  } catch (thrown) {
    throw new Error(
      `bench/baseline.json is invalid: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
  }
}

type SuiteName = SuiteResult['name'];

const SUITE_NAMES: readonly SuiteName[] = Object.freeze(['table-io', 'edit', 'query', 'import']);

function isSuiteName(value: string | undefined): value is SuiteName {
  return value !== undefined && (SUITE_NAMES as readonly string[]).includes(value);
}

/** Builds the fixture a suite needs and runs it in this process. */
function runSingleSuite(name: SuiteName): SuiteResult {
  if (name === 'import') {
    return runImportSuite();
  }
  const table = benchTableMeta();
  const rows = buildBenchRows();
  switch (name) {
    case 'table-io':
      return runTableIoSuite(table, rows);
    case 'edit':
      return runEditSuite(table, rows);
    case 'query':
      return runQuerySuite(table, rows);
  }
}

interface SuiteRecord {
  suite: SuiteResult;
  memory: MemoryPeaks;
}

function isSuiteRecord(value: unknown): value is SuiteRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as { suite?: unknown; memory?: unknown };
  const suite = record.suite as Partial<SuiteResult> | undefined;
  const memory = record.memory as Partial<MemoryPeaks> | undefined;
  return (
    typeof suite === 'object' &&
    suite !== null &&
    (SUITE_NAMES as readonly string[]).includes(String(suite.name)) &&
    Array.isArray(suite.cases) &&
    typeof suite.rows === 'number' &&
    typeof suite.columns === 'number' &&
    typeof suite.bytes === 'number' &&
    Array.isArray(suite.diagnostics) &&
    typeof memory === 'object' &&
    memory !== null &&
    typeof memory.peakRssMB === 'number' &&
    typeof memory.peakHeapUsedMB === 'number'
  );
}

/**
 * Runs one suite in a fresh child process.
 *
 * Sharing one process made unrelated suites depend on the previous suite's heap:
 * `query.text-sort.100k` measured 338ms alone but 407ms after `table-io`, which
 * is not a stable gate. Each child writes its cases and memory peaks to a JSON
 * file (no stdio pipe) and the parent assembles `bench/report.json`.
 */
function runSuiteIsolated(name: SuiteName, outPath: string): SuiteRecord {
  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawnSync(
    process.execPath,
    ['--expose-gc', '--import', 'tsx', scriptPath, '--suite', name, '--out', outPath],
    { stdio: ['ignore', 'ignore', 'inherit'], env: process.env },
  );
  if (child.status !== 0) {
    throw new Error(`The "${name}" benchmark suite failed (exit ${String(child.status)}).`);
  }
  const parsed = JSON.parse(readFileSync(outPath, 'utf8')) as unknown;
  if (!isSuiteRecord(parsed)) {
    throw new Error(`The "${name}" benchmark suite wrote an invalid result.`);
  }
  return parsed;
}

/** Child entry: measure one suite and write its record. */
function runChildSuite(name: SuiteName, outPath: string): number {
  mkdirSync(dirname(outPath), { recursive: true });
  collectGarbage();
  const sampler = new MemorySampler();
  sampler.start();
  const suite = runSingleSuite(name);
  const memory = sampler.stop();
  writeFileSync(outPath, `${JSON.stringify({ suite, memory })}\n`, 'utf8');
  return 0;
}

function main(argv: readonly string[]): number {
  const suiteFlag = argv.indexOf('--suite');
  if (suiteFlag >= 0) {
    const name = argv[suiteFlag + 1];
    const outFlag = argv.indexOf('--out');
    const out = outFlag >= 0 ? argv[outFlag + 1] : undefined;
    if (!isSuiteName(name) || out === undefined) {
      process.stderr.write('[bench] --suite requires a name and --out <file>\n');
      return 2;
    }
    return runChildSuite(name, resolve(out));
  }

  const wantTableIo = argv.includes('--table-io');
  const wantEdit = argv.includes('--edit');
  const wantQuery = argv.includes('--query');
  const wantImport = argv.includes('--import');
  const writeBaseline = argv.includes('--write-baseline');

  if (argv.includes('--help')) {
    console.log(
      'Usage: pnpm bench [-- --table-io] [-- --edit] [-- --query] [-- --import] ' +
        '[-- --write-baseline]',
    );
    return 0;
  }

  const anySuite = wantTableIo || wantEdit || wantQuery || wantImport;
  const selected = SUITE_NAMES.filter((name) => {
    if (!anySuite) {
      return true;
    }
    switch (name) {
      case 'table-io':
        return wantTableIo;
      case 'edit':
        return wantEdit;
      case 'query':
        return wantQuery;
      case 'import':
        return wantImport;
    }
  });

  mkdirSync(tempDirectory, { recursive: true });
  process.stdout.write(
    `[bench] seed=${String(BENCH_SEED)} rows=${String(BENCH_ROWS)} ` +
      `columns=${String(BENCH_COLUMNS)} suite=${selected.join(',')}\n`,
  );

  const records: SuiteRecord[] = [];
  try {
    for (const name of selected) {
      const outPath = join(tempDirectory, `suite-${name}.json`);
      rmSync(outPath, { force: true });
      records.push(runSuiteIsolated(name, outPath));
    }
  } catch (thrown) {
    process.stderr.write(`[bench] ${thrown instanceof Error ? thrown.message : String(thrown)}\n`);
    return 1;
  } finally {
    if (selected.includes('table-io')) {
      rmSync(join(tempDirectory, 'save-workspace'), { recursive: true, force: true });
      rmSync(join(tempDirectory, 'table.backup.jsonl'), { recursive: true, force: true });
    }
  }

  const suites = records.map((record) => record.suite);
  const memory: MemoryPeaks = {
    peakRssMB: Math.max(0, ...records.map((record) => record.memory.peakRssMB)),
    peakHeapUsedMB: Math.max(0, ...records.map((record) => record.memory.peakHeapUsedMB)),
  };
  const cases = suites.flatMap((entry) => entry.cases);
  const diagnostics = suites.flatMap((entry) => entry.diagnostics);
  const primary = suites[0];
  const dataset = {
    rows: primary?.rows ?? 0,
    columns: primary?.columns ?? BENCH_COLUMNS,
    bytes: suites.find((entry) => entry.name === 'table-io')?.bytes ?? 0,
  };

  const baseline = loadBaseline();
  const evaluated = evaluateCases(cases, baseline);
  const generatedAt = new Date().toISOString();
  const report: BenchReport = {
    schemaVersion: 1,
    generatedAt,
    seed: BENCH_SEED,
    suites: suites.map((entry) => entry.name),
    dataset,
    environment: environment(),
    cases: evaluated.cases,
    diagnostics,
    memory: {
      peakRssMB: memory.peakRssMB,
      peakHeapUsedMB: memory.peakHeapUsedMB,
      budgetMB: MEMORY_BUDGET_MB,
      samplingMs: MEMORY_SAMPLE_MS,
      gate: 'trend',
    },
    memoryPeakMB: memory.peakRssMB,
    memoryBudgetMB: MEMORY_BUDGET_MB,
    budgetsExceeded: evaluated.budgetsExceeded,
    regressions: evaluated.regressions,
    baseline: baseline === null ? 'missing' : 'present',
  };

  mkdirSync(benchDirectory, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(summaryPath, renderSummary(report), 'utf8');

  for (const entry of report.cases) {
    const status = entry.status === 'over-budget' ? 'OVER BUDGET' : 'ok';
    const baselineText =
      entry.regression === 'no-baseline'
        ? 'baseline=none'
        : `baseline=${String(entry.baselineP95)}ms ` +
          `regression=${String(entry.regressionPct)}% ${entry.regression}`;
    process.stdout.write(
      `[bench] ${entry.name} p50=${String(entry.p50)}ms p95=${String(entry.p95)}ms ` +
        `budget=${String(entry.budget)}ms ${status} ${baselineText}\n`,
    );
  }
  for (const entry of report.diagnostics) {
    process.stdout.write(
      `[bench] ${entry.name} p50=${String(entry.p50)}ms p95=${String(entry.p95)}ms (not gated)\n`,
    );
  }
  process.stdout.write(
    `[bench] memoryPeakMB=${String(report.memoryPeakMB)} ` +
      `heapPeakMB=${String(report.memory.peakHeapUsedMB)} budget=${String(MEMORY_BUDGET_MB)} ` +
      '(pipeline trend; the E2E app-wide measurement owns the gate)\n',
  );

  for (const line of renderAnnotations(report)) {
    process.stdout.write(`${line}\n`);
  }
  process.stdout.write(`[bench] report written to ${reportPath}\n`);
  process.stdout.write(`[bench] summary written to ${summaryPath}\n`);

  if (writeBaseline) {
    writeFileSync(baselinePath, `${JSON.stringify(createBaseline(report), null, 2)}\n`, 'utf8');
    process.stdout.write(`[bench] baseline written to ${baselinePath}\n`);
  }

  if (report.budgetsExceeded.length > 0) {
    process.stderr.write(
      `[bench] budgets exceeded: ${report.budgetsExceeded.join(', ')} (see bench/report.json)\n`,
    );
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
