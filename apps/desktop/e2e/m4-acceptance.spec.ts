/**
 * M4 acceptance demo (TASKS M4, TESTPLAN E6, HANDOFF §0.1).
 *
 * One end-to-end scenario that walks the milestone acceptance script:
 *
 * 1. create a wide line chart from the same table with two Y columns and assert
 *    two series with their legend names;
 * 2. switch the same chart to the long layout (`site`) and assert the series
 *    count equals the distinct value count;
 * 3. use the real chart toolbar: legend toggle, zoom, tooltip; change the
 *    palette and line width; the persisted options survive a restart (zoom and
 *    legend selection are transient by ADR-044 and reset to 0–100/all on);
 * 4. open a 100k-point chart: the deferred loading state appears first, then the
 *    “sampled” badge, source 100000 and rendered ≤ 2000 points per series;
 * 5. export a PNG with the white background and assert the file, the 2x size,
 *    the filename pattern and a white pixel;
 * 6. delete a mapped column, assert the actionable error state, remap the chart
 *    back to a valid Y column and assert it recovers; restart the app with the
 *    same `userData` and assert the chart, view, palette/line width, PNG title
 *    and the 100k sampled state were restored.
 *
 * The small workspace and the 100k fixture are seeded through `window.api`
 * (same pattern as the M2/M3/T4.x specs); every chart interaction above is
 * driven through the UI. Charts are asserted through the `data-chart-*` render
 * contract (SPEC §11.5), the persisted manifest and the exported PNG bytes; no
 * whole-chart pixel equality is asserted (HANDOFF §3.6).
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import type { ChartOptions } from '@curve/domain';

import { launchCurveApp, repositoryRoot, test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Locator, Page, TestInfo } from '@playwright/test';

const SOURCE_NAME = 'M4 Source';
const SOURCE_TABLE = 'Readings';
const SOURCE_CHART = 'M4 trend';
const HUNDRED_K_NAME = 'Bench 100k';
const HUNDRED_K_TITLE = '100k chart';

const BENCH_WORKSPACE = join(repositoryRoot, 'bench', '.fixtures', '100k-workspace');
const CHART_RESOLVE_BUDGET_MS = 300;
const CHART_UPDATE_BUDGET_MS = 200;
const CHART_SAMPLE_TARGET = 2_000;
const MEMORY_BUDGET_MB = 1024;

const COL = {
  id: 'col_id',
  time: 'col_time',
  sensorA: 'col_a',
  sensorB: 'col_b',
  site: 'col_site',
} as const;

type Column = WorkspaceManifest['tables'][number]['columns'][number];
type Cell = string | number | boolean | null;

const COLUMNS: Column[] = [
  {
    id: COL.id,
    key: 'id',
    label: 'ID',
    type: 'text',
    role: 'none',
    required: true,
  },
  { id: COL.time, key: 'time', label: 'Time', type: 'number', role: 'x' },
  { id: COL.sensorA, key: 'sensor_a', label: 'Sensor A', type: 'number', role: 'y', precision: 1 },
  { id: COL.sensorB, key: 'sensor_b', label: 'Sensor B', type: 'number', role: 'y', precision: 1 },
  { id: COL.site, key: 'site', label: 'Site', type: 'text', role: 'series' },
];

/** Three distinct site values in first-occurrence order: east, west, north. */
const ROWS: Cell[][] = [
  ['r1', 1, 10, 100, 'east'],
  ['r2', 2, 20, 120, 'west'],
  ['r3', 3, 30, 140, 'north'],
  ['r4', 4, 12, 160, 'east'],
  ['r5', 5, 22, 180, 'west'],
  ['r6', 6, 32, 200, 'north'],
];

const LONG_SERIES = 'east|west|north';
const WIDE_SERIES = 'Sensor A|Sensor B';

const HUNDRED_K_OPTIONS: ChartOptions = {
  smooth: false,
  showSymbol: false,
  lineWidth: 2,
  paletteId: 'default',
  background: 'auto',
  showGrid: true,
  legend: 'top',
  yStartAtZero: false,
  numberDigits: 1,
  sampling: { enabled: true, threshold: 5_000, target: CHART_SAMPLE_TARGET },
};

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

