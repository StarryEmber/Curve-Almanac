import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

/**
 * T2.6 — filters, three-level sorting, view state persistence, multi-view,
 * hidden columns, paste-on-visible-rows and the 100k query budget.
 */

type Column = WorkspaceManifest['tables'][number]['columns'][number];
type TableView = NonNullable<WorkspaceManifest['views'][number]['tableView']>;
type Filter = NonNullable<TableView['filter']>;
type Cell = string | number | boolean | null;

interface SeedSpec {
  name: string;
  tableId: string;
  viewId: string;
  tableName: string;
  columns: Column[];
  primaryKey: string;
  rowsJsonl: string;
  filter?: Filter;
}

interface SeededWorkspace {
  root: string;
  jsonlPath: string;
  manifestPath: string;
}

async function seedWorkspace(
  page: Page,
  testInfo: TestInfo,
  spec: SeedSpec,
): Promise<SeededWorkspace> {
  const parent = testInfo.outputPath(`filter-parent-${spec.tableId}`);
  await page.evaluate(
    async (seed) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir: seed.parent, name: seed.name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      const timestamp = manifest.createdAt;
      const rowCount = seed.rowsJsonl.split('\n').filter((line) => line.trim() !== '').length;
      const tableView = {
        tableId: seed.tableId,
        styleId: 'builtin.report-light',
        columnOrder: seed.columns.map((column) => column.id),
        widths: {},
        hiddenColumnIds: [],
        sort: [],
        ...(seed.filter === undefined ? {} : { filter: seed.filter }),
        frozenColumnCount: 1,
      };
      const next: WorkspaceManifest = {
        ...manifest,
        updatedAt: timestamp,
        tables: [
          {
            id: seed.tableId,
            name: seed.tableName,
            file: `tables/${seed.tableId}.jsonl`,
            schemaVersion: 1,
            columns: seed.columns,
            primaryKey: seed.primaryKey,
            rowCount,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views: [
          {
            id: seed.viewId,
            kind: 'table',
            refId: seed.tableId,
            title: seed.tableName,
            tableView,
          },
        ],
        layout: { type: 'pane', viewIds: [seed.viewId], activeViewId: seed.viewId },
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId: seed.tableId,
        jsonl: seed.rowsJsonl,
      });
      if (!tableWrite.ok) {
        throw new Error(`table write failed: ${tableWrite.error.code}`);
      }
      const closed = await api.workspace.close({ workspaceId: manifest.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
    },
    {
      parent,
      name: spec.name,
      tableId: spec.tableId,
      viewId: spec.viewId,
      tableName: spec.tableName,
      columns: spec.columns,
      primaryKey: spec.primaryKey,
      rowsJsonl: spec.rowsJsonl,
      ...(spec.filter === undefined ? {} : { filter: spec.filter }),
    },
  );

  const root = join(parent, `${spec.name}.cstudio`);
  return {
    root,
    jsonlPath: join(root, 'tables', `${spec.tableId}.jsonl`),
    manifestPath: join(root, 'manifest.json'),
  };
}

function jsonlRows(rows: readonly Cell[][]): string {
  return `${rows
    .map((values, index) => JSON.stringify({ id: `row_${String(index + 1)}`, v: values }))
    .join('\n')}\n`;
}

function column(overrides: Partial<Column> & Pick<Column, 'id' | 'key' | 'type'>): Column {
  return { label: overrides.key, role: 'none', ...overrides };
}

const ID_COLUMN = column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true });

