import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import type { ChartMapping, ChartOptions } from '@curve/domain';

import { launchCurveApp, test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Page, TestInfo } from '@playwright/test';

/**
 * T4.4 — chart creation, mapping and inspector.
 *
 * Covers the four acceptance items: wide multi-Y and long series mapping,
 * inspector items taking effect and surviving a restart, an actionable error
 * state after a mapped column is deleted (remap), and chart duplication with a
 * fresh id. Charts are asserted through the RenderModel contract that
 * `ChartView` exposes as `data-chart-*` attributes (series names/count, style,
 * points), the persisted manifest and the real canvas (presence only — pixel
 * equality is not stable on Windows at 125% DPI, see HANDOFF §3.6).
 */

const SEED_NAME = 'Chart Demo';

const COLUMN_IDS = {
  id: 'col_id',
  time: 'col_time',
  sensorA: 'col_a',
  sensorB: 'col_b',
  site: 'col_site',
  note: 'col_note',
} as const;

interface SeedChart {
  id: string;
  viewId: string;
  title: string;
  mapping: ChartMapping;
  options?: Partial<ChartOptions>;
}

interface SeedOptions {
  dir: string;
  name: string;
  withNote: boolean;
  chart?: SeedChart;
}

async function seedWorkspace(page: Page, options: SeedOptions): Promise<string> {
  const result = await page.evaluate(async ({ dir, name, withNote, chart }) => {
    const api = (globalThis as unknown as { api: CurveApi }).api;
    const created = await api.workspace.create({ dir, name });
    if (!created.ok) {
      throw new Error(`create failed: ${created.error.code}`);
    }
    const manifest = created.data;
    const timestamp = manifest.createdAt;
    const tableId = 'tbl_chart';
    const columns: WorkspaceManifest['tables'][number]['columns'] = [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
      { id: 'col_time', key: 'time', label: 'Time', type: 'number', role: 'x' },
      { id: 'col_a', key: 'a', label: 'Sensor A', type: 'number', role: 'y', precision: 1 },
      { id: 'col_b', key: 'b', label: 'Sensor B', type: 'number', role: 'y', precision: 1 },
      { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' },
    ];
    if (withNote) {
      columns.push({ id: 'col_note', key: 'note', label: 'Note', type: 'text', role: 'x' });
    }
    const rowValues = [
      ['r1', 1, 10, 100, 'east', 'alpha'],
      ['r2', 2, 12, 120, 'west', 'beta'],
      ['r3', 3, 14, 140, 'north', 'gamma'],
      ['r4', 4, 16, 160, 'east', 'delta'],
      ['r5', 5, 18, 180, 'west', 'epsilon'],
      ['r6', 6, 20, 200, 'north', 'zeta'],
    ];
    const jsonl = rowValues
      .map((values, index) =>
        JSON.stringify({
          id: `row_${String(index + 1)}`,
          v: withNote ? values : values.slice(0, 5),
        }),
      )
      .join('\n');

    const tableViewId = 'viw_chart_table';
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
    const charts: WorkspaceManifest['charts'] = [];
    if (chart !== undefined) {
      charts.push({
        id: chart.id,
        title: chart.title,
        kind: 'line',
        tableId,
        mapping: chart.mapping,
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
          ...(chart.options ?? {}),
        },
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      views.push({
        id: chart.viewId,
        kind: 'chart',
        refId: chart.id,
        title: chart.title,
      });
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
      charts,
      views,
      layout: {
        type: 'pane',
        viewIds: views.map((view) => view.id),
        activeViewId: chart === undefined ? tableViewId : chart.viewId,
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
  return result;
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

async function openChartsTab(page: Page): Promise<void> {
  await page.getByTestId('sidebar').getByRole('tab', { name: '图表' }).click();
  await expect(page.getByTestId('chart-list')).toBeVisible();
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

test.describe('T4.4 chart creation and inspector', () => {
  test('creates wide and long charts, applies every inspector group and restores them after a restart', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(180_000);
    const parent = testInfo.outputPath('charts');
    const root = join(parent, `${SEED_NAME}.cstudio`);
    const chartAttributes: Record<string, string> = {};

    const first = await launchCurveApp({
      userDataDir,
      importFile: join(userDataDir, 'unused.json'),
    });
    try {
      await expect(first.page.getByTestId('welcome')).toBeVisible();
      expect(
        await seedWorkspace(first.page, { dir: parent, name: SEED_NAME, withNote: false }),
      ).toBe(root);
      await openRecentWorkspace(first.page, SEED_NAME, 'data-grid');
      await openChartsTab(first.page);
      await expect(first.page.getByTestId('chart-list-empty')).toBeVisible();

      // 1. Wizard: table → mapping → columns → preview → create.
      await first.page.getByTestId('chart-new').click();
      const dialog = first.page.getByRole('dialog', { name: '新建图表' });
      await expect(dialog).toBeVisible();
      await first.page.getByTestId('chart-new-name').fill('Wide chart');
      await expect(first.page.getByTestId('chart-new-table')).toHaveValue('tbl_chart');
      await expect(first.page.getByTestId('chart-new-y-col_a')).toBeChecked();
      await first.page.getByTestId('chart-new-y-col_b').check();
      await expect(first.page.getByTestId('chart-new-canvas')).toBeVisible();
      const previewPath = testInfo.outputPath('t4.4-new-chart.png');
      await dialog.screenshot({ path: previewPath });
      await testInfo.attach('t4.4-new-chart', { path: previewPath, contentType: 'image/png' });
      await first.page.getByTestId('chart-new-create').click();
      await expect(dialog).toBeHidden();

      const chartView = first.page.getByTestId('chart-view');
      await expect(chartView).toHaveAttribute('data-chart-state', 'ready');
      await expect(chartView).toHaveAttribute('data-chart-kind', 'line');
      await expect(chartView).toHaveAttribute('data-chart-layout', 'wide');
      await expect(chartView).toHaveAttribute('data-chart-series-count', '2');
      await expect(chartView).toHaveAttribute('data-chart-series', 'Sensor A|Sensor B');
      await expect(chartView).toHaveAttribute('data-chart-source-points', '12');
      await expect(chartView).toHaveAttribute('data-chart-sampled', 'false');
      await expect(first.page.getByTestId('chart-canvas').locator('canvas')).toBeVisible();
      await expect(
        first.page.getByTestId('inspector').getByRole('tab', { name: '数据' }),
      ).toBeVisible();

      const created = readManifest(root).charts[0];
      expect(created?.mapping).toEqual({
        layout: 'wide',
        xColumnId: COLUMN_IDS.time,
        yColumnIds: [COLUMN_IDS.sensorA, COLUMN_IDS.sensorB],
      });
      expect(readManifest(root).views.some((view) => view.kind === 'chart')).toBe(true);

      // 2. Map to the long layout: one series per Site value.
      await first.page.getByTestId('inspector').getByRole('tab', { name: '映射' }).click();
      await first.page.getByTestId('chart-mapping-layout').selectOption('long');
      await expect(chartView).toHaveAttribute('data-chart-layout', 'long');
      await expect(chartView).toHaveAttribute('data-chart-series-count', '3');
      const longSeries = await chartView.getAttribute('data-chart-series');
      expect(longSeries?.split('|').sort()).toEqual(['east', 'north', 'west']);
      await expect(chartView).toHaveAttribute('data-chart-source-points', '6');

      // 3. Appearance group.
      await first.page.getByTestId('inspector').getByRole('tab', { name: '外观' }).click();
      await first.page.getByTestId('chart-palette').selectOption('colorblind');
      await first.page.getByTestId('chart-background').selectOption('dark');
      await first.page.getByTestId('chart-legend').selectOption('none');
      await first.page.getByTestId('chart-show-grid').uncheck();
      await first.page.getByTestId('chart-smooth').check();
      await first.page.getByTestId('chart-show-symbol').check();
      await first.page.getByTestId('chart-line-width').fill('4');
      await first.page.getByTestId('chart-line-width').blur();
      await expect(chartView).toHaveAttribute('data-chart-palette', '#0072b2');
      await expect(chartView).toHaveAttribute('data-chart-background', '#1e1e1e');
      await expect(chartView).toHaveAttribute('data-chart-legend', 'none');
      await expect(chartView).toHaveAttribute('data-chart-show-grid', 'false');
      await expect(chartView).toHaveAttribute('data-chart-smooth', 'true');
      await expect(chartView).toHaveAttribute('data-chart-show-symbol', 'true');
      await expect(chartView).toHaveAttribute('data-chart-line-width', '4');

      // 4. Axes group.
      await first.page.getByTestId('inspector').getByRole('tab', { name: '坐标轴' }).click();
      await first.page.getByTestId('chart-x-label').fill('Elapsed');
      await first.page.getByTestId('chart-x-label').blur();
      await first.page.getByTestId('chart-y-label').fill('Load');
      await first.page.getByTestId('chart-y-label').blur();
      await first.page.getByTestId('chart-number-digits').fill('1');
      await first.page.getByTestId('chart-number-digits').blur();
      await first.page.getByTestId('chart-y-start-at-zero').check();
      await expect(chartView).toHaveAttribute('data-chart-x-label', 'Elapsed');
      await expect(chartView).toHaveAttribute('data-chart-y-label', 'Load');
      await expect(chartView).toHaveAttribute('data-chart-number-digits', '1');
      await expect(chartView).toHaveAttribute('data-chart-y-start-at-zero', 'true');

      // 5. Data group: sort levels persist like every other inspector item.
      await first.page.getByTestId('inspector').getByRole('tab', { name: '数据' }).click();
      await first.page.getByTestId('chart-sort-add').selectOption(COLUMN_IDS.time);
      await expect(first.page.getByTestId('chart-sort-row-0')).toBeVisible();
      await first.page.getByTestId('chart-sort-direction-0').click();
      await expect
        .poll(() => readManifest(root).charts[0]?.sort)
        .toEqual([{ columnId: COLUMN_IDS.time, direction: 'desc' }]);

      await expect
        .poll(() => readManifest(root).charts[0]?.options)
        .toMatchObject({
          paletteId: 'colorblind',
          background: 'dark',
          legend: 'none',
          showGrid: false,
          smooth: true,
          showSymbol: true,
          lineWidth: 4,
          xLabel: 'Elapsed',
          yLabel: 'Load',
          numberDigits: 1,
          yStartAtZero: true,
        });
      await expect.poll(() => readManifest(root).charts[0]?.mapping.layout).toBe('long');

      for (const attribute of [
        'data-chart-kind',
        'data-chart-layout',
        'data-chart-series',
        'data-chart-source-points',
        'data-chart-palette',
        'data-chart-background',
        'data-chart-legend',
        'data-chart-show-grid',
        'data-chart-smooth',
        'data-chart-show-symbol',
        'data-chart-line-width',
        'data-chart-x-label',
        'data-chart-y-label',
        'data-chart-number-digits',
        'data-chart-y-start-at-zero',
      ]) {
        chartAttributes[attribute] = (await chartView.getAttribute(attribute)) ?? '';
      }
      await capture(testInfo, first.page, '[data-testid="chart-view"]', 't4.4-chart-view');
      await testInfo.attach('t4.4-chart-contract', {
        body: JSON.stringify(chartAttributes, null, 2),
        contentType: 'application/json',
      });
    } finally {
      await first.electronApp.close();
    }

    // 6. Restart with the same userData: the chart and every inspector item survive.
    const second = await launchCurveApp({
      userDataDir,
      importFile: join(userDataDir, 'unused.json'),
    });
    try {
      await expect(second.page.getByTestId('welcome')).toBeVisible();
      await second.page
        .getByTestId('recent-workspace')
        .filter({ hasText: SEED_NAME })
        .first()
        .click();
      const view = second.page.getByTestId('chart-view');
      await expect(view).toHaveAttribute('data-chart-state', 'ready');
      await expect(view).toHaveAttribute('data-chart-layout', 'long');
      for (const [attribute, value] of Object.entries(chartAttributes)) {
        expect(await view.getAttribute(attribute), attribute).toBe(value);
      }
      await expect(second.page.getByTestId('chart-canvas').locator('canvas')).toBeVisible();
      await expect(
        second.page.getByTestId('inspector').getByRole('tab', { name: '外观' }),
      ).toBeVisible();
    } finally {
      await second.electronApp.close();
    }
  });

  test('deletes a mapped column, shows an actionable error and remaps the chart', async ({
    page,
  }, testInfo) => {
    const parent = testInfo.outputPath('charts-delete');
    const root = join(parent, 'Chart Delete.cstudio');
    expect(
      await seedWorkspace(page, {
        dir: parent,
        name: 'Chart Delete',
        withNote: true,
        chart: {
          id: 'cht_delete',
          viewId: 'viw_chart_delete',
          title: 'Note chart',
          mapping: {
            layout: 'wide',
            xColumnId: COLUMN_IDS.note,
            yColumnIds: [COLUMN_IDS.sensorA],
          },
        },
      }),
    ).toBe(root);
    await openRecentWorkspace(page, 'Chart Delete', 'chart-view');

    const chartView = page.getByTestId('chart-view');
    await expect(chartView).toHaveAttribute('data-chart-state', 'ready');
    await expect(chartView).toHaveAttribute('data-chart-x-type', 'category');

    // Delete the mapped X column from the table view's column manager.
    await page.getByRole('tab', { name: 'Readings' }).click();
    await expect(page.getByTestId('data-grid')).toBeVisible();
    await page.getByRole('button', { name: '编辑列 Note' }).click();
    await page.getByRole('dialog', { name: '编辑列' }).getByTestId('column-form-delete').click();
    const confirm = page.getByRole('dialog', { name: '删除列“Note”？' });
    await expect(confirm).toContainText('将失效图表：1');
    await confirm.getByTestId('column-change-confirm').click();
    await expect.poll(() => readManifest(root).tables[0]?.columns.length).toBe(5);

    // The chart view is now an actionable error state.
    await page.getByRole('tab', { name: 'Note chart' }).click();
    await expect(chartView).toHaveAttribute('data-chart-state', 'missing-columns');
    await expect(page.getByTestId('chart-error')).toContainText('列已删除：col_note');
    await expect(page.getByTestId('chart-remap')).toBeVisible();
    await capture(testInfo, page, '[data-testid="chart-view"]', 't4.4-chart-error');

    // Remap the X axis to a real column; the chart recovers and persists.
    await page.getByTestId('chart-remap-x').selectOption(COLUMN_IDS.time);
    await expect(chartView).toHaveAttribute('data-chart-state', 'ready');
    await expect(chartView).toHaveAttribute('data-chart-series-count', '1');
    await expect
      .poll(() => readManifest(root).charts[0]?.mapping)
      .toEqual({
        layout: 'wide',
        xColumnId: COLUMN_IDS.time,
        yColumnIds: [COLUMN_IDS.sensorA],
      });

    await openRecentWorkspace(page, 'Chart Delete', 'chart-view');
    await expect(page.getByTestId('chart-view')).toHaveAttribute('data-chart-state', 'ready');
    await expect(page.getByTestId('chart-canvas').locator('canvas')).toBeVisible();
  });

  test('duplicates a chart with a fresh id and independent settings', async ({
    page,
  }, testInfo) => {
    const parent = testInfo.outputPath('charts-copy');
    const root = join(parent, 'Chart Copy.cstudio');
    await seedWorkspace(page, {
      dir: parent,
      name: 'Chart Copy',
      withNote: false,
      chart: {
        id: 'cht_source',
        viewId: 'viw_chart_source',
        title: 'Readings chart',
        mapping: {
          layout: 'wide',
          xColumnId: COLUMN_IDS.time,
          yColumnIds: [COLUMN_IDS.sensorA],
        },
      },
    });
    await openRecentWorkspace(page, 'Chart Copy', 'chart-view');
    await openChartsTab(page);

    await page.getByTestId('chart-copy-cht_source').click();
    await expect.poll(() => readManifest(root).charts.length).toBe(2);
    const copy = readManifest(root).charts.find((chart) => chart.id !== 'cht_source');
    expect(copy).toBeDefined();
    if (copy === undefined) {
      return;
    }
    expect(copy.id).toMatch(/^cht_/);
    expect(copy.title).toBe('Readings chart (2)');
    expect(copy.mapping).toEqual({
      layout: 'wide',
      xColumnId: COLUMN_IDS.time,
      yColumnIds: [COLUMN_IDS.sensorA],
    });
    const copyView = readManifest(root).views.find(
      (view) => view.kind === 'chart' && view.refId === copy.id,
    );
    expect(copyView?.id).toMatch(/^viw_/);
    expect(copyView?.id).not.toBe('viw_chart_source');
    await expect(page.getByTestId(`chart-row-${copy.id}`)).toHaveAttribute('data-active', 'true');

    // Change the copy; the source keeps its own definition.
    await page.getByTestId('inspector').getByRole('tab', { name: '外观' }).click();
    await page.getByTestId('chart-palette').selectOption('vivid');
    await expect
      .poll(
        () => readManifest(root).charts.find((chart) => chart.id === copy.id)?.options.paletteId,
      )
      .toBe('vivid');
    const source = readManifest(root).charts.find((chart) => chart.id === 'cht_source');
    expect(source?.options.paletteId).toBe('default');
    expect(source?.title).toBe('Readings chart');

    await openChartsTab(page);
    await page.getByTestId('chart-row-cht_source').getByRole('button').first().click();
    await expect(page.getByTestId('chart-view')).toHaveAttribute('data-chart-palette', '#2563eb');
  });

  test('opens the wizard and the chart inspector with the keyboard at 200% zoom', async ({
    page,
    electronApp,
  }, testInfo) => {
    const parent = testInfo.outputPath('charts-zoom');
    const root = join(parent, 'Chart Zoom.cstudio');
    await seedWorkspace(page, {
      dir: parent,
      name: 'Chart Zoom',
      withNote: false,
      chart: {
        id: 'cht_zoom',
        viewId: 'viw_chart_zoom',
        title: 'Zoom chart',
        mapping: {
          layout: 'wide',
          xColumnId: COLUMN_IDS.time,
          yColumnIds: [COLUMN_IDS.sensorA, COLUMN_IDS.sensorB],
        },
      },
    });
    await openRecentWorkspace(page, 'Chart Zoom', 'chart-view');
    await openChartsTab(page);
    const setZoom = async (factor: number): Promise<void> => {
      await electronApp.evaluate(({ BrowserWindow }, value) => {
        const [window] = BrowserWindow.getAllWindows();
        window?.webContents.setZoomFactor(value);
      }, factor);
      await page.waitForFunction(
        (expected) => (expected >= 2 ? window.innerWidth < 800 : window.innerWidth >= 800),
        factor,
      );
    };
    await setZoom(2);

    // Enter opens the wizard from the focused list button.
    await page.getByTestId('chart-new').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: '新建图表' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(box).not.toBeNull();
    if (box !== null) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await capture(testInfo, page, '[role="dialog"]', 't4.4-wizard-zoom');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // The chart inspector tabs are keyboard operable (roving tabindex).
    const inspector = page.getByTestId('inspector');
    await inspector.getByRole('tab', { name: '数据' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(inspector.getByRole('tab', { name: '映射' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('End');
    const lastTab = inspector.getByRole('tab', { name: '坐标轴' });
    await expect(lastTab).toHaveAttribute('aria-selected', 'true');
    await expect(lastTab).toBeFocused();
    await setZoom(1);
    expect(readManifest(root).charts[0]?.id).toBe('cht_zoom');
  });
});