/** Seeds the six-row source workspace through `window.api` (same as M3/T4.4). */
async function seedSourceWorkspace(page: Page, dir: string): Promise<string> {
  return page.evaluate(
    async (seed) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir: seed.dir, name: seed.name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      const timestamp = manifest.createdAt;
      const columns: Column[] = seed.columns;
      const jsonl = `${seed.rows
        .map((values, index) => JSON.stringify({ id: `row_m4_${String(index + 1)}`, v: values }))
        .join('\n')}\n`;
      const tableViewId = 'viw_m4_table';
      const next: WorkspaceManifest = {
        ...manifest,
        updatedAt: timestamp,
        tables: [
          {
            id: seed.tableId,
            name: seed.tableName,
            file: `tables/${seed.tableId}.jsonl`,
            schemaVersion: 1,
            columns,
            primaryKey: columns[0]?.id ?? COL.id,
            rowCount: seed.rows.length,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views: [
          {
            id: tableViewId,
            kind: 'table',
            refId: seed.tableId,
            title: seed.tableName,
            tableView: {
              tableId: seed.tableId,
              styleId: 'builtin.report-light',
              columnOrder: columns.map((column) => column.id),
              widths: {},
              hiddenColumnIds: [],
              sort: [],
              frozenColumnCount: 0,
            },
          },
        ],
        layout: { type: 'pane', viewIds: [tableViewId], activeViewId: tableViewId },
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId: seed.tableId,
        jsonl,
      });
      if (!tableWrite.ok) {
        throw new Error(`table write failed: ${tableWrite.error.code}`);
      }
      const closed = await api.workspace.close({ workspaceId: manifest.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
      return `${seed.dir}\\${seed.name}.cstudio`;
    },
    {
      dir,
      name: SOURCE_NAME,
      tableId: 'tbl_m4',
      tableName: SOURCE_TABLE,
      columns: COLUMNS,
      rows: ROWS,
    },
  );
}

/**
 * Copies the generated 100k fixture and adds one wide chart view. The fixture is
 * produced by `pnpm e2e` (`scripts/gen-100k.ts`); a single-spec run needs it too.
 */
function seedHundredKChart(testInfo: TestInfo): string {
  if (!existsSync(join(BENCH_WORKSPACE, 'manifest.json'))) {
    throw new Error(
      `Missing ${BENCH_WORKSPACE}; run \`pnpm e2e\` (it generates the fixture first).`,
    );
  }
  const target = testInfo.outputPath('100k-chart');
  cpSync(BENCH_WORKSPACE, target, { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(target, 'manifest.json'), 'utf8'),
  ) as WorkspaceManifest;
  const timestamp = manifest.updatedAt;
  const chartId = 'cht_m4_100k';
  const viewId = 'viw_m4_100k';
  manifest.charts = [
    {
      id: chartId,
      title: HUNDRED_K_TITLE,
      kind: 'line',
      tableId: 'tbl_bench',
      mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
      sort: [],
      options: HUNDRED_K_OPTIONS,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  manifest.views = [
    ...manifest.views,
    { id: viewId, kind: 'chart', refId: chartId, title: HUNDRED_K_TITLE },
  ];
  const existingViewIds = manifest.layout.type === 'pane' ? manifest.layout.viewIds : [];
  manifest.layout = {
    type: 'pane',
    viewIds: [...existingViewIds, viewId],
    activeViewId: viewId,
  };
  writeFileSync(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}

/** Adds the copied workspace to the recent list through the production open flow. */
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

async function openRecent(page: Page, name: string, marker: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId(marker)).toBeVisible();
}

async function closeWorkspace(page: Page): Promise<void> {
  await page.getByRole('button', { name: '关闭工作区' }).click();
  await expect(page.getByTestId('welcome')).toBeVisible();
}

async function dismissWarnings(page: Page): Promise<void> {
  const warnings = page.locator('.cs-warnings');
  if ((await warnings.count()) === 0) {
    return;
  }
  const hide = warnings.getByRole('button', { name: '隐藏提示' });
  if ((await hide.count()) > 0) {
    await hide.first().click();
  }
  await expect(warnings).toHaveCount(0);
}

async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('autosave-status')).toContainText('已保存', { timeout: 20_000 });
}

/**
 * Watches the deferred-resolve loading state of the next mounted chart view.
 * The 100k chart paints `data-chart-state="loading"` before the row scan, so the
 * observer is installed while the welcome page is still visible.
 */
async function installLoadingObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as unknown as { __m4LoadingSeen?: boolean };
    target.__m4LoadingSeen = false;
    const flag = (element: Element | null): void => {
      if (
        element !== null &&
        (element.getAttribute('data-chart-state') === 'loading' ||
          element.getAttribute('data-chart-pending') === 'true')
      ) {
        target.__m4LoadingSeen = true;
      }
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          flag(record.target as Element);
        }
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          flag(node);
          flag(node.querySelector('[data-testid="chart-view"]'));
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-chart-state', 'data-chart-pending'],
    });
  });
}