function fullColumns(): Column[] {
  return [
    ID_COLUMN,
    column({ id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'label' }),
    column({ id: 'col_score', key: 'score', label: 'Score', type: 'number', role: 'y' }),
    column({ id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'x' }),
    column({ id: 'col_active', key: 'active', label: 'Active', type: 'boolean' }),
    column({ id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' }),
  ];
}

const DAY_MS = 86_400_000;

function fullRows(count: number): Cell[][] {
  return Array.from({ length: count }, (_value, index) => [
    `r${String(index + 1)}`,
    `Name ${String(index + 1)}`,
    index,
    1_767_225_600_000 + index * DAY_MS,
    index % 2 === 0,
    `site-${String(index % 5)}`,
  ]);
}

function perfColumns(): Column[] {
  return [
    ID_COLUMN,
    column({ id: 'col_score', key: 'score', label: 'Score', type: 'number', role: 'y' }),
    column({ id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' }),
  ];
}

function perfRows(count: number): Cell[][] {
  return Array.from({ length: count }, (_value, index) => [
    `r${String(index + 1)}`,
    index,
    `site-${String(index % 7)}`,
  ]);
}

async function openSeededWorkspace(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function readManifest(path: string): WorkspaceManifest {
  return JSON.parse(read(path)) as WorkspaceManifest;
}

async function setZoom200(electronApp: ElectronApplication, page: Page): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(2);
  });
  await page.waitForFunction(() => window.innerWidth < 800);
}

const gridOf = (page: Page) => page.getByTestId('data-grid');

async function applyScoreFilter(page: Page, operator: 'gt' | 'lt', value: string): Promise<void> {
  await page.getByTestId('grid-filter-open').click();
  const dialog = page.getByRole('dialog', { name: '筛选条件' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('列', { exact: true }).first().selectOption('col_score');
  await dialog.getByLabel('操作符', { exact: true }).first().selectOption(operator);
  await dialog.getByLabel('值', { exact: true }).first().fill(value);
  await dialog.getByRole('button', { name: '应用筛选' }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe('filters, sorting and view state', () => {
  test('filters and applies three sort levels in view order', async ({ page }, testInfo) => {
    await seedWorkspace(page, testInfo, {
      name: 'Filter Sort',
      tableId: 'tbl_filter_sort',
      viewId: 'viw_filter_sort',
      tableName: 'Readings',
      columns: fullColumns(),
      primaryKey: 'col_id',
      rowsJsonl: jsonlRows(fullRows(2_000)),
    });
    await openSeededWorkspace(page, 'Filter Sort');
    const grid = gridOf(page);
    await expect(grid).toHaveAttribute('data-visible-rows', '2000');

    await applyScoreFilter(page, 'gt', '1000');
    await expect(grid).toHaveAttribute('data-visible-rows', '999');
    await expect(grid).toHaveAttribute('data-query-mode', 'sync');
    await expect(page.getByTestId('grid-filter-open')).toContainText('1 个条件');

    const scoreHeader = page.locator('[role="columnheader"][data-column-id="col_score"]');
    await scoreHeader.getByRole('button').click();
    await expect(scoreHeader).toHaveAttribute('aria-sort', 'ascending');
    await scoreHeader.getByRole('button').click();
    await expect(scoreHeader).toHaveAttribute('aria-sort', 'descending');

    const idHeader = page.locator('[role="columnheader"][data-column-id="col_id"]');
    await idHeader.getByRole('button').click({ modifiers: ['Shift'] });
    await expect(idHeader).toHaveAttribute('aria-sort', 'ascending');
    await expect(scoreHeader).toHaveAttribute('aria-sort', 'descending');
  });

  test('persists filter and sort across a reload and clears the filter', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Filter Reload',
      tableId: 'tbl_filter_reload',
      viewId: 'viw_filter_reload',
      tableName: 'Reload',
      columns: fullColumns(),
      primaryKey: 'col_id',
      rowsJsonl: jsonlRows(fullRows(100)),
    });
    await openSeededWorkspace(page, 'Filter Reload');
    await applyScoreFilter(page, 'gt', '50');
    await expect(gridOf(page)).toHaveAttribute('data-visible-rows', '49');

    const scoreHeader = page.locator('[role="columnheader"][data-column-id="col_score"]');
    await scoreHeader.getByRole('button').click();
    await scoreHeader.getByRole('button').click();
    await expect(scoreHeader).toHaveAttribute('aria-sort', 'descending');

    await expect
      .poll(() => readManifest(seeded.manifestPath).views[0]?.tableView?.filter)
      .toMatchObject({
        kind: 'all',
        children: [{ kind: 'compare', columnId: 'col_score', op: 'gt', value: 50 }],
      });
    await expect
      .poll(() => readManifest(seeded.manifestPath).views[0]?.tableView?.sort)
      .toEqual([{ columnId: 'col_score', direction: 'desc' }]);

    await page.reload();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('recent-workspace').filter({ hasText: 'Filter Reload' }).first().click();
    await expect(gridOf(page)).toHaveAttribute('data-visible-rows', '49');
    await expect(page.getByTestId('grid-filter-open')).toContainText('1 个条件');
    await expect(scoreHeader).toHaveAttribute('aria-sort', 'descending');

    await page.getByRole('button', { name: '清除筛选' }).click();
    await expect(gridOf(page)).toHaveAttribute('data-visible-rows', '100');
    await expect
      .poll(() => readManifest(seeded.manifestPath).views[0]?.tableView?.filter)
      .toBeUndefined();
  });

  test('keeps two views of the same table independent and restores both', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Filter Views',
      tableId: 'tbl_filter_views',
      viewId: 'viw_filter_views',
      tableName: 'Shared',
      columns: fullColumns(),
      primaryKey: 'col_id',
      rowsJsonl: jsonlRows(fullRows(200)),
    });
    await openSeededWorkspace(page, 'Filter Views');
    await applyScoreFilter(page, 'gt', '100');
    await expect(gridOf(page)).toHaveAttribute('data-visible-rows', '99');

    await page.getByTestId('tab-new-view').click();
    await expect(page.getByRole('tab', { name: 'Shared (2)' })).toBeVisible();
    await expect(gridOf(page)).toHaveAttribute('data-visible-rows', '99');

    await applyScoreFilter(page, 'lt', '10');
    await expect(gridOf(page)).toHaveAttribute('data-visible-rows', '10');

    await page.getByRole('tab', { name: 'Shared', exact: true }).click();
    await expect(gridOf(page)).toHaveAttribute('data-visible-rows', '99');

    await page.reload();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('recent-workspace').filter({ hasText: 'Filter Views' }).first().click();
    await expect(page.getByRole('tab', { name: 'Shared (2)' })).toBeVisible();
    await page.getByRole('tab', { name: 'Shared', exact: true }).click();
    await expect(gridOf(page)).toHaveAttribute('data-visible-rows', '99');
    await page.getByRole('tab', { name: 'Shared (2)' }).click();
    await expect(gridOf(page)).toHaveAttribute('data-visible-rows', '10');

    await expect
      .poll(() => readManifest(seeded.manifestPath).views.map((view) => view.title))
      .toEqual(['Shared', 'Shared (2)']);
  });

  test('hides and restores a column and remembers the hidden state', async ({ page }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Filter Hidden',
      tableId: 'tbl_filter_hidden',
      viewId: 'viw_filter_hidden',
      tableName: 'Hidden',
      columns: fullColumns(),
      primaryKey: 'col_id',
      rowsJsonl: jsonlRows(fullRows(100)),
    });
    await openSeededWorkspace(page, 'Filter Hidden');
    await expect(page.getByRole('columnheader')).toHaveCount(6);

    await page.getByRole('button', { name: '隐藏 Name' }).click();
    await expect(page.getByRole('columnheader')).toHaveCount(5);
    await expect(page.locator('[role="columnheader"][data-column-id="col_name"]')).toHaveCount(0);
    await expect
      .poll(() => readManifest(seeded.manifestPath).views[0]?.tableView?.hiddenColumnIds)
      .toEqual(['col_name']);

    await page.reload();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('recent-workspace').filter({ hasText: 'Filter Hidden' }).first().click();
    await expect(page.getByRole('columnheader')).toHaveCount(5);
    const hiddenPanel = page.getByTestId('hidden-columns');
    await expect(hiddenPanel).toBeVisible();
    await hiddenPanel.getByRole('button', { name: '显示 Name' }).click();
    await expect(page.getByRole('columnheader')).toHaveCount(6);
  });

  test('runs 100k filter and sort in the query worker within 400ms', async ({ page }, testInfo) => {
    await seedWorkspace(page, testInfo, {
      name: 'Filter Worker',
      tableId: 'tbl_filter_worker',
      viewId: 'viw_filter_worker',
      tableName: 'Worker',
      columns: perfColumns(),
      primaryKey: 'col_id',
      rowsJsonl: jsonlRows(perfRows(100_000)),
    });
    await openSeededWorkspace(page, 'Filter Worker');
    const grid = gridOf(page);
    await expect(grid).toHaveAttribute('data-visible-rows', '100000');

    await applyScoreFilter(page, 'gt', '50000');
    await expect(grid).toHaveAttribute('data-query-mode', 'worker');
    await expect(grid).toHaveAttribute('data-query-busy', 'false');
    await expect(grid).toHaveAttribute('data-visible-rows', '49999');
    const filterMs = Number(await grid.getAttribute('data-query-ms'));
    expect(filterMs, `filter query took ${String(filterMs)}ms`).toBeLessThanOrEqual(400);

    const scoreHeader = page.locator('[role="columnheader"][data-column-id="col_score"]');
    await scoreHeader.getByRole('button').click();
    await expect(scoreHeader).toHaveAttribute('aria-sort', 'ascending');
    await expect(grid).toHaveAttribute('data-query-busy', 'false');
    const sortMs = Number(await grid.getAttribute('data-query-ms'));
    expect(sortMs, `sort query took ${String(sortMs)}ms`).toBeLessThanOrEqual(400);

    await scoreHeader.getByRole('button').click();
    await expect(scoreHeader).toHaveAttribute('aria-sort', 'descending');
    await expect(grid).toHaveAttribute('data-query-busy', 'false');
    const descMs = Number(await grid.getAttribute('data-query-ms'));
    expect(descMs, `descending sort took ${String(descMs)}ms`).toBeLessThanOrEqual(400);

    await testInfo.attach('t26-query.txt', {
      body: `filterMs=${String(filterMs)}\nsortMs=${String(sortMs)}\ndescMs=${String(descMs)}\n`,
      contentType: 'text/plain',
    });
  });

  test('keeps the filter dialog keyboard reachable at 200% zoom', async ({
    page,
    electronApp,
  }, testInfo) => {
    await seedWorkspace(page, testInfo, {
      name: 'Filter Zoom',
      tableId: 'tbl_filter_zoom',
      viewId: 'viw_filter_zoom',
      tableName: 'Zoom',
      columns: fullColumns(),
      primaryKey: 'col_id',
      rowsJsonl: jsonlRows(fullRows(100)),
    });
    await openSeededWorkspace(page, 'Filter Zoom');
    await setZoom200(electronApp, page);
    await page.getByTestId('grid-filter-open').click();
    const dialog = page.getByRole('dialog', { name: '筛选条件' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('列', { exact: true }).first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const dialogElement = document.querySelector('[role="dialog"]');
      return dialogElement?.contains(document.activeElement) === true;
    });
    expect(inside).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
