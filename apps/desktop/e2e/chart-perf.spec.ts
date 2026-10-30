/**
 * T4.6 — chart performance budgets on a real 100k chart (SPEC §16.1).
 *
 * What is gated here (rather than in `pnpm bench`, which has no canvas):
 *
 * - `data-chart-resolve-ms` ≤ 300ms — the instrumented `resolveChartData` run
 *   for a 100k × 10 table sampled to 2k points (same口径 as
 *   `chart.resolve-sample.100k`).
 * - `data-chart-update-ms` ≤ 200ms — `renderer.render/update`, i.e. option
 *   construction plus ECharts `setOption` plus the canvas paint for 2k points
 *   (SPEC §16.1 "图表渲染 2k 点", measured with Playwright).
 * - a style-only commit (palette) must not re-resolve: `data-chart-resolve-ms`
 *   stays near zero because the row-derived data cache hits (ADR-045).
 * - ten chart/mapping switches keep exactly one live ECharts instance, show the
 *   loading state at least once and keep the app under the 1GB memory gate.
 * - a burst of ten zoom actions does not exceed the 200ms render budget in a
 *   single main-thread task (when the browser exposes `longtask`).
 */

import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import type { ChartMapping, ChartOptions, ChartSpec } from '@curve/domain';

import { repositoryRoot, test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

const BENCH_WORKSPACE = join(repositoryRoot, 'bench', '.fixtures', '100k-workspace');
const WORKSPACE_NAME = 'Bench 100k';
const CHART_A_TITLE = '100k perf';
const CHART_B_TITLE = '100k perf b';

/** SPEC §16.1: chart resolve + sample for 100k points. */
const CHART_RESOLVE_BUDGET_MS = 300;
/** SPEC §16.1: rendering/updating 2k points. */
const CHART_UPDATE_BUDGET_MS = 200;
/** ADR-045: a style-only commit must be a cache hit, not a new row scan. */
const CHART_CACHE_HIT_BUDGET_MS = 20;
/** SPEC §16.1: whole-app private memory ceiling. */
const MEMORY_BUDGET_MB = 1024;
/** 100k table: every mapping/tab switch goes through the deferred path. */
const SWITCH_COUNT = 10;

const OPTIONS: ChartOptions = {
  smooth: false,
  showSymbol: false,
  lineWidth: 2,
  paletteId: 'default',
  background: 'auto',
  showGrid: true,
  legend: 'top',
  yStartAtZero: false,
  numberDigits: 1,
  sampling: { enabled: true, threshold: 5_000, target: 2_000 },
};

interface PerfChart {
  id: string;
  viewId: string;
  title: string;
  mapping: ChartMapping;
}

const CHARTS: PerfChart[] = [
  {
    id: 'cht_perf_a',
    viewId: 'viw_perf_a',
    title: CHART_A_TITLE,
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
  },
  {
    id: 'cht_perf_b',
    viewId: 'viw_perf_b',
    title: CHART_B_TITLE,
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_c'] },
  },
];

/** Copies the generated 100k fixture and adds two chart views to its manifest. */
function seedPerfCharts(testInfo: TestInfo): string {
  if (!existsSync(join(BENCH_WORKSPACE, 'manifest.json'))) {
    throw new Error(
      `Missing ${BENCH_WORKSPACE}; run \`pnpm e2e\` (it generates the fixture first).`,
    );
  }
  const target = testInfo.outputPath('chart-perf');
  cpSync(BENCH_WORKSPACE, target, { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(target, 'manifest.json'), 'utf8'),
  ) as WorkspaceManifest;
  const timestamp = manifest.updatedAt;
  const charts: ChartSpec[] = CHARTS.map((chart) => ({
    id: chart.id,
    title: chart.title,
    kind: 'line',
    tableId: 'tbl_bench',
    mapping: chart.mapping,
    sort: [],
    options: OPTIONS,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  manifest.charts = charts;
  manifest.views = [
    ...manifest.views.filter((view) => view.kind === 'table'),
    ...CHARTS.map((chart) => ({
      id: chart.viewId,
      kind: 'chart' as const,
      refId: chart.id,
      title: chart.title,
    })),
  ];
  const existingViewIds = manifest.layout.type === 'pane' ? manifest.layout.viewIds : [];
  const viewIds = [...existingViewIds, ...CHARTS.map((chart) => chart.viewId)];
  manifest.layout = {
    type: 'pane',
    viewIds,
    activeViewId: CHARTS[0]?.viewId ?? viewIds[0] ?? '',
  };
  writeFileSync(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}

async function registerRecent(page: Page, dir: string): Promise<void> {
  await page.evaluate(async (target) => {
    const api = (globalThis as unknown as { api: CurveApi }).api;
    const opened = await api.workspace.open({ dir: target });
    if (!opened.ok) {
      throw new Error(`open failed: ${opened.error.code}`);
    }
    const closed = await api.workspace.close({ workspaceId: opened.data.manifest.id });
    if (!closed.ok) {
      throw new Error(`close failed: ${closed.error.code}`);
    }
  }, dir);
}

async function openRecentWorkspace(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: WORKSPACE_NAME }).first().click();
  await expect(page.getByTestId('chart-view')).toBeVisible();
}

/** Reads the persisted manifest of the copied workspace. */
function manifestOf(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

interface LongTaskReport {
  supported: boolean;
  count: number;
  maxMs: number;
}

/**
 * Watches main-thread long tasks (`>50ms` by definition). The browser support
 * check is reported so the assertion can be skipped where the API is absent.
 */
async function installLongTaskObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as unknown as { __chartPerfLongTasks?: number[] };
    target.__chartPerfLongTasks = [];
    const supported = (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
    if (!supported) {
      return;
    }
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        target.__chartPerfLongTasks?.push(entry.duration);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  });
}

async function readLongTasks(page: Page): Promise<LongTaskReport> {
  return page.evaluate(() => {
    const supported = (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
    const values =
      (window as unknown as { __chartPerfLongTasks?: number[] }).__chartPerfLongTasks ?? [];
    return {
      supported,
      count: values.length,
      maxMs: values.length === 0 ? 0 : Math.max(...values),
    };
  });
}

/** Watches every `data-chart-pending` transition, including freshly mounted views. */
async function watchPendingState(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as unknown as { __chartPendingSeen?: boolean };
    target.__chartPendingSeen = false;
    const flagIfPending = (element: Element | null): void => {
      if (element !== null && element.getAttribute('data-chart-pending') === 'true') {
        target.__chartPendingSeen = true;
      }
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) {
          flagIfPending(record.target);
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          flagIfPending(
            node.matches('[data-testid="chart-view"]')
              ? node
              : node.querySelector('[data-testid="chart-view"]'),
          );
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-chart-pending'],
    });
  });
}

