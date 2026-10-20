/**
 * Performance benchmark harness (TESTPLAN §5).
 *
 * Usage:
 *   pnpm bench                 # every suite
 *   pnpm bench -- --table-io   # only the T1.3 table JSONL suites
 *
 * The script is deliberately dependency-free beyond `tsx` (dev tooling): it
 * generates its data from a fixed seed, never touches the network or a real
 * user directory, and writes `bench/report.json` in the TESTPLAN §5.2 shape.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ColumnDef, Row, TableMeta } from '@curve/domain';
import { decodeJsonl, encodeJsonlWithStats } from '@curve/table-engine';

/** TESTPLAN §5.2: fixed seed so two runs are comparable. */
const SEED = 42;
const ROWS = 100_000;
const COLUMNS = 10;
/** Warm-up runs are discarded so the JIT has compiled the hot loops. */
const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;
/** SPEC §16.1: opening 100k x 10 must stay under 3.0s end to end. */
const OPEN_BUDGET_MS = 3_000;
const ENCODE_BUDGET_MS = 1_500;
/** SPEC §16.1 memory ceiling for the whole app, used here as a hard ceiling. */
const MEMORY_BUDGET_MB = 600;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = join(repositoryRoot, 'bench', 'report.json');

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

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

function buildTable(): TableMeta {
  const types: ColumnDef['type'][] = [
    'text',
    'date',
    'number',
    'number',
    'number',
    'number',
    'number',
    'boolean',
    'text',
    'text',
  ];
  const columns: ColumnDef[] = types.map((type, index) =>
    column({
      id: `col_${index}`,
      key: `c${index}`,
      type,
      ...(index === 0 ? { required: true, role: 'label' as const } : {}),
    }),
  );
  return {
    id: 'tbl_bench',
    name: 'Bench',
    file: 'tables/tbl_bench.jsonl',
    schemaVersion: 1,
    columns,
    primaryKey: 'col_0',
    rowCount: ROWS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildRows(random: () => number): Row[] {
  const rows: Row[] = [];
  for (let index = 0; index < ROWS; index += 1) {
    rows.push({
      id: `row_${index.toString(36).padStart(8, '0')}`,
      values: [
        `device-${index}`,
        1_735_689_600_000 + index * 1000,
        Math.round(random() * 1_000_000) / 100,
        Math.round(random() * 1_000_000) / 100,
        Math.round(random() * 1_000_000) / 100,
        Math.round(random() * 1_000_000) / 100,
        Math.round(random() * 1_000_000) / 100,
        index % 2 === 0,
        `site-${index % 7}`,
        `note-${index}`,
      ],
    });
  }
  return rows;
}

interface Sample {
  name: string;
  p50: number;
  p95: number;
  unit: 'ms';
  budget: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function measure(name: string, budget: number, run: () => void): Sample {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    run();
  }
  const samples: number[] = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    const started = performance.now();
    run();
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  return {
    name,
    p50: Math.round(percentile(samples, 0.5)),
    p95: Math.round(percentile(samples, 0.95)),
    unit: 'ms',
    budget,
  };
}

function memoryPeakMB(): number {
  const usage = process.memoryUsage();
  return Math.round((usage.heapUsed / (1024 * 1024)) * 10) / 10;
}

function runTableIo(): { cases: Sample[]; memoryPeakMB: number; rows: number; bytes: number } {
  const table = buildTable();
  const rows = buildRows(mulberry32(SEED));

  // Warm the codec once and keep the document for the decode runs.
  const encoded = encodeJsonlWithStats(rows);
  const decoded = decodeJsonl(encoded.jsonl, table);
  if (decoded.rows.length !== rows.length || decoded.issues.length > 0) {
    throw new Error(
      `Round-trip sanity check failed: ${decoded.rows.length}/${rows.length} rows, ` +
        `${decoded.issues.length} issues`,
    );
  }

  const cases = [
    measure('table.encode.100k', ENCODE_BUDGET_MS, () => {
      encodeJsonlWithStats(rows);
    }),
    measure('table.decode.100k', OPEN_BUDGET_MS, () => {
      decodeJsonl(encoded.jsonl, table);
    }),
  ];

  return {
    cases,
    memoryPeakMB: memoryPeakMB(),
    rows: rows.length,
    bytes: encoded.bytes,
  };
}

function main(argv: readonly string[]): number {
  const tableIo = argv.includes('--table-io');
  if (argv.includes('--help')) {
    console.log('Usage: pnpm bench [-- --table-io]');
    return 0;
  }

  const startedAt = Date.now();
  process.stdout.write(
    `[bench] seed=${SEED} rows=${ROWS} columns=${COLUMNS} suite=${tableIo ? 'table-io' : 'all'}\n`,
  );

  const result = runTableIo();
  const generatedAt = new Date().toISOString();
  const failures = result.cases.filter((entry) => entry.p95 > entry.budget);

  const report = {
    generatedAt,
    seed: SEED,
    suites: ['table-io'],
    dataset: { rows: result.rows, columns: COLUMNS, bytes: result.bytes },
    cases: result.cases,
    memoryPeakMB: result.memoryPeakMB,
    memoryBudgetMB: MEMORY_BUDGET_MB,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  for (const entry of result.cases) {
    const status = entry.p95 > entry.budget ? 'OVER BUDGET' : 'ok';
    process.stdout.write(
      `[bench] ${entry.name} p50=${entry.p50}ms p95=${entry.p95}ms budget=${entry.budget}ms ${status}\n`,
    );
  }
  process.stdout.write(
    `[bench] memoryPeakMB=${result.memoryPeakMB} budget=${MEMORY_BUDGET_MB} ` +
      `(${Date.now() - startedAt}ms total)\n`,
  );
  process.stdout.write(`[bench] report written to ${reportPath}\n`);

  if (failures.length > 0 || result.memoryPeakMB > MEMORY_BUDGET_MB) {
    process.stderr.write('[bench] budgets exceeded (see bench/report.json)\n');
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
