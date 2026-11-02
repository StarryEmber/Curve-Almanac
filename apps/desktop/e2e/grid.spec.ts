import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';
import { zoomToNarrowLayout } from './workspace-seed';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Page, TestInfo } from '@playwright/test';

/**
 * T2.1 — welcome page, table management and the virtualised data grid.
 *
 * Data-heavy grid scenarios seed a real workspace through `window.api` and then
 * reload the window, which exercises the same IPC + Worker open path the UI
 * uses without requiring an editor (cell editing is T2.2).
 */

const SEED_NAME = 'Grid Demo';
const SEED_ROW_COUNT = 50;
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

interface AxeResults {
  violations: { id: string; impact: string | null }[];
}

/**
 * Electron's browser context cannot open the helper page that
 * `@axe-core/playwright` needs, so the audit injects `axe-core` into the app
 * page itself. `page.evaluate` is not subject to the app CSP.
 */
async function auditGrid(page: Page): Promise<AxeResults> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run(
            context: Element,
            options: unknown,
          ): Promise<{ violations: { id: string; impact: string | null }[] }>;
        };
      }
    ).axe;
    const grid = document.querySelector('[data-testid="data-grid"]');
    if (grid === null) {
      throw new Error('The data grid is not mounted.');
    }
    return axe.run(grid, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
  });
}

function seedRows(count: number): string {
  const lines: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    lines.push(
      JSON.stringify({
        id: `row_${String(index).padStart(6, '0')}`,
        v: [
          `sensor-${String(index)}`,
          1_767_225_600_000 + index * 60_000,
          Math.round((20 + (index % 50) / 10) * 10) / 10,
        ],
      }),
    );
  }
  return `${lines.join('\n')}\n`;
}

interface SeededWorkspace {
  root: string;
  workspaceId: string;
  tableId: string;
}

