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

import iconv from 'iconv-lite';

import type { ColumnDef, FilterPredicate, Row, SortSpec, TableMeta } from '@curve/domain';
import {
  decodeJsonl,
  encodeJsonlWithStats,
  parseCsv,
  planImport,
  queryRowIds,
} from '@curve/table-engine';

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
/** SPEC §16.1: a 100k CSV import (parse + validate + row build) stays under 8s. */
const IMPORT_BUDGET_MS = 8_000;
/** SPEC §16.1: 100k filter + sort stays under 400ms. */
const QUERY_BUDGET_MS = 400;
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

function importTable(): TableMeta {
  const columns: ColumnDef[] = [
    column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true, role: 'label' }),
    column({ id: 'col_name', key: 'name', label: 'Name', type: 'text' }),
    column({ id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' }),
    column({ id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'x' }),
    column({ id: 'col_active', key: 'active', label: 'Active', type: 'boolean' }),
    column({ id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' }),
  ];
  return {
    id: 'tbl_import_bench',
    name: 'Import Bench',
    file: 'tables/tbl_import_bench.jsonl',
    schemaVersion: 1,
    columns,
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

function runImportBench(): {
  cases: Sample[];
  memoryPeakMB: number;
  rows: number;
  bytes: number;
} {
  const csv = buildImportCsv();
  const encoded = iconv.encode(csv, 'gb18030');
  const text = new TextDecoder('gb18030').decode(encoded);
  const table = importTable();
  const mappings = table.columns.map((column, index) => ({
    sourceIndex: index,
    target: { kind: 'existing' as const, columnId: column.id },
  }));

  const parsed = parseCsv(text);
  if (parsed.totalRows !== ROWS) {
    throw new Error(`Import fixture sanity check failed: ${parsed.totalRows} rows`);
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
    cases,
    memoryPeakMB: memoryPeakMB(),
    rows: parsed.totalRows,
    bytes: encoded.byteLength,
  };
}

function runQueryBench(): { cases: Sample[]; memoryPeakMB: number; rows: number } {
  const table = buildTable();
  const rows = buildRows(mulberry32(SEED));
  const filter: FilterPredicate = {
    kind: 'all',
    children: [
      { kind: 'compare', columnId: 'col_2', op: 'gt', value: 5_000 },
      { kind: 'compare', columnId: 'col_8', op: 'eq', value: 'site-3' },
    ],
  };
  const sort: SortSpec[] = [
    { columnId: 'col_3', direction: 'desc' },
    { columnId: 'col_1', direction: 'asc' },
    { columnId: 'col_0', direction: 'asc' },
  ];
  const request = { filter, sort };
  const sanity = queryRowIds(rows, table, request, { locale: 'en-US' });
  if (sanity.visibleRows === 0 || sanity.visibleRows === rows.length) {
    throw new Error(`Query benchmark sanity check failed: ${String(sanity.visibleRows)} rows`);
  }

  // The text-sort case needs an unsorted input; `buildRows` generates device-0…
  // in order, which would make Timsort look artificially fast.
  const shuffled = [...rows];
  const shuffle = mulberry32(SEED + 1);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(shuffle() * (index + 1));
    const first = shuffled[index] as Row;
    const second = shuffled[target] as Row;
    shuffled[index] = second;
    shuffled[target] = first;
  }

  const cases = [
    measure('query.100k', QUERY_BUDGET_MS, () => {
      const result = queryRowIds(rows, table, request, { locale: 'en-US' });
      if (result.visibleRows !== sanity.visibleRows) {
        throw new Error('Query benchmark returned a different row count.');
      }
    }),
    measure('query.text-sort.100k', QUERY_BUDGET_MS, () => {
      const result = queryRowIds(
        shuffled,
        table,
        { sort: [{ columnId: 'col_0', direction: 'asc' }] },
        { locale: 'en-US' },
      );
      if (result.visibleRows !== rows.length) {
        throw new Error('Text-sort benchmark returned a different row count.');
      }
    }),
  ];

  return { cases, memoryPeakMB: memoryPeakMB(), rows: rows.length };
}

function main(argv: readonly string[]): number {
  const wantTableIo = argv.includes('--table-io');
  const wantImport = argv.includes('--import');
  const wantQuery = argv.includes('--query');
  if (argv.includes('--help')) {
    console.log('Usage: pnpm bench [-- --table-io] [-- --import] [-- --query]');
    return 0;
  }
  const anySuite = wantTableIo || wantImport || wantQuery;
  const runTableIoSuite = wantTableIo || !anySuite;
  const runImportSuite = wantImport || !anySuite;
  const runQuerySuite = wantQuery || !anySuite;

  const startedAt = Date.now();
  const suiteName = [
    runTableIoSuite ? 'table-io' : null,
    runImportSuite ? 'import' : null,
    runQuerySuite ? 'query' : null,
  ]
    .filter((value): value is string => value !== null)
    .join(',');
  process.stdout.write(`[bench] seed=${SEED} rows=${ROWS} columns=${COLUMNS} suite=${suiteName}\n`);

  const tableIoResult = runTableIoSuite ? runTableIo() : null;
  const importResult = runImportSuite ? runImportBench() : null;
  const queryResult = runQuerySuite ? runQueryBench() : null;
  const cases = [
    ...(tableIoResult?.cases ?? []),
    ...(importResult?.cases ?? []),
    ...(queryResult?.cases ?? []),
  ];
  const suites = [
    ...(tableIoResult === null ? [] : ['table-io']),
    ...(importResult === null ? [] : ['import']),
    ...(queryResult === null ? [] : ['query']),
  ];
  const memoryPeakMB = Math.max(
    tableIoResult?.memoryPeakMB ?? 0,
    importResult?.memoryPeakMB ?? 0,
    queryResult?.memoryPeakMB ?? 0,
  );
  const dataset =
    importResult === null
      ? {
          rows: tableIoResult?.rows ?? queryResult?.rows ?? 0,
          columns: COLUMNS,
          bytes: tableIoResult?.bytes ?? 0,
        }
      : { rows: importResult.rows, columns: 6, bytes: importResult.bytes };
  const generatedAt = new Date().toISOString();
  const failures = cases.filter((entry) => entry.p95 > entry.budget);

  const report = {
    generatedAt,
    seed: SEED,
    suites,
    dataset,
    cases,
    memoryPeakMB,
    memoryBudgetMB: MEMORY_BUDGET_MB,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  for (const entry of cases) {
    const status = entry.p95 > entry.budget ? 'OVER BUDGET' : 'ok';
    process.stdout.write(
      `[bench] ${entry.name} p50=${entry.p50}ms p95=${entry.p95}ms budget=${entry.budget}ms ${status}\n`,
    );
  }
  process.stdout.write(
    `[bench] memoryPeakMB=${memoryPeakMB} budget=${MEMORY_BUDGET_MB} ` +
      `(${Date.now() - startedAt}ms total)\n`,
  );
  process.stdout.write(`[bench] report written to ${reportPath}\n`);

  if (failures.length > 0 || memoryPeakMB > MEMORY_BUDGET_MB) {
    process.stderr.write('[bench] budgets exceeded (see bench/report.json)\n');
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
