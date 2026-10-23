import { describe, expect, it } from 'vitest';

import {
  createBaseline,
  evaluateCases,
  parseBaseline,
  percentile,
  renderAnnotations,
  renderSummary,
  summarizeSamples,
} from './bench-report';

import type { BenchCase, BenchReport } from './bench-report';

const environment = {
  node: 'v24.21.0',
  platform: 'win32',
  arch: 'x64',
  cpu: 'Test CPU',
  cpus: 8,
};

function benchCase(name: string, p95: number, budget = 400): BenchCase {
  return { name, p50: Math.round(p95 * 0.8), p95, unit: 'ms', budget };
}

function reportWith(
  cases: BenchReport['cases'],
  overrides: Partial<BenchReport> = {},
): BenchReport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-10-23T00:00:00.000Z',
    seed: 42,
    suites: ['query'],
    dataset: { rows: 100_000, columns: 10, bytes: 10 },
    environment,
    cases,
    diagnostics: [],
    memory: {
      peakRssMB: 420,
      peakHeapUsedMB: 200,
      budgetMB: 600,
      samplingMs: 50,
      gate: 'trend',
    },
    memoryPeakMB: 420,
    memoryBudgetMB: 600,
    budgetsExceeded: overrides.budgetsExceeded ?? [],
    regressions: overrides.regressions ?? [],
    baseline: overrides.baseline ?? 'present',
  };
}

describe('percentile', () => {
  it('returns 0 for an empty sample', () => {
    expect(percentile([], 0.95)).toBe(0);
  });

  it('uses the nearest-rank definition', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([40, 10, 30, 20], 0.95)).toBe(40);
    expect(percentile([5], 0.95)).toBe(5);
  });

  it('reports both percentiles from unsorted samples', () => {
    expect(summarizeSamples([30, 10, 20, 40])).toEqual({ p50: 20, p95: 40 });
  });
});

describe('evaluateCases', () => {
  it('flags an over-budget case and keeps a budget-equal case green', () => {
    const result = evaluateCases([benchCase('a', 400), benchCase('b', 401)], null);
    expect(result.budgetsExceeded).toEqual(['b']);
    expect(result.cases.map((entry) => entry.status)).toEqual(['ok', 'over-budget']);
  });

  it('treats a 20% increase as within tolerance and 20.1% as a regression', () => {
    const baseline = {
      schemaVersion: 1 as const,
      generatedAt: '2026-10-23T00:00:00.000Z',
      environment,
      cases: [{ name: 'a', p95: 100 }],
    };
    const equal = evaluateCases([benchCase('a', 120)], baseline);
    expect(equal.regressions).toEqual([]);
    expect(equal.cases[0]?.regression).toBe('ok');
    const regressed = evaluateCases([benchCase('a', 121)], baseline);
    expect(regressed.regressions).toEqual([{ name: 'a', baselineP95: 100, p95: 121, pct: 21 }]);
    expect(regressed.cases[0]?.regression).toBe('regressed');
  });

  it('marks cases without a baseline entry as no-baseline', () => {
    const baseline = {
      schemaVersion: 1 as const,
      generatedAt: '2026-10-23T00:00:00.000Z',
      environment,
      cases: [{ name: 'a', p95: 100 }],
    };
    const result = evaluateCases([benchCase('b', 10)], baseline);
    expect(result.cases[0]).toMatchObject({
      regression: 'no-baseline',
      baselineP95: null,
      regressionPct: null,
    });
    expect(result.regressions).toEqual([]);
  });

  it('ignores a non-positive baseline instead of dividing by zero', () => {
    const baseline = {
      schemaVersion: 1 as const,
      generatedAt: '',
      environment,
      cases: [{ name: 'a', p95: 0 }],
    };
    const result = evaluateCases([benchCase('a', 100)], baseline);
    expect(result.cases[0]?.regression).toBe('no-baseline');
  });
});

describe('baseline parsing', () => {
  it('round-trips through createBaseline', () => {
    const report = reportWith([
      {
        ...benchCase('a', 100),
        status: 'ok',
        baselineP95: null,
        regressionPct: null,
        regression: 'no-baseline',
      },
    ]);
    const baseline = createBaseline(report);
    expect(baseline.cases).toEqual([{ name: 'a', p95: 100 }]);
    expect(parseBaseline(baseline)).toEqual(baseline);
  });

  it('rejects an unknown schema version or a malformed case', () => {
    expect(() => parseBaseline({ schemaVersion: 2, environment, cases: [] })).toThrow(
      /schema version/,
    );
    expect(() =>
      parseBaseline({ schemaVersion: 1, environment, cases: [{ name: 'a', p95: 'fast' }] }),
    ).toThrow(/invalid case/);
    expect(() => parseBaseline({ schemaVersion: 1, cases: [] })).toThrow(/environment/);
  });
});

describe('summary rendering', () => {
  it('lists the case table, memory and regressions', () => {
    const evaluated = evaluateCases([benchCase('a', 500, 400)], {
      schemaVersion: 1,
      generatedAt: '',
      environment,
      cases: [{ name: 'a', p95: 100 }],
    });
    const report = reportWith(evaluated.cases, {
      regressions: evaluated.regressions,
      budgetsExceeded: evaluated.budgetsExceeded,
    });
    const summary = renderSummary(report);
    expect(summary).toContain('| a | 400ms | 500ms | 400ms | over-budget |');
    expect(summary).toContain('Budgets exceeded: a');
    expect(summary).toContain('Regressions over 20%: a +400%');
  });

  it('renders a notice when the baseline is missing and warnings for regressions', () => {
    const evaluated = evaluateCases([benchCase('a', 500)], {
      schemaVersion: 1,
      generatedAt: '',
      environment,
      cases: [{ name: 'a', p95: 100 }],
    });
    const annotations = renderAnnotations(
      reportWith(evaluated.cases, {
        baseline: 'missing',
        regressions: evaluated.regressions,
      }),
    );
    expect(annotations[0]).toContain('No bench/baseline.json');
    expect(annotations[1]).toContain('::warning title=Bench regression::a P95 500ms (+400%');
  });
});