async function pendingStateSeen(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __chartPendingSeen?: boolean }).__chartPendingSeen === true,
  );
}

/** Sums private bytes of main + renderer + utility processes (GPU excluded). */
async function appPrivateMb(electronApp: ElectronApplication): Promise<number> {
  const metrics = await electronApp.evaluate(({ app }) => app.getAppMetrics());
  let totalKb = 0;
  for (const metric of metrics) {
    if (metric.type === 'GPU') {
      continue;
    }
    totalKb += metric.memory?.privateBytes ?? 0;
  }
  return Math.round(totalKb / 1024);
}

async function chartAttributes(
  page: Page,
): Promise<{ resolveMs: number; updateMs: number; instances: number }> {
  const view = page.getByTestId('chart-view');
  const canvas = page.getByTestId('chart-canvas');
  return {
    resolveMs: Number(await view.getAttribute('data-chart-resolve-ms')),
    updateMs: Number(await canvas.getAttribute('data-chart-update-ms')),
    instances: Number(await canvas.getAttribute('data-chart-instances')),
  };
}

test.describe('T4.6 chart performance hardening', () => {
  test('chart-perf: 100k resolve, update, style cache and zoom burst stay within budget', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const target = seedPerfCharts(testInfo);
    await registerRecent(page, target);
    await openRecentWorkspace(page);

    const view = page.getByTestId('chart-view');
    const canvas = page.getByTestId('chart-canvas');
    await expect(view).toHaveAttribute('data-chart-state', 'ready');
    await expect(view).toHaveAttribute('data-chart-pending', 'false');
    await expect(view).toHaveAttribute('data-chart-sampled', 'true');
    await expect(view).toHaveAttribute('data-chart-source-points', '100000');
    await expect(canvas.locator('canvas')).toBeVisible();

    const first = await chartAttributes(page);
    console.log(
      `[chart-perf] resolveMs=${String(first.resolveMs)} updateMs=${String(first.updateMs)} instances=${String(first.instances)}`,
    );
    expect(first.resolveMs, `resolve took ${String(first.resolveMs)}ms`).toBeGreaterThan(0);
    expect(first.resolveMs, `resolve took ${String(first.resolveMs)}ms`).toBeLessThanOrEqual(
      CHART_RESOLVE_BUDGET_MS,
    );
    expect(first.updateMs, `update took ${String(first.updateMs)}ms`).toBeGreaterThan(0);
    expect(first.updateMs, `update took ${String(first.updateMs)}ms`).toBeLessThanOrEqual(
      CHART_UPDATE_BUDGET_MS,
    );
    expect(first.instances).toBe(1);

    // A style-only inspector commit must reuse the cached row-derived data.
    const paletteBefore = await view.getAttribute('data-chart-palette');
    await page.getByRole('tab', { name: '外观' }).click();
    await page.getByTestId('chart-palette').selectOption('vivid');
    await expect.poll(async () => view.getAttribute('data-chart-palette')).not.toBe(paletteBefore);
    const styleResolveMs = Number(await view.getAttribute('data-chart-resolve-ms'));
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-chart-update-count')))
      .toBeGreaterThan(1);
    const styleUpdateMs = Number(await canvas.getAttribute('data-chart-update-ms'));
    console.log(
      `[chart-perf] styleResolveMs=${String(styleResolveMs)} styleUpdateMs=${String(styleUpdateMs)}`,
    );
    expect(styleResolveMs).toBeLessThan(CHART_CACHE_HIT_BUDGET_MS);
    expect(styleUpdateMs).toBeLessThanOrEqual(CHART_UPDATE_BUDGET_MS);
    // The commit must also reach disk (regression: a copied workspace without
    // `backups/` used to fail every manifest save with E_FS_WRITE/ENOENT).
    await expect
      .poll(
        () =>
          manifestOf(target).charts?.find((chart) => chart.id === 'cht_perf_a')?.options.paletteId,
      )
      .toBe('vivid');

    // Ten rapid zoom actions: same instance, live window, no >200ms main task.
    await installLongTaskObserver(page);
    for (let index = 0; index < 10; index += 1) {
      await page.getByTestId('chart-zoom-in').click();
    }
    await expect
      .poll(async () => Number(await view.getAttribute('data-chart-zoom-start')))
      .toBeGreaterThan(0);
    await expect
      .poll(async () => Number(await view.getAttribute('data-chart-zoom-end')))
      .toBeLessThan(100);
    expect(Number(await canvas.getAttribute('data-chart-instances'))).toBe(1);
    const longTasks = await readLongTasks(page);
    console.log(
      `[chart-perf] longTaskSupported=${String(longTasks.supported)} count=${String(
        longTasks.count,
      )} maxMs=${String(Math.round(longTasks.maxMs))}`,
    );
    if (longTasks.supported) {
      expect(longTasks.maxMs, 'a long task exceeded the 2k render budget').toBeLessThanOrEqual(
        CHART_UPDATE_BUDGET_MS,
      );
    }

    await page.getByTestId('chart-zoom-reset').click();
    await expect(view).toHaveAttribute('data-chart-zoom-start', '0');
    await expect(view).toHaveAttribute('data-chart-zoom-end', '100');

    await testInfo.attach('t46-chart-perf.txt', {
      body:
        `resolveMs=${String(first.resolveMs)} (budget ${String(CHART_RESOLVE_BUDGET_MS)})\n` +
        `updateMs=${String(first.updateMs)} (budget ${String(CHART_UPDATE_BUDGET_MS)})\n` +
        `styleResolveMs=${String(styleResolveMs)} (cache-hit budget ${String(
          CHART_CACHE_HIT_BUDGET_MS,
        )})\n` +
        `styleUpdateMs=${String(styleUpdateMs)}\n` +
        `instances=${String(first.instances)}\n` +
        `longTaskSupported=${String(longTasks.supported)}\n` +
        `longTaskMaxMs=${String(Math.round(longTasks.maxMs))}\n`,
      contentType: 'text/plain',
    });
    const screenshot = testInfo.outputPath('t4.6-chart-perf.png');
    await page.locator('[data-testid="chart-view"]').screenshot({ path: screenshot });
    await testInfo.attach('t4.6-chart-perf', { path: screenshot, contentType: 'image/png' });
  });

  test('chart-perf: ten chart and mapping switches keep one instance, show loading and stay in memory', async ({
    page,
    electronApp,
  }, testInfo) => {
    test.setTimeout(240_000);
    const target = seedPerfCharts(testInfo);
    await registerRecent(page, target);
    await openRecentWorkspace(page);

    const view = page.getByTestId('chart-view');
    const canvas = page.getByTestId('chart-canvas');
    await expect(view).toHaveAttribute('data-chart-state', 'ready');
    expect(Number(await canvas.getAttribute('data-chart-instances'))).toBe(1);
    const memoryAfterOpen = await appPrivateMb(electronApp);
    await watchPendingState(page);

    // Five mapping switches: add/remove a wide Y column, one commit each. The
    // expected series count proves the new model actually landed (a stale
    // `data-chart-pending="false"` must not end the wait early).
    await page.getByRole('tab', { name: '映射' }).click();
    const mappingSwitches: { testId: string; series: number }[] = [
      { testId: 'chart-mapping-y-col_c', series: 2 },
      { testId: 'chart-mapping-y-col_a', series: 1 },
      { testId: 'chart-mapping-y-col_a', series: 2 },
      { testId: 'chart-mapping-y-col_c', series: 1 },
      { testId: 'chart-mapping-y-col_c', series: 2 },
    ];
    for (const [index, step] of mappingSwitches.entries()) {
      await page.getByTestId(step.testId).click();
      await expect(view).toHaveAttribute('data-chart-series-count', String(step.series));
      await expect(view).toHaveAttribute('data-chart-pending', 'false');
      await expect(view).toHaveAttribute('data-chart-state', 'ready');
      expect(
        Number(await canvas.getAttribute('data-chart-instances')),
        `instance count after mapping switch ${String(index + 1)}`,
      ).toBe(1);
    }

    // Six tab switches across two chart views (remount → dispose → mount).
    let tabSwitches = 0;
    const memoryAfterMapping = await appPrivateMb(electronApp);
    for (let index = 0; index < 3; index += 1) {
      await page.getByRole('tab', { name: CHART_B_TITLE }).click();
      await expect(page.getByTestId('chart-title')).toHaveText(CHART_B_TITLE);
      await expect(view).toHaveAttribute('data-chart-state', 'ready');
      await expect(view).toHaveAttribute('data-chart-pending', 'false');
      expect(
        Number(await canvas.getAttribute('data-chart-instances')),
        `instance count on ${CHART_B_TITLE} (round ${String(index + 1)})`,
      ).toBe(1);
      tabSwitches += 1;

      await page.getByRole('tab', { name: CHART_A_TITLE, exact: true }).click();
      await expect(page.getByTestId('chart-title')).toHaveText(CHART_A_TITLE);
      await expect(view).toHaveAttribute('data-chart-state', 'ready');
      await expect(view).toHaveAttribute('data-chart-pending', 'false');
      expect(
        Number(await canvas.getAttribute('data-chart-instances')),
        `instance count on ${CHART_A_TITLE} (round ${String(index + 1)})`,
      ).toBe(1);
      tabSwitches += 1;
    }

    const switchTotal = mappingSwitches.length + tabSwitches;
    expect(switchTotal).toBeGreaterThanOrEqual(SWITCH_COUNT);
    const memoryAfterSwitches = await appPrivateMb(electronApp);
    const pendingSeen = await pendingStateSeen(page);
    console.log(`[chart-perf] pendingSeen=${String(pendingSeen)}`);
    expect(pendingSeen, 'big-table switches must show the loading state').toBe(true);

    const final = await chartAttributes(page);
    expect(final.instances).toBe(1);
    expect(final.resolveMs).toBeLessThanOrEqual(CHART_RESOLVE_BUDGET_MS);

    // The steady-state 100k chart workspace and the post-switch footprint both
    // have to respect the SPEC §16.1 ceiling. The failed-save regression fixed
    // in this task used to push this scenario to 605–612MB (retries/toast state
    // on every manifest write); after the backup-directory fix it settles at
    // 584–592MB, so the hard gate is meaningful again.
    const memorySamples: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      memorySamples.push(await appPrivateMb(electronApp));
      await page.waitForTimeout(100);
    }
    const peakMb = Math.max(...memorySamples);
    console.log(
      `[chart-perf] memory privatePeakMB=${String(peakMb)} samples=${memorySamples.join(',')} ` +
        `afterOpen=${String(memoryAfterOpen)} afterMapping=${String(memoryAfterMapping)} ` +
        `afterSwitches=${String(memoryAfterSwitches)} ` +
        `finalResolveMs=${String(final.resolveMs)}`,
    );
    expect(peakMb, `app memory peaked at ${String(peakMb)}MB`).toBeLessThanOrEqual(
      MEMORY_BUDGET_MB,
    );

    await testInfo.attach('t46-chart-switches.txt', {
      body:
        `switches=${String(switchTotal)}\n` +
        `pendingSeen=${String(pendingSeen)}\n` +
        `instances=${String(final.instances)}\n` +
        `finalResolveMs=${String(final.resolveMs)} (budget ${String(CHART_RESOLVE_BUDGET_MS)})\n` +
        `memoryAfterOpenMB=${String(memoryAfterOpen)} (gate ${String(MEMORY_BUDGET_MB)})\n` +
        `memoryAfterMappingMB=${String(memoryAfterMapping)}\n` +
        `memoryAfterSwitchesMB=${String(memoryAfterSwitches)}\n` +
        `memorySamplesMB=${memorySamples.join(',')}\npeakMb=${String(peakMb)} (gate ${String(
          MEMORY_BUDGET_MB,
        )})\n`,
      contentType: 'text/plain',
    });
    const screenshot = testInfo.outputPath('t4.6-chart-switches.png');
    await page.locator('[data-testid="chart-view"]').screenshot({ path: screenshot });
    await testInfo.attach('t4.6-chart-switches', { path: screenshot, contentType: 'image/png' });
  });
});
