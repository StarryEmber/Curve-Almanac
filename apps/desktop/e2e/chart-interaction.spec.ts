import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

import { expect } from '@playwright/test';

import type { ChartMapping, ChartOptions, ChartSpec } from '@curve/domain';

import { launchCurveApp, repositoryRoot, test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Page, TestInfo } from '@playwright/test';

/**
 * T4.5 — chart interaction, empty states, PNG export and accessibility.
 *
 * Charts are asserted through the RenderModel contract (`data-chart-*`), the
 * DOM toolbar state (legend/zoom) and the real canvas (tooltip, PNG pixels).
 * Pixel equality of the whole chart is not asserted: Windows/DPI differences
 * make it unstable (docs/DEVELOPER.md §6).
 */

const BENCH_WORKSPACE = join(repositoryRoot, 'bench', '.fixtures', '100k-workspace');
const HUNDRED_K_TITLE = '100k chart';
const PNG_TITLE = 'PNG chart';

const COLUMN_IDS = {
  id: 'col_id',
  time: 'col_time',
  sensorA: 'col_a',
  missing: 'col_missing',
} as const;

const BASE_OPTIONS: ChartOptions = {
  smooth: false,
  showSymbol: false,
  lineWidth: 2,
  paletteId: 'default',
  background: 'auto',
  showGrid: true,
  legend: 'top',
  yStartAtZero: false,
  numberDigits: 2,
  sampling: { enabled: true, threshold: 5_000, target: 2_000 },
};

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

interface AxeResults {
  violations: { id: string; impact: string | null; nodes: unknown[] }[];
}

async function auditChart(page: Page): Promise<AxeResults> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run(context: Element, options: unknown): Promise<AxeResults>;
        };
      }
    ).axe;
    const chart = document.querySelector('[data-testid="chart-view"]');
    if (chart === null) {
      throw new Error('The chart view is not mounted.');
    }
    return axe.run(chart, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
  });
}

interface SeedChart {
  id: string;
  viewId: string;
  title: string;
  tableId?: string;
  mapping: ChartMapping;
  filter?: ChartSpec['filter'];
}

interface SeedOptions {
  dir: string;
  name: string;
  charts: SeedChart[];
}

/**
 * Seeds a small workspace through `window.api` (same path as the production
 * open flow). Invalid chart references are intentional: the manifest loads with
 * warnings and the view must show the actionable empty state (SPEC §6.6.4).
 */
