/**
 * T2.7 performance budgets that need a real Electron run (SPEC §16.1):
 * cold start ≤2.5s, 100k × 10 open ≤3.0s and the app-wide memory ceiling ≤1GB.
 *
 * The pure pipelines (encode/decode/save/edit/import/filter/sort + CJK sort) are
 * measured by `pnpm bench`; scroll fps stays in `grid.spec.ts`. `pnpm e2e`
 * generates `bench/.fixtures/100k-workspace` from `scripts/gen-100k.ts` before
 * Playwright starts.
 */

import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { repositoryRoot, test } from './fixtures';

import type { CurveApi } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

const BENCH_WORKSPACE = join(repositoryRoot, 'bench', '.fixtures', '100k-workspace');
const WORKSPACE_NAME = 'Bench 100k';
/** SPEC §16.1: cold start to interactive. */
const COLD_START_BUDGET_MS = 2_500;
/** SPEC §16.1: opening a 100k × 10 workspace. */
const OPEN_BUDGET_MS = 3_000;
/** SPEC §16.1: whole-app memory peak. */
const MEMORY_BUDGET_MB = 1024;

async function seedFromFixture(page: Page, testInfo: TestInfo): Promise<string> {
  if (!existsSync(join(BENCH_WORKSPACE, 'manifest.json'))) {
    throw new Error(
      `Missing ${BENCH_WORKSPACE}; run \`pnpm e2e\` (it generates the fixture first).`,
    );
  }
  // Each test gets a private copy: opening rewrites the manifest and writes a
  // .lock, and the shared fixture must stay read-only for the next test.
  const target = testInfo.outputPath('bench-workspace');
  cpSync(BENCH_WORKSPACE, target, { recursive: true });
  await page.evaluate(async (dir) => {
    const api = (globalThis as unknown as { api: CurveApi }).api;
    const opened = await api.workspace.open({ dir });
    if (!opened.ok) {
      throw new Error(`open failed: ${opened.error.code}`);
    }
    const closed = await api.workspace.close({ workspaceId: opened.data.manifest.id });
    if (!closed.ok) {
      throw new Error(`close failed: ${closed.error.code}`);
    }
  }, target);
  return target;
}

async function openBenchWorkspace(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: WORKSPACE_NAME }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

/**
 * Sums the working set of the browser, renderer and utility (Worker) processes.
 * The GPU process is excluded: its size is driver-dependent and is not table
 * data. `app.getAppMetrics()` reports KB.
 */
/**
 * Sums the private working set of the browser, renderer and utility (Worker)
 * processes. `privateBytes` is the counter Task Manager shows as "Memory" for
 * each process; summing `workingSetSize` instead double-counts the shared
 * Chromium/Electron pages (measured ~270MB for an idle main process). The GPU
 * process is excluded: its size is driver-dependent and is not table data.
 * `app.getAppMetrics()` reports KB.
 */
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

/** Working-set total kept alongside the private-bytes gate for diagnosis. */
async function appWorkingSetMb(electronApp: ElectronApplication): Promise<number> {
  const metrics = await electronApp.evaluate(({ app }) => app.getAppMetrics());
  let totalKb = 0;
  for (const metric of metrics) {
    if (metric.type === 'GPU') {
      continue;
    }
    totalKb += metric.memory?.workingSetSize ?? 0;
  }
  return Math.round(totalKb / 1024);
}

/** Per-process private/working set for the memory attachment (diagnosis). */
async function appMemoryBreakdown(
  electronApp: ElectronApplication,
): Promise<{ type: string; privateMb: number; workingSetMb: number }[]> {
  const metrics = await electronApp.evaluate(({ app }) => app.getAppMetrics());
  return metrics
    .filter((metric) => metric.type !== 'GPU')
    .map((metric) => ({
      type: metric.type,
      privateMb: Math.round((metric.memory?.privateBytes ?? 0) / 1024),
      workingSetMb: Math.round((metric.memory?.workingSetSize ?? 0) / 1024),
    }))
    .sort((left, right) => right.privateMb - left.privateMb);
}

