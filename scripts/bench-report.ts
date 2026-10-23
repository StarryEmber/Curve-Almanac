/**
 * Benchmark report and regression baseline (TESTPLAN §5.2, T2.7).
 *
 * Pure helpers shared by `scripts/bench.ts` and its unit tests: percentile
 * summarisation, budget evaluation, the `bench/report.json` document and the
 * 20% regression comparison against `bench/baseline.json`. Nothing here touches
 * the file system, the clock or the network.
 */

export const BENCH_SCHEMA_VERSION = 1;
/** TESTPLAN §5.2: a P95 more than 20% above the baseline is a regression. */
export const REGRESSION_THRESHOLD_PCT = 20;

export type BenchStatus = 'ok' | 'over-budget';
export type RegressionStatus = 'ok' | 'regressed' | 'no-baseline';

export interface BenchCase {
  name: string;
  /** One measured run; `p50`/`p95` are derived from the samples. */
  p50: number;
  p95: number;
  unit: 'ms';
  budget: number;
}

export interface BenchCaseResult extends BenchCase {
  status: BenchStatus;
  baselineP95: number | null;
  regressionPct: number | null;
  regression: RegressionStatus;
}

/** Non-gated measurements kept for the report (for example Worker clone cost). */
export interface BenchDiagnostic {
  name: string;
  p50: number;
  p95: number;
  unit: 'ms';
}

export interface BenchMemory {
  peakRssMB: number;
  peakHeapUsedMB: number;
  /** SPEC §16.1 ceiling, reported for reference; the E2E gate owns it. */
  budgetMB: number;
  samplingMs: number;
  gate: 'trend';
}

export interface BenchEnvironment {
  node: string;
  platform: string;
  arch: string;
  cpu: string;
  cpus: number;
}

export interface BenchDataset {
  rows: number;
  columns: number;
  bytes: number;
}

export interface BenchRegression {
  name: string;
  baselineP95: number;
  p95: number;
  pct: number;
}

export interface BenchReport {
  schemaVersion: typeof BENCH_SCHEMA_VERSION;
  generatedAt: string;
  seed: number;
  suites: string[];
  dataset: BenchDataset;
  environment: BenchEnvironment;
  cases: BenchCaseResult[];
  diagnostics: BenchDiagnostic[];
  memory: BenchMemory;
  /** TESTPLAN §5.2 compatibility: the pipeline's peak RSS. */
  memoryPeakMB: number;
  memoryBudgetMB: number;
  budgetsExceeded: string[];
  regressions: BenchRegression[];
  baseline: 'present' | 'missing';
}

export interface BenchBaseline {
  schemaVersion: typeof BENCH_SCHEMA_VERSION;
  generatedAt: string;
  environment: BenchEnvironment;
  cases: { name: string; p95: number }[];
}

/** Nearest-rank percentile over an unsorted sample list (integer milliseconds). */
export function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return Math.round(sorted[index] ?? 0);
}

export function summarizeSamples(samples: readonly number[]): { p50: number; p95: number } {
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
}