async function loadingSeen(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __m4LoadingSeen?: boolean }).__m4LoadingSeen === true,
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

function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('The exported file is not a PNG.');
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

interface DecodedPng {
  width: number;
  height: number;
  pixel: [number, number, number, number];
}

async function decodePng(page: Page, path: string): Promise<DecodedPng> {
  const base64 = readFileSync(path).toString('base64');
  return page.evaluate(async (data) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        resolve();
      };
      image.onerror = () => {
        reject(new Error('PNG decode failed'));
      };
      image.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('2D context unavailable');
    }
    context.drawImage(image, 0, 0);
    const pixel = context.getImageData(2, 2, 1, 1).data;
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      pixel: [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0, pixel[3] ?? 0] as [
        number,
        number,
        number,
        number,
      ],
    };
  }, base64);
}

async function capture(target: Page | Locator, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(name);
  await target.screenshot({ path });
  await testInfo.attach(name.replace(/\.png$/u, ''), { path, contentType: 'image/png' });
}

/** Hovers the chart until ECharts' HTML tooltip is visible (same as T4.5). */
async function expectTooltip(page: Page, canvas: Locator): Promise<string> {
  const box = await canvas.boundingBox();
  expect(box, 'the chart canvas is not laid out').not.toBeNull();
  if (box === null) {
    return '';
  }
  const tooltip = page.locator('.cs-chart-tooltip').first();
  for (const ratio of [0.5, 0.4, 0.6, 0.3]) {
    await page.mouse.move(box.x + box.width * ratio, box.y + box.height * 0.5);
    await page.waitForTimeout(150);
    if (await tooltip.isVisible()) {
      break;
    }
  }
  await expect(tooltip).toBeVisible();
  await expect(tooltip).not.toHaveText('');
  return (await tooltip.textContent())?.trim() ?? '';
}