async function seedWorkspace(
  page: Page,
  testInfo: TestInfo,
  rowCount: number,
): Promise<SeededWorkspace> {
  const parent = testInfo.outputPath(`seed-parent-${String(rowCount)}`);
  const jsonl = seedRows(rowCount);
  const result = await page.evaluate(
    async ({ dir, name, rows }) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir, name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      // Rebuild the document in the page so the table/view identifiers exist
      // before the manifest is validated by the main process.
      const timestamp = manifest.createdAt;
      const tableId = 'tbl_e2e';
      const viewId = 'viw_e2e';
      const columnIds = ['col_e2e_id', 'col_e2e_time', 'col_e2e_value'] as const;
      const columns: WorkspaceManifest['tables'][number]['columns'] = [
        {
          id: columnIds[0],
          key: 'id',
          label: 'ID',
          type: 'text',
          role: 'none',
          required: true,
        },
        { id: columnIds[1], key: 'time', label: 'Time', type: 'date', role: 'x' },
        {
          id: columnIds[2],
          key: 'sensor_a',
          label: 'Sensor A',
          type: 'number',
          role: 'y',
          unit: '°C',
          precision: 1,
        },
      ];
      const views: WorkspaceManifest['views'] = [
        {
          id: viewId,
          kind: 'table',
          refId: tableId,
          title: 'Readings',
          tableView: {
            tableId,
            styleId: 'builtin.report-light',
            columnOrder: [...columnIds],
            widths: {},
            hiddenColumnIds: [],
            sort: [],
            frozenColumnCount: 1,
          },
        },
      ];
      const layout: WorkspaceManifest['layout'] = {
        type: 'pane',
        viewIds: [viewId],
        activeViewId: viewId,
      };
      const next = {
        ...manifest,
        updatedAt: timestamp,
        tables: [
          {
            id: tableId,
            name: 'Readings',
            file: `tables/${tableId}.jsonl`,
            schemaVersion: 1,
            columns,
            primaryKey: columnIds[0],
            rowCount: rows,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views,
        layout,
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const rowsJsonl = documentJsonl(rows);
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId,
        jsonl: rowsJsonl,
      });
      if (!tableWrite.ok) {
        throw new Error(`table write failed: ${tableWrite.error.code}`);
      }
      const closed = await api.workspace.close({ workspaceId: manifest.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
      return { workspaceId: manifest.id, tableId, name };

      function documentJsonl(count: number): string {
        const lines: string[] = [];
        for (let index = 1; index <= count; index += 1) {
          lines.push(
            JSON.stringify({
              id: `row_${String(index).padStart(6, '0')}`,
              v: [
                `sensor-${String(index)}`,
                1_767_225_600_000 + index * 60_000,
                Math.round((20 + (index % 50) / 10) * 10) / 10,
              ],
            }),
          );
        }
        return `${lines.join('\n')}\n`;
      }
    },
    { dir: parent, name: SEED_NAME, rows: rowCount },
  );

  const root = join(parent, `${SEED_NAME}.cstudio`);
  // The page built the same JSONL; assert the disk bytes so a failed write does
  // not silently turn into a "passes with 0 rows" test.
  expect(readFileSync(join(root, 'tables', 'tbl_e2e.jsonl'), 'utf8')).toBe(jsonl);
  return { root, workspaceId: result.workspaceId, tableId: result.tableId };
}

async function openSeededWorkspace(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: SEED_NAME }).first().click();
  await expect(page.getByTestId('workspace-view')).toBeVisible();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

test.describe('T2.1 welcome and table management', () => {
  test('creates a workspace, then creates, renames and deletes a table to .trash', async ({
    page,
  }, testInfo) => {
    const parent = testInfo.outputPath('ui-parent');
    const root = join(parent, 'T2 Demo.cstudio');

    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByRole('button', { name: '新建工作区' }).click();
    const dialog = page.getByRole('dialog', { name: '新建工作区' });
    await dialog.getByLabel('名称').fill('T2 Demo');
    await dialog.getByLabel('保存位置').fill(parent);
    await dialog.getByRole('button', { name: '创建工作区' }).click();

    await expect(page.getByTestId('workspace-view')).toBeVisible();
    await expect(page.getByTestId('workspace-label')).toHaveText('T2 Demo');
    await expect(page.getByTestId('table-list')).toContainText('还没有数据表');

    await page.getByRole('button', { name: '新建表' }).click();
    const tableDialog = page.getByRole('dialog', { name: '新建数据表' });
    await tableDialog.getByLabel('表名').fill('Sensors');
    await tableDialog.getByRole('button', { name: '创建表' }).click();

    await expect(page.getByRole('tab', { name: 'Sensors' })).toBeVisible();
    await expect(page.getByTestId('data-grid')).toBeVisible();
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '1');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-colcount', '1');

    const manifest = readManifest(root);
    const tableId = manifest.tables[0]?.id;
    expect(tableId).toBeDefined();
    await expect.poll(() => readManifest(root).tables[0]?.rowCount).toBe(0);

    // A brand-new table has no data file (ADR-027); write one row so the delete
    // flow really exercises the `.trash` move.
    if (tableId !== undefined) {
      await page.evaluate(
        async ({ workspaceId, id }) => {
          const api = (globalThis as unknown as { api: CurveApi }).api;
          const written = await api.table.write({
            workspaceId,
            tableId: id,
            jsonl: '{"id":"row_1","v":["a"]}\n',
          });
          if (!written.ok) {
            throw new Error(`table write failed: ${written.error.code}`);
          }
        },
        { workspaceId: manifest.id, id: tableId },
      );
    }

    await page.getByRole('button', { name: '重命名 Sensors' }).click();
    const renameDialog = page.getByRole('dialog', { name: '重命名数据表' });
    await renameDialog.getByLabel('表名').fill('Readings');
    await renameDialog.getByRole('button', { name: '保存名称' }).click();
    await expect(page.getByRole('tab', { name: 'Readings' })).toBeVisible();
    await expect.poll(() => readManifest(root).tables[0]?.name).toBe('Readings');

    // Opening the same table twice activates the existing tab.
    await page
      .getByTestId('table-list')
      .getByRole('button', { name: /Readings/ })
      .first()
      .click();
    await page
      .getByTestId('table-list')
      .getByRole('button', { name: /Readings/ })
      .first()
      .click();
    await expect(page.getByRole('tab', { name: 'Readings' })).toHaveCount(1);

    // Ctrl+W closes the active tab and leaves the empty workspace state.
    await page.keyboard.press('Control+w');
    await expect(page.locator('.cs-tabbar').getByRole('tab', { name: 'Readings' })).toHaveCount(0);
    await expect(page.getByTestId('workspace-empty')).toBeVisible();

    // Reopen from the sidebar, then delete the table.
    await page
      .getByTestId('table-list')
      .getByRole('button', { name: /Readings/ })
      .first()
      .click();
    await expect(page.getByRole('tab', { name: 'Readings' })).toBeVisible();
    await page.getByRole('button', { name: '删除 Readings' }).click();
    const deleteDialog = page.getByRole('dialog', { name: '删除数据表' });
    await expect(deleteDialog).toContainText('表文件会移到 .trash');
    await deleteDialog.getByRole('button', { name: '删除表' }).click();

    await expect(page.getByTestId('table-list')).toContainText('还没有数据表');
    await expect(page.locator('.cs-tabbar').getByRole('tab')).toHaveCount(0);
    await expect
      .poll(() =>
        readdirSync(join(root, '.trash')).some((name) => name.startsWith(`${tableId ?? ''}.`)),
      )
      .toBe(true);

    // Closing the workspace returns to the welcome page; the recent entry
    // reopens the same (now empty) workspace.
    await page.getByRole('button', { name: '关闭工作区' }).click();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('recent-workspace').filter({ hasText: 'T2 Demo' }).first().click();
    await expect(page.getByTestId('workspace-view')).toBeVisible();
    await expect(page.getByTestId('table-list')).toContainText('还没有数据表');
  });

  test('uses the picker stub, reports an invalid open and opens a workspace by path', async ({
    page,
    userDataDir,
  }, testInfo) => {
    const pickedParent = testInfo.outputPath('picked-parent');
    const created = await page.evaluate(
      async ({ dir, name }) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.create({ dir, name }),
      { dir: pickedParent, name: 'Picked' },
    );
    expect(created.ok).toBe(true);
    if (created.ok) {
      await page.evaluate(
        (workspaceId) =>
          (globalThis as unknown as { api: CurveApi }).api.workspace.close({ workspaceId }),
        created.data.id,
      );
    }

    await page.getByRole('button', { name: '新建工作区' }).click();
    const newDialog = page.getByRole('dialog', { name: '新建工作区' });
    await newDialog.getByRole('button', { name: '选择文件夹…' }).click();
    await expect(newDialog.getByLabel('保存位置')).toHaveValue(
      join(userDataDir, 'dialog-directory'),
    );
    await newDialog.getByRole('button', { name: '取消' }).click();

    // The picker returns an empty directory, so opening it must fail with the
    // typed workspace error rather than crashing; the dialog stays open so the
    // user can correct the path.
    await page.getByRole('button', { name: '打开工作区' }).click();
    const openDialog = page.getByRole('dialog', { name: '打开工作区' });
    await openDialog.getByRole('button', { name: '选择文件夹…' }).click();
    await expect(openDialog.getByLabel('工作区文件夹')).toHaveValue(
      join(userDataDir, 'dialog-directory'),
    );
    await openDialog.getByRole('button', { name: '打开工作区' }).click();
    await expect(page.getByRole('alert').first()).toContainText('E_WS_NOT_FOUND');

    await openDialog.getByLabel('工作区文件夹').fill(join(pickedParent, 'Picked.cstudio'));
    await openDialog.getByRole('button', { name: '打开工作区' }).click();
    await expect(page.getByTestId('workspace-view')).toBeVisible();
    await expect(page.getByTestId('workspace-label')).toHaveText('Picked');

    // The opened workspace can create a table and enter the grid through the
    // same IPC path the welcome page uses.
    await page.getByRole('button', { name: '新建表' }).click();
    const tableDialog = page.getByRole('dialog', { name: '新建数据表' });
    await tableDialog.getByLabel('表名').fill('Picked Table');
    await tableDialog.getByRole('button', { name: '创建表' }).click();
    await expect(page.getByTestId('data-grid')).toBeVisible();
  });

  test('lists cascade counts before deleting a referenced table', async ({ page }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, SEED_ROW_COUNT);
    const manifest = readManifest(seeded.root);
    const tableView = manifest.views[0];
    expect(tableView).toBeDefined();
    if (tableView === undefined) {
      return;
    }

    // Add a chart + chart view through IPC so the delete dialog has references
    // to report. T2.1 has no chart UI yet.
    const added = await page.evaluate(
      async ({ dir, base }) => {
        const api = (globalThis as unknown as { api: CurveApi }).api;
        const opened = await api.workspace.open({ dir });
        if (!opened.ok) {
          throw new Error(`open failed: ${opened.error.code}`);
        }
        const timestamp = base.createdAt;
        const chartId = 'cht_e2e';
        const chartViewId = 'viw_chart_e2e';
        const chart: WorkspaceManifest['charts'][number] = {
          id: chartId,
          title: 'Readings chart',
          kind: 'line',
          tableId: 'tbl_e2e',
          mapping: {
            layout: 'wide',
            xColumnId: 'col_e2e_time',
            yColumnIds: ['col_e2e_value'],
          },
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
            numberDigits: 1,
            sampling: { enabled: true, threshold: 5000, target: 2000 },
          },
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const chartView: WorkspaceManifest['views'][number] = {
          id: chartViewId,
          kind: 'chart',
          refId: chartId,
          title: 'Readings chart',
        };
        const next: WorkspaceManifest = {
          ...base,
          charts: [chart],
          views: [...base.views, chartView],
          layout: {
            type: 'pane',
            viewIds: [...(base.layout.type === 'pane' ? base.layout.viewIds : []), chartViewId],
            activeViewId: base.views[0]?.id ?? null,
          },
        };
        const written = await api.manifest.write({
          workspaceId: opened.data.manifest.id,
          manifest: next,
        });
        if (!written.ok) {
          throw new Error(`manifest write failed: ${written.error.code}`);
        }
        await api.workspace.close({ workspaceId: opened.data.manifest.id });
      },
      { dir: seeded.root, base: manifest },
    );
    expect(added).toBeUndefined();

    await openSeededWorkspace(page);
    await expect(page.locator('.cs-tabbar').getByRole('tab')).toHaveCount(2);

    await page.getByRole('button', { name: '删除 Readings' }).click();
    const deleteDialog = page.getByRole('dialog', { name: '删除数据表' });
    await expect(deleteDialog).toContainText('同时会删除 2 个视图、1 个图表');
    await deleteDialog.getByRole('button', { name: '删除表' }).click();
    await expect(page.getByTestId('table-list')).toContainText('还没有数据表');
    await expect(page.locator('.cs-tabbar').getByRole('tab')).toHaveCount(0);

    await expect.poll(() => readManifest(seeded.root).tables).toEqual([]);
    await expect.poll(() => readManifest(seeded.root).views).toEqual([]);
    await expect.poll(() => readManifest(seeded.root).charts).toEqual([]);
  });
});