test.describe('T2.7 performance budgets', () => {
  test('cold start reaches the interactive shell within 2.5s', async ({
    page,
    appLaunch,
    electronApp,
  }, testInfo) => {
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.waitForFunction(() => performance.getEntriesByName('curve:app-ready').length > 0);
    const coldStartMs = Date.now() - appLaunch.launchStartedAt;
    const idle = await appMemoryBreakdown(electronApp);
    console.log(
      `[perf] coldStartMs=${String(coldStartMs)} idleMemory=${idle
        .map((entry) => `${entry.type}=${String(entry.privateMb)}/${String(entry.workingSetMb)}MB`)
        .join(' ')}`,
    );
    await testInfo.attach('t27-cold-start.txt', {
      body: `coldStartMs=${String(coldStartMs)}\nbudgetMs=${String(COLD_START_BUDGET_MS)}\n`,
      contentType: 'text/plain',
    });
    expect(coldStartMs, `cold start took ${String(coldStartMs)}ms`).toBeLessThanOrEqual(
      COLD_START_BUDGET_MS,
    );
  });

  test('opens a 100k x 10 workspace within 3s', async ({ page }, testInfo) => {
    await seedFromFixture(page, testInfo);
    await page.reload();
    await expect(page.getByTestId('welcome')).toBeVisible();

    const clickedAt = Date.now();
    await page.getByTestId('recent-workspace').filter({ hasText: WORKSPACE_NAME }).first().click();
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '100001');
    await page.waitForFunction(() => performance.getEntriesByName('curve:open').length > 0);
    const wallMs = Date.now() - clickedAt;
    const openMs = await page.evaluate(
      () => performance.getEntriesByName('curve:open').at(-1)?.duration ?? -1,
    );
    console.log(`[perf] openMs=${String(Math.round(openMs))} wallMs=${String(wallMs)}`);

    await testInfo.attach('t27-open.txt', {
      body:
        `openMs=${String(Math.round(openMs))}\nwallMs=${String(wallMs)}\n` +
        `budgetMs=${String(OPEN_BUDGET_MS)}\n`,
      contentType: 'text/plain',
    });
    expect(openMs, `instrumented open took ${String(Math.round(openMs))}ms`).toBeGreaterThan(0);
    expect(openMs, `instrumented open took ${String(Math.round(openMs))}ms`).toBeLessThanOrEqual(
      OPEN_BUDGET_MS,
    );
  });

  test('keeps app-wide memory under 1GB after a 100k worker query', async ({
    page,
    electronApp,
  }, testInfo) => {
    await seedFromFixture(page, testInfo);
    await openBenchWorkspace(page);

    const grid = page.getByTestId('data-grid');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '100001');
    const openedMb = await appPrivateMb(electronApp);
    // Sorting >20k rows spawns the query Worker, which clones the 100k snapshot:
    // that is the memory peak this gate is about.
    const sortButton = page
      .locator('[role="columnheader"][data-column-id="col_a"]')
      .getByRole('button');
    await sortButton.click();
    await expect(grid).toHaveAttribute('data-query-mode', 'worker');
    await expect(grid).toHaveAttribute('data-query-busy', 'false');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '100001');

    const totalMs = Number(await grid.getAttribute('data-query-total-ms'));
    const samples: number[] = [];
    const workingSets: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      samples.push(await appPrivateMb(electronApp));
      workingSets.push(await appWorkingSetMb(electronApp));
      await page.waitForTimeout(100);
    }
    const peakMb = Math.max(...samples);
    const breakdown = await appMemoryBreakdown(electronApp);
    console.log(
      `[perf] memory privatePeakMB=${String(peakMb)} workingSetPeakMB=${String(
        Math.max(...workingSets),
      )} openedMB=${String(openedMb)} queryTotalMs=${String(totalMs)} ` +
        breakdown
          .map(
            (entry) => `${entry.type}=${String(entry.privateMb)}/${String(entry.workingSetMb)}MB`,
          )
          .join(' '),
    );

    await testInfo.attach('t27-memory.txt', {
      body:
        `openedMB=${String(openedMb)}\nqueryTotalMs=${String(totalMs)}\n` +
        `privateSamplesMB=${samples.join(',')}\nprivatePeakMB=${String(peakMb)}\n` +
        `workingSetSamplesMB=${workingSets.join(',')}\n` +
        `breakdown=${breakdown
          .map(
            (entry) =>
              `${entry.type}:private=${String(entry.privateMb)}MB/ws=${String(entry.workingSetMb)}MB`,
          )
          .join(',')}\nbudgetMB=${String(MEMORY_BUDGET_MB)}\n`,
      contentType: 'text/plain',
    });
    expect(Number.isFinite(totalMs), 'query total time is missing').toBe(true);
    expect(totalMs, `end-to-end query took ${String(totalMs)}ms`).toBeGreaterThan(0);
    expect(peakMb, `app working set peaked at ${String(peakMb)}MB`).toBeLessThanOrEqual(
      MEMORY_BUDGET_MB,
    );
  });
});