test.describe('M4 acceptance demo', () => {
  test('wide/long charts, interactions, 100k sampling, PNG export and restart restore', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(360_000);

    const parent = testInfo.outputPath('m4');
    mkdirSync(parent, { recursive: true });
    const sourceRoot = join(parent, `${SOURCE_NAME}.cstudio`);
    const hundredKRoot = seedHundredKChart(testInfo);
    // One save-dialog stub per launch (HANDOFF §0.1); its path receives the PNG.
    const pngPath = join(parent, 'm4-100k.png');
    const unusedImport = join(parent, 'unused.json');
    const metrics: Record<string, string | number | boolean> = {};

    let first: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let second: Awaited<ReturnType<typeof launchCurveApp>> | undefined;

    try {
      // ------------------------------------------------------------------
      // Launch 1 — source workspace: wide → long, interactions, error/remap,
      //             then the 100k chart, PNG export.
      // ------------------------------------------------------------------
      first = await launchCurveApp({ userDataDir, importFile: unusedImport, saveFile: pngPath });
      const page = first.page;
      await expect(page.getByTestId('welcome')).toBeVisible();
      expect(await seedSourceWorkspace(page, parent)).toBe(sourceRoot);
      await registerRecent(page, hundredKRoot);
      await openRecent(page, SOURCE_NAME, 'data-grid');
      await expect(page.getByTestId('workspace-label')).toHaveText(SOURCE_NAME);
      await dismissWarnings(page);

      // 1. Wizard: table → wide mapping (two Y columns) → preview → create.
      await page.getByTestId('sidebar').getByRole('tab', { name: '图表' }).click();
      await expect(page.getByTestId('chart-list')).toBeVisible();
      await page.getByTestId('chart-new').click();
      const dialog = page.getByRole('dialog', { name: '新建图表' });
      await expect(dialog).toBeVisible();
      await page.getByTestId('chart-new-name').fill(SOURCE_CHART);
      await expect(page.getByTestId('chart-new-table')).toHaveValue('tbl_m4');
      await expect(page.getByTestId('chart-new-y-col_a')).toBeChecked();
      await page.getByTestId('chart-new-y-col_b').check();
      await expect(page.getByTestId('chart-new-canvas')).toBeVisible();
      await page.getByTestId('chart-new-create').click();
      await expect(dialog).toBeHidden();

      const view = page.getByTestId('chart-view');
      await expect(view).toHaveAttribute('data-chart-state', 'ready');
      await expect(view).toHaveAttribute('data-chart-kind', 'line');
      await expect(view).toHaveAttribute('data-chart-layout', 'wide');
      await expect(view).toHaveAttribute('data-chart-series-count', '2');
      await expect(view).toHaveAttribute('data-chart-series', WIDE_SERIES);
      await expect(view).toHaveAttribute('data-chart-source-points', '12');
      await expect(view).toHaveAttribute('data-chart-sampled', 'false');
      await expect(page.getByTestId('chart-canvas').locator('canvas')).toBeVisible();
      await capture(view, testInfo, 'm4-01-wide-chart.png');
      await expect
        .poll(() => readManifest(sourceRoot).charts[0]?.mapping)
        .toEqual({ layout: 'wide', xColumnId: COL.time, yColumnIds: [COL.sensorA, COL.sensorB] });
      await expect
        .poll(() => readManifest(sourceRoot).views.filter((entry) => entry.kind === 'chart'))
        .toHaveLength(1);
      metrics.wideSeries = WIDE_SERIES;

      // 2. One chart, long layout: series count = distinct `site` values.
      await page.getByTestId('inspector').getByRole('tab', { name: '映射' }).click();
      await page.getByTestId('chart-mapping-layout').selectOption('long');
      await expect(view).toHaveAttribute('data-chart-layout', 'long');
      await expect(view).toHaveAttribute('data-chart-series-count', '3');
      await expect(view).toHaveAttribute('data-chart-series', LONG_SERIES);
      await expect(view).toHaveAttribute('data-chart-source-points', '6');
      await expect
        .poll(() => readManifest(sourceRoot).charts[0]?.mapping)
        .toEqual({
          layout: 'long',
          xColumnId: COL.time,
          seriesColumnId: COL.site,
          yColumnId: COL.sensorA,
        });
      metrics.longSeries = LONG_SERIES;

      // 3a. Legend toggle + zoom + tooltip through the real toolbar.
      const toggle = page.getByTestId('chart-series-toggle-0');
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await toggle.click();
      await expect(view).toHaveAttribute('data-chart-hidden-series', 'east');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      metrics.hiddenSeries = (await view.getAttribute('data-chart-hidden-series')) ?? '';
      await toggle.click();
      await expect(view).toHaveAttribute('data-chart-hidden-series', '');

      const tooltipText = await expectTooltip(page, page.getByTestId('chart-canvas'));
      metrics.tooltipText = tooltipText.slice(0, 120);

      await page.getByTestId('chart-zoom-in').click();
      await expect
        .poll(async () => Number(await view.getAttribute('data-chart-zoom-start')))
        .toBeGreaterThan(0);
      await expect
        .poll(async () => Number(await view.getAttribute('data-chart-zoom-end')))
        .toBeLessThan(100);
      metrics.zoomStart = Number(await view.getAttribute('data-chart-zoom-start'));
      metrics.zoomEnd = Number(await view.getAttribute('data-chart-zoom-end'));

      // 3b. Style options that are persisted (unlike the transient interaction).
      await page.getByTestId('inspector').getByRole('tab', { name: '外观' }).click();
      const defaultPalette = (await view.getAttribute('data-chart-palette')) ?? '';
      await page.getByTestId('chart-palette').selectOption('vivid');
      await expect
        .poll(async () => view.getAttribute('data-chart-palette'))
        .not.toBe(defaultPalette);
      await page.getByTestId('chart-line-width').fill('4');
      await page.getByTestId('chart-line-width').blur();
      await expect(view).toHaveAttribute('data-chart-line-width', '4');
      const paletteColor = (await view.getAttribute('data-chart-palette')) ?? '';
      expect(paletteColor).not.toBe('');
      metrics.paletteColor = paletteColor;
      metrics.lineWidth = 4;
      await expect
        .poll(() => readManifest(sourceRoot).charts[0]?.options)
        .toMatchObject({ paletteId: 'vivid', lineWidth: 4 });
      // Reset the zoom before the screenshot: the six-row long chart only has
      // two points per series, so a 25–75 window would hide almost all of them.
      await page.getByTestId('chart-zoom-reset').click();
      await expect(view).toHaveAttribute('data-chart-zoom-start', '0');
      await expect(view).toHaveAttribute('data-chart-zoom-end', '100');
      await capture(view, testInfo, 'm4-02-long-interactions.png');
      await waitForSaved(page);

      // 6a. Delete the mapped Y column: the chart must recover through remap.
      await page.getByRole('tab', { name: SOURCE_TABLE, exact: true }).click();
      await expect(page.getByTestId('data-grid')).toBeVisible();
      await page.getByRole('button', { name: '编辑列 Sensor A' }).click();
      await page.getByRole('dialog', { name: '编辑列' }).getByTestId('column-form-delete').click();
      const confirm = page.getByRole('dialog', { name: '删除列“Sensor A”？' });
      await expect(confirm).toContainText('将失效图表：1');
      await confirm.getByTestId('column-change-confirm').click();
      await expect.poll(() => readManifest(sourceRoot).tables[0]?.columns.length).toBe(4);

      await page.getByRole('tab', { name: SOURCE_CHART, exact: true }).click();
      await expect(view).toHaveAttribute('data-chart-state', 'missing-columns');
      await expect(view).toHaveAttribute('data-chart-empty', 'unmapped');
      await expect(page.getByTestId('chart-error')).toContainText(COL.sensorA);
      await expect(page.getByTestId('chart-remap')).toBeVisible();
      await capture(view, testInfo, 'm4-03-remap-error.png');

      await page.getByTestId('chart-remap-y').selectOption(COL.sensorB);
      await expect(view).toHaveAttribute('data-chart-state', 'ready');
      await expect(view).toHaveAttribute('data-chart-series-count', '3');
      await expect(view).toHaveAttribute('data-chart-series', LONG_SERIES);
      await expect(view).toHaveAttribute('data-chart-source-points', '6');
      await expect
        .poll(() => readManifest(sourceRoot).charts[0]?.mapping)
        .toEqual({
          layout: 'long',
          xColumnId: COL.time,
          seriesColumnId: COL.site,
          yColumnId: COL.sensorB,
        });
      await waitForSaved(page);
      metrics.remapY = COL.sensorB;
      metrics.columnCountAfterDelete = 4;

      await closeWorkspace(page);

      // 4. 100k chart: loading first, then sampled badge and ≤2k points.
      await page.reload();
      await expect(page.getByTestId('welcome')).toBeVisible();
      await installLoadingObserver(page);
      await page
        .getByTestId('recent-workspace')
        .filter({ hasText: HUNDRED_K_NAME })
        .first()
        .click();
      const hundredKView = page.getByTestId('chart-view');
      await expect(hundredKView).toHaveAttribute('data-chart-state', 'ready', { timeout: 60_000 });
      expect(await loadingSeen(page), 'the 100k chart must paint loading first').toBe(true);
      await dismissWarnings(page);

      await expect(page.getByTestId('chart-title')).toHaveText(HUNDRED_K_TITLE);
      await expect(hundredKView).toHaveAttribute('data-chart-sampled', 'true');
      await expect(hundredKView).toHaveAttribute('data-chart-source-points', '100000');
      await expect(page.getByTestId('chart-sampled-badge')).toBeVisible();
      await expect(page.getByTestId('chart-sampled-badge')).toHaveText('已采样');
      const renderedPoints = Number(await hundredKView.getAttribute('data-chart-rendered-points'));
      expect(renderedPoints).toBeGreaterThan(0);
      expect(renderedPoints).toBeLessThanOrEqual(CHART_SAMPLE_TARGET);
      const hundredKCanvas = page.getByTestId('chart-canvas');
      await expect(hundredKCanvas.locator('canvas')).toBeVisible();

      const resolveMs = Number(await hundredKView.getAttribute('data-chart-resolve-ms'));
      const updateMs = Number(await hundredKCanvas.getAttribute('data-chart-update-ms'));
      const instances = Number(await hundredKCanvas.getAttribute('data-chart-instances'));
      expect(resolveMs).toBeGreaterThan(0);
      expect(resolveMs).toBeLessThanOrEqual(CHART_RESOLVE_BUDGET_MS);
      expect(updateMs).toBeGreaterThan(0);
      expect(updateMs).toBeLessThanOrEqual(CHART_UPDATE_BUDGET_MS);
      expect(instances).toBe(1);
      const memoryMb = await appPrivateMb(first.electronApp);
      expect(memoryMb).toBeLessThanOrEqual(MEMORY_BUDGET_MB);
      Object.assign(metrics, {
        hundredKLoading: true,
        hundredKSourcePoints: 100_000,
        hundredKRenderedPoints: renderedPoints,
        hundredKResolveMs: resolveMs,
        hundredKUpdateMs: updateMs,
        hundredKInstances: instances,
        hundredKMemoryMB: memoryMb,
      });
      await capture(hundredKView, testInfo, 'm4-04-100k-sampled.png');

      // 5. PNG export: white background, 2x the chart container, real PNG bytes.
      const canvasBox = await hundredKCanvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      await page.getByTestId('chart-export-open').click();
      const exportDialog = page.getByRole('dialog', { name: '导出 PNG' });
      const exportBody = page.getByTestId('chart-export-dialog');
      await expect(exportDialog).toBeVisible();
      await expect(exportBody).toBeVisible();
      const suggestedName = (await page.getByTestId('chart-export-filename').textContent())?.trim();
      expect(suggestedName).toMatch(/^100k chart-\d{8}-\d{4}\.png$/u);
      await page.getByTestId('chart-export-background').selectOption('light');
      await capture(exportDialog, testInfo, 'm4-05-export-dialog.png');
      await page.getByTestId('chart-export-confirm').click();
      await expect(page.getByTestId('chart-export-success')).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => existsSync(pngPath)).toBe(true);
      const pngBytes = readFileSync(pngPath);
      const size = pngSize(pngBytes);
      const decoded = await decodePng(page, pngPath);
      expect(decoded.width).toBe(size.width);
      expect(decoded.height).toBe(size.height);
      expect(Math.abs(size.width - (canvasBox?.width ?? 0) * 2)).toBeLessThanOrEqual(4);
      expect(Math.abs(size.height - (canvasBox?.height ?? 0) * 2)).toBeLessThanOrEqual(4);
      expect(decoded.pixel.slice(0, 3)).toEqual([255, 255, 255]);
      Object.assign(metrics, {
        pngFileName: suggestedName ?? '',
        pngBytes: pngBytes.byteLength,
        pngWidth: size.width,
        pngHeight: size.height,
        canvasWidth: Math.round(canvasBox?.width ?? 0),
        canvasHeight: Math.round(canvasBox?.height ?? 0),
      });
      await page.keyboard.press('Escape');
      await expect(exportDialog).toBeHidden();

      await first.electronApp.close();
      first = undefined;

      // ------------------------------------------------------------------
      // Launch 2 — restart with the same userData: charts/options/sample restore.
      // ------------------------------------------------------------------
      second = await launchCurveApp({ userDataDir, importFile: unusedImport });
      const restorePage = second.page;
      await expect(restorePage.getByTestId('welcome')).toBeVisible();
      await openRecent(restorePage, SOURCE_NAME, 'workspace-label');
      await restorePage.getByRole('tab', { name: SOURCE_CHART, exact: true }).click();
      const restoredView = restorePage.getByTestId('chart-view');
      await expect(restoredView).toHaveAttribute('data-chart-state', 'ready');
      await expect(restoredView).toHaveAttribute('data-chart-kind', 'line');
      await expect(restoredView).toHaveAttribute('data-chart-layout', 'long');
      await expect(restoredView).toHaveAttribute('data-chart-series-count', '3');
      await expect(restoredView).toHaveAttribute('data-chart-series', LONG_SERIES);
      await expect(restoredView).toHaveAttribute('data-chart-palette', paletteColor);
      await expect(restoredView).toHaveAttribute('data-chart-line-width', '4');
      // ADR-044: legend/zoom are transient view state, so they reset on restart.
      await expect(restoredView).toHaveAttribute('data-chart-zoom-start', '0');
      await expect(restoredView).toHaveAttribute('data-chart-zoom-end', '100');
      await expect(restoredView).toHaveAttribute('data-chart-hidden-series', '');
      await expect(restorePage.getByTestId('chart-title')).toHaveText(SOURCE_CHART);
      await expect
        .poll(() => readManifest(sourceRoot).charts[0]?.mapping)
        .toEqual({
          layout: 'long',
          xColumnId: COL.time,
          seriesColumnId: COL.site,
          yColumnId: COL.sensorB,
        });
      await capture(restoredView, testInfo, 'm4-06-source-restored.png');

      await closeWorkspace(restorePage);
      await restorePage.reload();
      await expect(restorePage.getByTestId('welcome')).toBeVisible();
      await installLoadingObserver(restorePage);
      await restorePage
        .getByTestId('recent-workspace')
        .filter({ hasText: HUNDRED_K_NAME })
        .first()
        .click();
      const restoredHundredK = restorePage.getByTestId('chart-view');
      await expect(restoredHundredK).toHaveAttribute('data-chart-state', 'ready', {
        timeout: 60_000,
      });
      expect(await loadingSeen(restorePage)).toBe(true);
      await dismissWarnings(restorePage);
      await expect(restorePage.getByTestId('chart-title')).toHaveText(HUNDRED_K_TITLE);
      await expect(restoredHundredK).toHaveAttribute('data-chart-sampled', 'true');
      await expect(restoredHundredK).toHaveAttribute('data-chart-source-points', '100000');
      await expect(restorePage.getByTestId('chart-sampled-badge')).toBeVisible();
      const restoredRendered = Number(
        await restoredHundredK.getAttribute('data-chart-rendered-points'),
      );
      expect(restoredRendered).toBeGreaterThan(0);
      expect(restoredRendered).toBeLessThanOrEqual(CHART_SAMPLE_TARGET);
      await restorePage.getByTestId('chart-export-open').click();
      const restoredExport = restorePage.getByTestId('chart-export-dialog');
      await expect(restoredExport).toBeVisible();
      const restoredSuggested = (
        await restorePage.getByTestId('chart-export-filename').textContent()
      )?.trim();
      expect(restoredSuggested).toMatch(/^100k chart-\d{8}-\d{4}\.png$/u);
      expect((restoredSuggested ?? '').replace(/-\d{8}-\d{4}\.png$/u, '')).toBe(
        (suggestedName ?? '').replace(/-\d{8}-\d{4}\.png$/u, ''),
      );
      await restorePage.keyboard.press('Escape');
      await expect(restoredExport).toBeHidden();
      await capture(restoredHundredK, testInfo, 'm4-07-100k-restored.png');

      const summary = Object.entries(metrics)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join('\n');
      console.log(`[m4] ${summary.replaceAll('\n', ' ')}`);
      await testInfo.attach('m4-metrics.txt', { body: `${summary}\n`, contentType: 'text/plain' });
    } finally {
      await second?.electronApp.close().catch(() => undefined);
      await first?.electronApp.close().catch(() => undefined);
    }
  });
});