test.describe('T2.1 data grid', () => {
  test('renders 50 rows with grid semantics, keyboard navigation and rectangular selection', async ({
    page,
  }, testInfo) => {
    await seedWorkspace(page, testInfo, SEED_ROW_COUNT);
    await openSeededWorkspace(page);

    const grid = page.getByRole('grid');
    await expect(grid).toHaveAttribute('aria-rowcount', String(SEED_ROW_COUNT + 1));
    await expect(grid).toHaveAttribute('aria-colcount', '3');
    await expect(page.getByRole('columnheader')).toHaveCount(3);

    await page.getByTestId('grid-cell-0-0').click();
    const active = page.locator('[data-active="true"]');
    await expect(active).toHaveAttribute('data-row', '0');
    await expect(active).toHaveAttribute('data-col', '0');

    await page.keyboard.press('ArrowRight');
    await expect(active).toHaveAttribute('data-col', '1');
    await page.keyboard.press('ArrowDown');
    await expect(active).toHaveAttribute('data-row', '1');
    await page.keyboard.press('End');
    await expect(active).toHaveAttribute('data-col', '2');
    await page.keyboard.press('Home');
    await expect(active).toHaveAttribute('data-col', '0');
    await page.keyboard.press('PageDown');
    await expect(active).not.toHaveAttribute('data-row', '1');
    await page.keyboard.press('Control+End');
    await expect(active).toHaveAttribute('data-row', String(SEED_ROW_COUNT - 1));
    await expect(active).toHaveAttribute('data-col', '2');
    await page.keyboard.press('Tab');
    await expect(active).toHaveAttribute('data-row', '0');
    await expect(active).toHaveAttribute('data-col', '0');

    // Shift+arrows form a rectangle; the status line reports its size.
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const selection = page.locator('.cs-grid__selection');
    await expect(selection).toHaveAttribute('data-selected-rows', '2');
    await expect(selection).toHaveAttribute('data-selected-columns', '2');

    const accessibility = await auditGrid(page);
    expect(accessibility.violations.filter((violation) => violation.impact === 'critical')).toEqual(
      [],
    );
  });

  test('surfaces open warnings and lets the user dismiss them', async ({ page }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, 5);
    writeFileSync(
      join(seeded.root, '.lock'),
      `${JSON.stringify({
        pid: 999_999,
        startedAt: '2020-01-01T00:00:00.000Z',
        appVersion: '0.1.0',
      })}\n`,
    );

    await page.reload();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('recent-workspace').filter({ hasText: SEED_NAME }).first().click();
    // T5.3: an unclean exit now asks before opening (SPEC §7.5).
    const recovery = page.getByRole('dialog', { name: '上次未正常退出' });
    await expect(recovery).toBeVisible();
    await recovery.getByRole('button', { name: '尝试恢复' }).click();
    await expect(page.getByTestId('workspace-view')).toBeVisible();
    const warnings = page.locator('.cs-warnings');
    await expect(warnings).toContainText('stale lock');
    await warnings.getByRole('button', { name: '隐藏提示' }).click();
    await expect(warnings).toHaveCount(0);
  });

  test('persists column drag and double-click autofit across a reload', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, SEED_ROW_COUNT);
    await openSeededWorkspace(page);

    const header = page.locator('[role="columnheader"][data-column-id="col_e2e_time"]');
    const resizer = header.getByRole('separator');
    const box = await resizer.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) {
      return;
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(() => readManifest(seeded.root).views[0]?.tableView?.widths['col_e2e_time'])
      .toBeGreaterThan(160);

    const draggedWidth = readManifest(seeded.root).views[0]?.tableView?.widths['col_e2e_time'] ?? 0;

    await resizer.dblclick();
    await expect
      .poll(() => readManifest(seeded.root).views[0]?.tableView?.widths['col_e2e_time'])
      .not.toBe(draggedWidth);

    await openSeededWorkspace(page);
    const reloadedHeader = page.locator('[role="columnheader"][data-column-id="col_e2e_time"]');
    const persisted = readManifest(seeded.root).views[0]?.tableView?.widths['col_e2e_time'] ?? 0;
    const width = await reloadedHeader.evaluate((element) => getComputedStyle(element).width);
    expect(Math.round(Number.parseFloat(width))).toBe(persisted);
    await expect(reloadedHeader).toBeVisible();
  });

  test('stays usable at 200% zoom', async ({ page, electronApp }, testInfo) => {
    await seedWorkspace(page, testInfo, SEED_ROW_COUNT);
    await openSeededWorkspace(page);

    await zoomToNarrowLayout(electronApp, page);

    await expect(page.getByRole('grid')).toBeVisible();
    await expect(page.getByTestId('grid-cell-0-0')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow).toBe(true);

    // The grid still moves with the keyboard after zooming.
    await page.getByTestId('grid-cell-0-0').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-active="true"]')).toHaveAttribute('data-col', '1');
  });

  test('opens 100k rows within the first-frame budget and scrolls at 55fps', async ({
    page,
  }, testInfo) => {
    await seedWorkspace(page, testInfo, 100_000);
    await page.reload();
    await expect(page.getByTestId('welcome')).toBeVisible();

    const started = Date.now();
    await page.getByTestId('recent-workspace').filter({ hasText: SEED_NAME }).first().click();
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '100001');
    await expect(page.getByTestId('grid-cell-0-0')).toBeVisible();
    const elapsed = Date.now() - started;

    // SPEC §16.1: opening 100k rows must not exceed the 1s first-frame budget.
    // The measured value is recorded in the T2.1 report even when it passes.
    expect(elapsed, `100k first frame took ${String(elapsed)}ms`).toBeLessThan(1000);

    const fps = await page.evaluate(async () => {
      const scroller = document.querySelector('[data-testid="grid-scroll"]');
      if (!(scroller instanceof HTMLElement)) {
        throw new Error('grid scroller is missing');
      }
      let frames = 0;
      let running = true;
      const start = performance.now();
      const tick = (): void => {
        frames += 1;
        if (running) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
      const end = start + 1_200;
      while (performance.now() < end) {
        scroller.scrollTop += 60;
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      running = false;
      return frames / ((performance.now() - start) / 1000);
    });
    await testInfo.attach('t21-perf.txt', {
      body: `firstFrameMs=${String(elapsed)}\nscrollFps=${fps.toFixed(1)}\n`,
      contentType: 'text/plain',
    });
    expect(fps, `100k scroll measured ${fps.toFixed(1)}fps`).toBeGreaterThanOrEqual(55);
  });
});