async function seedChartsWorkspace(page: Page, options: SeedOptions): Promise<string> {
  return page.evaluate(async ({ dir, name, charts }) => {
    const api = (globalThis as unknown as { api: CurveApi }).api;
    const created = await api.workspace.create({ dir, name });
    if (!created.ok) {
      throw new Error(`create failed: ${created.error.code}`);
    }
    const manifest = created.data;
    const timestamp = manifest.createdAt;
    const tableId = 'tbl_main';
    const columns: WorkspaceManifest['tables'][number]['columns'] = [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
      { id: 'col_time', key: 'time', label: 'Time', type: 'number', role: 'x' },
      { id: 'col_a', key: 'a', label: 'Sensor A', type: 'number', role: 'y', precision: 1 },
    ];
    const rowValues = [
      ['r1', 1, 10],
      ['r2', 2, 20],
      ['r3', 3, 30],
    ];
    const jsonl = rowValues
      .map((values, index) => JSON.stringify({ id: `row_${String(index + 1)}`, v: values }))
      .join('\n');

    const tableViewId = 'viw_table';
    const views: WorkspaceManifest['views'] = [
      {
        id: tableViewId,
        kind: 'table',
        refId: tableId,
        title: 'Readings',
        tableView: {
          tableId,
          styleId: 'builtin.report-light',
          columnOrder: columns.map((column) => column.id),
          widths: {},
          hiddenColumnIds: [],
          sort: [],
          frozenColumnCount: 1,
        },
      },
    ];
    const manifestCharts: WorkspaceManifest['charts'] = charts.map((chart) => ({
      id: chart.id,
      title: chart.title,
      kind: 'line',
      tableId: chart.tableId ?? tableId,
      mapping: chart.mapping,
      ...(chart.filter === undefined ? {} : { filter: chart.filter }),
      sort: [],
      options: {
        smooth: false,
        showSymbol: false,
        lineWidth: 2,
        paletteId: 'default',
        background: 'auto',
        showGrid: true,
        legend: 'top',
        yStartAtZero: false,
        numberDigits: 2,
        sampling: { enabled: true, threshold: 5_000, target: 2_000 },
      },
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    for (const chart of charts) {
      views.push({ id: chart.viewId, kind: 'chart', refId: chart.id, title: chart.title });
    }

    const next: WorkspaceManifest = {
      ...manifest,
      updatedAt: timestamp,
      tables: [
        {
          id: tableId,
          name: 'Readings',
          file: `tables/${tableId}.jsonl`,
          schemaVersion: 1,
          columns,
          primaryKey: 'col_id',
          rowCount: rowValues.length,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      charts: manifestCharts,
      views,
      layout: {
        type: 'pane',
        viewIds: views.map((view) => view.id),
        activeViewId: charts[0]?.viewId ?? tableViewId,
      },
    };
    const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
    if (!written.ok) {
      throw new Error(`manifest write failed: ${written.error.code}`);
    }
    const tableWrite = await api.table.write({
      workspaceId: manifest.id,
      tableId,
      jsonl: `${jsonl}\n`,
    });
    if (!tableWrite.ok) {
      throw new Error(`table write failed: ${tableWrite.error.code}`);
    }
    const closed = await api.workspace.close({ workspaceId: manifest.id });
    if (!closed.ok) {
      throw new Error(`close failed: ${closed.error.code}`);
    }
    return `${dir}\\${name}.cstudio`;
  }, options);
}

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

async function openRecentWorkspace(page: Page, name: string, marker: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId(marker)).toBeVisible();
}

async function capture(
  testInfo: TestInfo,
  page: Page,
  target: string,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.locator(target).screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

/** Copies the generated 100k fixture and adds a chart view to its manifest. */
function seedHundredKChart(testInfo: TestInfo): string {
  if (!existsSync(join(BENCH_WORKSPACE, 'manifest.json'))) {
    throw new Error(
      `Missing ${BENCH_WORKSPACE}; run \`pnpm e2e\` (it generates the fixture first).`,
    );
  }
  const target = testInfo.outputPath('chart-100k');
  cpSync(BENCH_WORKSPACE, target, { recursive: true });
  const manifest = JSON.parse(
    readFileSync(join(target, 'manifest.json'), 'utf8'),
  ) as WorkspaceManifest;
  const timestamp = manifest.updatedAt;
  const chartId = 'cht_100k';
  const viewId = 'viw_chart_100k';
  manifest.charts = [
    {
      id: chartId,
      title: HUNDRED_K_TITLE,
      kind: 'line',
      tableId: 'tbl_bench',
      mapping: {
        layout: 'wide',
        xColumnId: 'col_time',
        yColumnIds: ['col_a'],
      },
      sort: [],
      options: BASE_OPTIONS,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  manifest.views = [
    ...manifest.views,
    { id: viewId, kind: 'chart', refId: chartId, title: HUNDRED_K_TITLE },
  ];
  manifest.layout =
    manifest.layout.type === 'pane'
      ? {
          ...manifest.layout,
          viewIds: [...manifest.layout.viewIds, viewId],
          activeViewId: viewId,
        }
      : { type: 'pane', viewIds: [viewId], activeViewId: viewId };
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

test.describe('T4.5 chart interaction, empty states and PNG export', () => {
  test('chart-interaction: legend, zoom, tooltip and resize work on a 100k sampled chart', async ({
    page,
    electronApp,
  }, testInfo) => {
    test.setTimeout(180_000);
    const target = seedHundredKChart(testInfo);
    await registerRecent(page, target);
    await openRecentWorkspace(page, 'Bench 100k', 'chart-view');

    const view = page.getByTestId('chart-view');
    await expect(view).toHaveAttribute('data-chart-state', 'ready');
    await expect(view).toHaveAttribute('data-chart-sampled', 'true');
    await expect(view).toHaveAttribute('data-chart-source-points', '100000');
    const rendered = Number(await view.getAttribute('data-chart-rendered-points'));
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThanOrEqual(2_000);
    await expect(page.getByTestId('chart-canvas').locator('canvas')).toBeVisible();

    // Legend: the DOM toggle drives the same state as ECharts' own legend.
    const toggle = page.getByTestId('chart-series-toggle-0');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(view).toHaveAttribute('data-chart-hidden-series', 'A');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(view).toHaveAttribute('data-chart-hidden-series', '');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Zoom: buttons move the live dataZoom window, reset returns to 0–100.
    await expect(page.getByTestId('chart-zoom-range')).toHaveText('缩放 0%–100%');
    await page.getByTestId('chart-zoom-in').click();
    await expect
      .poll(async () => Number(await view.getAttribute('data-chart-zoom-start')))
      .toBeGreaterThan(0);
    await expect
      .poll(async () => Number(await view.getAttribute('data-chart-zoom-end')))
      .toBeLessThan(100);
    await page.getByTestId('chart-zoom-out').click();
    await page.getByTestId('chart-zoom-reset').click();
    await expect(page.getByTestId('chart-zoom-range')).toHaveText('缩放 0%–100%');
    await expect(view).toHaveAttribute('data-chart-zoom-start', '0');
    await expect(view).toHaveAttribute('data-chart-zoom-end', '100');

    // Tooltip: hover the plot area until ECharts' HTML tooltip is visible.
    const canvas = page.getByTestId('chart-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) {
      return;
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

    // Resize keeps the same instance and the chart stays interactive.
    const before = await canvas.boundingBox();
    await electronApp.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      window?.setBounds({ width: 1100, height: 760 });
    });
    await expect
      .poll(async () => (await canvas.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
      .not.toBe(before?.width ?? Number.POSITIVE_INFINITY);
    await expect(view).toHaveAttribute('data-chart-state', 'ready');
    await electronApp.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      window?.setBounds({ width: 1440, height: 900 });
    });

    const audit = await auditChart(page);
    const critical = audit.violations.filter((violation) => violation.impact === 'critical');
    await testInfo.attach('t45-axe.json', {
      body: JSON.stringify(audit.violations, null, 2),
      contentType: 'application/json',
    });
    expect(critical, JSON.stringify(critical)).toEqual([]);

    await capture(testInfo, page, '[data-testid="chart-view"]', 't4.5-chart-interaction');
  });

  test('png: exports a 2x image with transparent, white and dark backgrounds', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(180_000);
    const parent = testInfo.outputPath('png');
    const output = join(parent, 'chart.png');
    const target = await launchCurveApp({
      userDataDir,
      importFile: join(userDataDir, 'unused.json'),
      saveFile: output,
    });
    try {
      await expect(target.page.getByTestId('welcome')).toBeVisible();
      const root = await seedChartsWorkspace(target.page, {
        dir: parent,
        name: 'PNG export',
        charts: [
          {
            id: 'cht_png',
            viewId: 'viw_chart_png',
            title: PNG_TITLE,
            mapping: {
              layout: 'wide',
              xColumnId: COLUMN_IDS.time,
              yColumnIds: [COLUMN_IDS.sensorA],
            },
          },
        ],
      });
      await openRecentWorkspace(target.page, 'PNG export', 'chart-view');
      const page = target.page;
      const view = page.getByTestId('chart-view');
      await expect(view).toHaveAttribute('data-chart-state', 'ready');
      const box = await page.getByTestId('chart-canvas').boundingBox();
      expect(box).not.toBeNull();

      await page.getByTestId('chart-export-open').click();
      const dialog = page.getByTestId('chart-export-dialog');
      await expect(dialog).toBeVisible();
      const suggested = await page.getByTestId('chart-export-filename').textContent();
      expect(suggested).toMatch(/^PNG chart-\d{8}-\d{4}\.png$/);
      await expect(page.getByTestId('chart-export-background')).toHaveValue('transparent');

      await page.getByTestId('chart-export-confirm').click();
      await expect(page.getByTestId('chart-export-success')).toBeVisible();
      await expect.poll(() => existsSync(output)).toBe(true);
      const transparent = await decodePng(page, output);
      const size = pngSize(readFileSync(output));
      expect(Math.abs(size.width - (box?.width ?? 0) * 2)).toBeLessThanOrEqual(4);
      expect(Math.abs(size.height - (box?.height ?? 0) * 2)).toBeLessThanOrEqual(4);
      expect(transparent.pixel[3]).toBe(0);

      // White background.
      rmSync(output, { force: true });
      await page.getByTestId('chart-export-background').selectOption('light');
      await page.getByTestId('chart-export-confirm').click();
      await expect.poll(() => existsSync(output)).toBe(true);
      await expect
        .poll(async () => (await decodePng(page, output)).pixel.slice(0, 3))
        .toEqual([255, 255, 255]);

      // Dark background (chart-model CHART_BACKGROUNDS.dark).
      rmSync(output, { force: true });
      await page.getByTestId('chart-export-background').selectOption('dark');
      await page.getByTestId('chart-export-confirm').click();
      await expect.poll(() => existsSync(output)).toBe(true);
      await expect
        .poll(async () => (await decodePng(page, output)).pixel.slice(0, 3))
        .toEqual([30, 30, 30]);
      await capture(testInfo, page, '[data-testid="chart-export-dialog"]', 't4.5-export-dialog');

      // Keyboard + 200% zoom smoke: the dialog stays inside the viewport, Esc
      // closes it and the toolbar toggles respond to Space.
      const setZoom = async (factor: number): Promise<void> => {
        await target.electronApp.evaluate(({ BrowserWindow }, value) => {
          const [window] = BrowserWindow.getAllWindows();
          window?.webContents.setZoomFactor(value);
        }, factor);
        await page.waitForFunction(
          (expected) => (expected >= 2 ? window.innerWidth < 800 : window.innerWidth >= 800),
          factor,
        );
      };
      await setZoom(2);
      const dialogBox = await dialog.boundingBox();
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      expect(dialogBox).not.toBeNull();
      if (dialogBox !== null) {
        expect(dialogBox.x).toBeGreaterThanOrEqual(0);
        expect(dialogBox.y).toBeGreaterThanOrEqual(0);
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height + 1);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      const toggle = page.getByTestId('chart-series-toggle-0');
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await page.keyboard.press('Space');
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await setZoom(1);

      expect(extname(output)).toBe('.png');
      expect(readManifest(root).charts).toHaveLength(1);
    } finally {
      await target.electronApp.close();
    }
  });

  test('chart-empty: no-data and unmapped states offer working actions', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const parent = testInfo.outputPath('empty');
    await seedChartsWorkspace(page, {
      dir: parent,
      name: 'Chart empty states',
      charts: [
        {
          id: 'cht_no_data',
          viewId: 'viw_no_data',
          title: 'No data chart',
          mapping: {
            layout: 'wide',
            xColumnId: COLUMN_IDS.time,
            yColumnIds: [COLUMN_IDS.sensorA],
          },
          filter: {
            kind: 'all',
            children: [{ kind: 'compare', columnId: COLUMN_IDS.sensorA, op: 'gt', value: 10_000 }],
          },
        },
        {
          id: 'cht_unmapped',
          viewId: 'viw_unmapped',
          title: 'Unmapped chart',
          mapping: {
            layout: 'wide',
            xColumnId: COLUMN_IDS.missing,
            yColumnIds: [COLUMN_IDS.sensorA],
          },
        },
      ],
    });
    await openRecentWorkspace(page, 'Chart empty states', 'chart-view');

    const view = page.getByTestId('chart-view');
    await expect(view).toHaveAttribute('data-chart-state', 'empty');
    await expect(view).toHaveAttribute('data-chart-empty', 'no-data');
    await expect(page.getByTestId('chart-empty-action-no-data')).toHaveText('查看数据表');
    await page.getByTestId('chart-empty-action-no-data').click();
    await expect(page.getByTestId('data-grid')).toBeVisible();

    await page.getByRole('tab', { name: 'Unmapped chart' }).click();
    await expect(view).toHaveAttribute('data-chart-state', 'missing-columns');
    await expect(view).toHaveAttribute('data-chart-empty', 'unmapped');
    await expect(page.getByTestId('chart-empty-action-unmapped')).toHaveText('配置映射');
    await page.getByTestId('chart-empty-action-unmapped').click();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
      .toBe('chart-remap-layout');

    // `no-table` is a defensive view state: a manifest whose chart references a
    // missing table fails validation on open (`checkChartInto` is an error), so
    // it is covered by the ChartView component tests instead of a persisted
    // workspace (see docs/reports/t4.5/REPORT.md).
    await capture(testInfo, page, '[data-testid="chart-view"]', 't4.5-empty-state');
  });
});