export function evaluateCases(
  cases: readonly BenchCase[],
  baseline: BenchBaseline | null,
  thresholdPct = REGRESSION_THRESHOLD_PCT,
): { cases: BenchCaseResult[]; regressions: BenchRegression[]; budgetsExceeded: string[] } {
  const baselineByName = new Map(
    (baseline?.cases ?? []).map((entry) => [entry.name, entry.p95] as const),
  );
  const regressions: BenchRegression[] = [];
  const budgetsExceeded: string[] = [];
  const results = cases.map((entry): BenchCaseResult => {
    const baselineP95 = baselineByName.get(entry.name) ?? null;
    const over = entry.p95 > entry.budget;
    if (over) {
      budgetsExceeded.push(entry.name);
    }
    if (baselineP95 === null || baselineP95 <= 0) {
      return {
        ...entry,
        status: over ? 'over-budget' : 'ok',
        baselineP95: null,
        regressionPct: null,
        regression: 'no-baseline',
      };
    }
    const pct = ((entry.p95 - baselineP95) / baselineP95) * 100;
    const rounded = Math.round(pct * 10) / 10;
    const regressed = rounded > thresholdPct;
    if (regressed) {
      regressions.push({
        name: entry.name,
        baselineP95,
        p95: entry.p95,
        pct: rounded,
      });
    }
    return {
      ...entry,
      status: over ? 'over-budget' : 'ok',
      baselineP95,
      regressionPct: rounded,
      regression: regressed ? 'regressed' : 'ok',
    };
  });
  return { cases: results, regressions, budgetsExceeded };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses `bench/baseline.json`; unknown shapes are rejected, not best-efforted. */
export function parseBaseline(value: unknown): BenchBaseline {
  if (!isRecord(value) || value['schemaVersion'] !== BENCH_SCHEMA_VERSION) {
    throw new Error('The benchmark baseline has an unsupported schema version.');
  }
  const environment = value['environment'];
  if (!isRecord(environment) || typeof environment['platform'] !== 'string') {
    throw new Error('The benchmark baseline is missing its environment.');
  }
  const cases = value['cases'];
  if (!Array.isArray(cases)) {
    throw new Error('The benchmark baseline is missing its cases.');
  }
  const parsedCases = cases.map((entry): { name: string; p95: number } => {
    if (
      !isRecord(entry) ||
      typeof entry['name'] !== 'string' ||
      typeof entry['p95'] !== 'number' ||
      !Number.isFinite(entry['p95'])
    ) {
      throw new Error('The benchmark baseline contains an invalid case.');
    }
    return { name: entry['name'], p95: entry['p95'] };
  });
  return {
    schemaVersion: BENCH_SCHEMA_VERSION,
    generatedAt: typeof value['generatedAt'] === 'string' ? value['generatedAt'] : '',
    environment: {
      node: typeof environment['node'] === 'string' ? environment['node'] : '',
      platform: environment['platform'],
      arch: typeof environment['arch'] === 'string' ? environment['arch'] : '',
      cpu: typeof environment['cpu'] === 'string' ? environment['cpu'] : '',
      cpus: typeof environment['cpus'] === 'number' ? environment['cpus'] : 0,
    },
    cases: parsedCases,
  };
}

export function createBaseline(report: BenchReport): BenchBaseline {
  return {
    schemaVersion: BENCH_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    environment: report.environment,
    cases: report.cases.map((entry) => ({ name: entry.name, p95: entry.p95 })),
  };
}

/** Markdown for `$GITHUB_STEP_SUMMARY` and the local console. */
export function renderSummary(report: BenchReport): string {
  const lines: string[] = [];
  lines.push('## Benchmark report');
  lines.push('');
  lines.push(
    `- Generated: ${report.generatedAt}`,
    `- Seed: ${String(report.seed)} · dataset: ${String(report.dataset.rows)} rows × ` +
      `${String(report.dataset.columns)} columns (${String(report.dataset.bytes)} bytes)`,
    `- Environment: ${report.environment.platform}/${report.environment.arch} · ` +
      `Node ${report.environment.node} · ${report.environment.cpu}`,
    `- Memory peak (pipeline, trend only): ${String(report.memory.peakRssMB)}MB RSS / ` +
      `${String(report.memory.peakHeapUsedMB)}MB heap (budget ${String(report.memory.budgetMB)}MB)`,
    `- Baseline: ${report.baseline}`,
  );
  lines.push('');
  lines.push('| Case | P50 | P95 | Budget | Status | Regression |');
  lines.push('|---|---:|---:|---:|---|---|');
  for (const entry of report.cases) {
    const regression =
      entry.regression === 'no-baseline'
        ? '—'
        : `${String(entry.regressionPct ?? 0)}% vs ${String(entry.baselineP95 ?? 0)}ms`;
    lines.push(
      `| ${entry.name} | ${String(entry.p50)}ms | ${String(entry.p95)}ms | ` +
        `${String(entry.budget)}ms | ${entry.status} | ${regression} |`,
    );
  }
  if (report.diagnostics.length > 0) {
    lines.push('');
    lines.push('| Diagnostic (not gated) | P50 | P95 |');
    lines.push('|---|---:|---:|');
    for (const entry of report.diagnostics) {
      lines.push(`| ${entry.name} | ${String(entry.p50)}ms | ${String(entry.p95)}ms |`);
    }
  }
  if (report.regressions.length > 0) {
    lines.push('');
    lines.push(
      `Regressions over ${String(REGRESSION_THRESHOLD_PCT)}%: ${report.regressions
        .map((entry) => `${entry.name} +${String(entry.pct)}%`)
        .join(', ')}`,
    );
  }
  if (report.budgetsExceeded.length > 0) {
    lines.push('');
    lines.push(`Budgets exceeded: ${report.budgetsExceeded.join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** GitHub Actions workflow-command annotations for soft (non-failing) signals. */
export function renderAnnotations(report: BenchReport): string[] {
  const lines: string[] = [];
  if (report.baseline === 'missing') {
    lines.push(
      '::notice title=Bench baseline::No bench/baseline.json yet; ' +
        'run `pnpm bench -- --write-baseline` on the CI Windows runner and commit the file.',
    );
  }
  for (const entry of report.regressions) {
    lines.push(
      `::warning title=Bench regression::${entry.name} P95 ${String(entry.p95)}ms ` +
        `(+${String(entry.pct)}% vs baseline ${String(entry.baselineP95)}ms)`,
    );
  }
  return lines;
}
