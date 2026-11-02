/**
 * T6.5 final acceptance demo — README §6 nine steps, end to end.
 *
 * 1. create the `Demo.cstudio` workspace through the welcome page;
 * 2. create the `温度记录` table and its four columns through the column dialog
 *    (time/date/x, sensor_a/number/y, sensor_b/number/y, site/text/series);
 * 3. paste 200 rows, reject a batch with one type error (and locate it), fix it,
 *    paste again, then show a single-cell validation error and correct it;
 * 4. apply `builtin.report-light`, change density, add `sensor_a > 30` → red,
 *    save the style as `我的报表`;
 * 5. create a line chart, switch wide → long, zoom, hide the legend, export PNG;
 * 6. create a second table and import the 100,000-row GBK CSV through the
 *    wizard, scroll it, chart it and assert the sampled badge + timing contract;
 * 7. five edits, undo 5, redo 3, then commit one value and force-kill the app
 *    inside the 1.5 s autosave window;
 * 8. restart, open the recent workspace, recover, and assert the layout, style,
 *    chart and committed data were restored;
 * 9. export the style template and import/apply it in a brand-new workspace.
 *
 * Every step except the initial fixture setup goes through the real UI. The
 * only IPC calls in this spec are the read-only manifest/JSONL assertions after
 * the fact. Screenshots are attached as evidence; no pixel equality is
 * asserted (HANDOFF §3.6).
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { launchCurveApp, test } from './fixtures';
import { prepareImportFile } from './import-fixtures';
import { capture, waitForExit } from './workspace-seed';

import type { WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Locator, Page, TestInfo } from '@playwright/test';

const WORKSPACE = 'Demo';
const TABLE_NAME = '温度记录';
const IMPORT_TABLE_NAME = '100k 数据';
const SECOND_WORKSPACE = '模板验证';
const SECOND_TABLE_NAME = '验证表';
const STYLE_NAME = '我的报表';
const CHART_NAME = '温度趋势';
const IMPORT_CHART_NAME = '100k 趋势';
const ROW_COUNT = 200;
const IMPORTED_ROWS = 99_997;

type Column = WorkspaceManifest['tables'][number]['columns'][number];
type Cell = string | number | boolean | null;

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

function readJsonl(root: string, tableId: string): string {
  return readFileSync(join(root, 'tables', `${tableId}.jsonl`), 'utf8');
}

function columnByKey(manifest: WorkspaceManifest, tableId: string, key: string): Column {
  const table = manifest.tables.find((entry) => entry.id === tableId);
  const column = table?.columns.find((entry) => entry.key === key);
  if (column === undefined) {
    throw new Error(`column ${key} not found in table ${tableId}`);
  }
  return column;
}

function pane(page: Page, index: number): ReturnType<Page['getByTestId']> {
  return page.getByTestId('pane').nth(index);
}

/** The pane that owns keyboard focus / receives newly opened views. */
function activePane(page: Page): ReturnType<Page['getByTestId']> {
  return page.locator('[data-testid="pane"][data-pane-active="true"]').first();
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
}

/** Creates a workspace through the real welcome-page dialog. */
async function createWorkspaceViaUi(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByRole('button', { name: '新建工作区' }).click();
  const dialog = page.getByRole('dialog', { name: '新建工作区' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('名称').fill(name);
  // The native directory dialog is stubbed by CURVE_E2E_DIR; use it so the test
  // never writes into the real Documents folder.
  await dialog.getByRole('button', { name: '选择文件夹…' }).click();
  const parent = dialog.getByLabel('保存位置');
  await expect(parent).toHaveValue(/dialog-directory/u);
  await dialog.getByRole('button', { name: '创建工作区' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('workspace-view')).toBeVisible();
  await expect(page.getByTestId('workspace-label')).toHaveText(name);
}

/** Creates a table through the sidebar's `新建表` dialog. */
async function createTableViaUi(page: Page, name: string): Promise<void> {
  await page.getByTestId('sidebar').getByRole('tab', { name: '数据表', exact: true }).click();
  await page.getByRole('button', { name: '新建表' }).click();
  const dialog = page.getByRole('dialog', { name: '新建数据表' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('表名').fill(name);
  await dialog.getByRole('button', { name: '创建表' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(activePane(page).getByTestId('data-grid')).toBeVisible();
}

/** Adds one column through the columns panel (real form, real validation). */
async function addColumnViaUi(
  page: Page,
  label: string,
  type: string,
  role: string,
): Promise<void> {
  await page.getByTestId('inspector').getByRole('tab', { name: '列' }).click();
  await expect(page.getByTestId('columns-panel')).toBeVisible();
  await page.getByTestId('column-add').click();
  const dialog = page.getByRole('dialog', { name: '新增列' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('显示名称').fill(label);
  await dialog.getByLabel('存储类型').selectOption(type);
  await dialog.getByLabel('角色').selectOption(role);
  await dialog.getByRole('button', { name: '添加列' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('columns-panel')).toContainText(label);
}

/** Dispatches a real `paste` ClipboardEvent on the grid scroll container. */
async function pasteIntoGrid(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const grid = document.querySelector<HTMLElement>('[data-testid="grid-scroll"]');
    if (grid === null) {
      throw new Error('the grid is not rendered');
    }
    const data = new DataTransfer();
    data.setData('text/plain', value);
    grid.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

async function editCell(
  page: Page,
  paneIndex: number,
  row: number,
  column: number,
  value: string,
): Promise<void> {
  const cell = pane(page, paneIndex).getByTestId(`grid-cell-${String(row)}-${String(column)}`);
  await cell.click();
  await cell.focus();
  await page.keyboard.press('F2');
  if (
    !(await page
      .getByTestId('cell-editor')
      .isVisible()
      .catch(() => false))
  ) {
    await cell.dblclick();
  }
  await expect(page.getByTestId('cell-editor')).toBeVisible();
  await page.getByTestId('cell-editor').fill(value);
  await page.keyboard.press('Enter');
}

async function openRecent(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
}

async function closeWorkspace(page: Page): Promise<void> {
  await page.getByRole('button', { name: '关闭工作区' }).click();
  await expect(page.getByTestId('welcome')).toBeVisible();
}

async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('autosave-status')).toContainText('已保存', { timeout: 20_000 });
}

/** Attaches a screenshot of one element (charts live inside a pane). */
async function captureLocator(target: Locator, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(name);
  await target.screenshot({ path });
  await testInfo.attach(name.replace(/\.png$/u, ''), { path, contentType: 'image/png' });
}

function demoRows(withError: boolean): Cell[][] {
  return Array.from({ length: ROW_COUNT }, (_, index) => {
    const day = (index % 28) + 1;
    const sensorA = 20 + ((index * 7) % 25);
    const sensorB = 10 + ((index * 3) % 20);
    const site = ['north', 'east', 'south'][index % 3] ?? 'north';
    const broken = withError && index === 57 ? 'n/a' : sensorA;
    return [
      `r${String(index + 1).padStart(3, '0')}`,
      `2026-03-${String(day).padStart(2, '0')}`,
      broken,
      sensorB,
      site,
    ];
  });
}

function toTsv(rows: readonly Cell[][]): string {
  return rows.map((row) => row.map((cell) => String(cell)).join('\t')).join('\r\n');
}

function historyDepth(
  page: Page,
  attribute: 'data-undo-depth' | 'data-redo-depth',
): Promise<number> {
  return page
    .getByTestId('history-menu')
    .getAttribute(attribute)
    .then((value) => Number(value ?? '0'));
}

async function forceKill(
  app: Awaited<ReturnType<typeof launchCurveApp>>['electronApp'],
): Promise<void> {
  const pid = await app.evaluate(() => process.pid);
  try {
    execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
  } catch {
    // Already gone or taskkill raced the exit; `waitForExit` is authoritative.
  }
}

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test.describe('T6.5 final acceptance demo', () => {
  test('README §6: workspace → table → paste → style → chart → 100k → undo/recovery → restart → template', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(600_000);

    const parent = testInfo.outputPath('t6.5');
    mkdirSync(parent, { recursive: true });
    const gbkPath = prepareImportFile('gbk-100k.csv');
    const pngPath = join(parent, 't6.5-chart.png');
    const stylePath = join(parent, 't6.5-report.curvestyle.json');
    const metrics: Record<string, string | number | boolean> = {};

    let first: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let second: Awaited<ReturnType<typeof launchCurveApp>> | undefined;

    try {
      // ------------------------------------------------------------------
      // Launch 1 — steps 1–7: workspace, table, paste, style, chart, 100k,
      //             history, committed edit + force kill.
      // ------------------------------------------------------------------
      first = await launchCurveApp({ userDataDir, importFile: gbkPath, saveFile: pngPath });
      const page = first.page;
      await expect(page.getByTestId('welcome')).toBeVisible();

      // Step 1 — new workspace through the welcome dialog.
      await createWorkspaceViaUi(page, WORKSPACE);
      const workspaceRoot = join(userDataDir, 'dialog-directory', `${WORKSPACE}.cstudio`);
      expect(existsSync(join(workspaceRoot, 'manifest.json'))).toBe(true);
      await capture(page, testInfo, 't6.5-01-workspace.png');

      // Step 2 — the `温度记录` table through the UI.
      await createTableViaUi(page, TABLE_NAME);
      const afterTable = readManifest(workspaceRoot);
      const tableId = afterTable.tables[0]?.id ?? '';
      expect(tableId).not.toBe('');
      await addColumnViaUi(page, 'Time', 'date', 'x');
      await addColumnViaUi(page, 'Sensor A', 'number', 'y');
      await addColumnViaUi(page, 'Sensor B', 'number', 'y');
      await addColumnViaUi(page, 'Site', 'text', 'series');

      const afterColumns = readManifest(workspaceRoot);
      const table = afterColumns.tables.find((entry) => entry.id === tableId);
      expect(table?.columns.map((column) => [column.key, column.type, column.role])).toEqual([
        ['id', 'text', 'none'],
        ['time', 'date', 'x'],
        ['sensor_a', 'number', 'y'],
        ['sensor_b', 'number', 'y'],
        ['site', 'text', 'series'],
      ]);
      metrics.tableColumns = table?.columns.length ?? 0;

      // Step 3 — 200 rows, one bad row rejected as a whole batch, then fixed.
      const badTsv = toTsv(demoRows(true));
      await pasteIntoGrid(page, badTsv);
      const pasteError = page.getByRole('dialog', { name: '粘贴失败' });
      await expect(pasteError).toBeVisible();
      await expect(pasteError).toContainText('整批未提交');
      await expect(pasteError).toContainText('n/a');
      await expect(pasteError).toContainText('第 58 行');
      await capture(page, testInfo, 't6.5-02-paste-error.png');
      await pasteError.getByRole('button', { name: '关闭' }).last().click();
      await expect(pasteError).toHaveCount(0);
      await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '1');
      metrics.pasteRejected = true;

      await pasteIntoGrid(page, toTsv(demoRows(false)));
      await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', String(ROW_COUNT + 1), {
        timeout: 20_000,
      });
      await expect(page.getByTestId('grid-cell-0-2')).toHaveText('20');
      await waitForSaved(page);
      metrics.pastedRows = ROW_COUNT;

      // Single-cell validation: an invalid number is rejected, then corrected.
      const cell = page.getByTestId('grid-cell-0-2');
      await cell.click();
      await page.bringToFront().catch(() => undefined);
      await page.keyboard.press('F2');
      const editor = page.getByTestId('cell-editor');
      if (!(await editor.isVisible().catch(() => false))) {
        await cell.dblclick();
      }
      await expect(editor).toBeVisible();
      await editor.fill('oops');
      await page.keyboard.press('Enter');
      await expect(editor).toHaveAttribute('aria-invalid', 'true');
      await editor.fill('31.5');
      await page.keyboard.press('Enter');
      await expect(editor).toHaveCount(0);
      await expect(cell).toHaveText('31.5');
      await waitForSaved(page);
      metrics.invalidCellRejected = true;
      await capture(page, testInfo, 't6.5-03-pasted-rows.png');

      // Step 4 — apply the light report template, edit density, add the rule
      // and save the copy as `我的报表`.
      await page.getByTestId('inspector').getByRole('tab', { name: '样式' }).click();
      await expect(page.getByTestId('style-panel')).toBeVisible();
      await page.getByTestId('style-templates-open').click();
      await expect(page.getByRole('dialog', { name: '模板管理' })).toBeVisible();
      await page.getByTestId('style-template-apply-builtin.report-light').click();
      await expect(page.getByTestId('style-template-status')).toContainText('应用到当前视图');
      await page.getByTestId('style-templates-close').click();

      await page.getByTestId('style-edit-open').click();
      await expect(page.getByTestId('style-editor')).toBeVisible();
      await page.getByTestId('style-density').selectOption('compact');
      await expect
        .poll(
          async () =>
            (await page.getByTestId('style-preview').getAttribute('data-preview-ms')) ?? '',
        )
        .not.toBe('');
      metrics.previewMs = Number(
        await page.getByTestId('style-preview').getAttribute('data-preview-ms'),
      );

      await page.getByRole('tab', { name: '条件规则' }).click();
      await page.getByTestId('style-rule-add').click();
      const sensorA = columnByKey(readManifest(workspaceRoot), tableId, 'sensor_a');
      const sensorB = columnByKey(readManifest(workspaceRoot), tableId, 'sensor_b');
      await page.getByTestId('style-rule-label').fill('高温');
      await page.getByTestId('style-rule-condition-0-0-column').selectOption(sensorA.id);
      await page.getByTestId('style-rule-condition-0-0-op').selectOption('gt');
      await page.getByTestId('style-rule-condition-0-0-value').fill('30');
      const ruleEditor = page.getByTestId('style-rules-tab');
      await ruleEditor.getByLabel('背景色').fill('#fde2e2');
      await ruleEditor.getByLabel('文字色').fill('#a40000');
      await ruleEditor.getByLabel('图标').selectOption('warning');
      await ruleEditor.getByLabel('加粗').check();
      await page.getByTestId('style-rule-save').click();
      await expect
        .poll(() => {
          const style = readManifest(workspaceRoot).tableStyles.find(
            (entry) => entry.conditionalRules.length === 1,
          );
          return style?.conditionalRules[0]?.label;
        })
        .toBe('高温');

      await page.getByRole('tab', { name: '模板' }).click();
      await page.getByTestId('style-save-as-open').click();
      await page.getByTestId('style-save-as-name').fill(STYLE_NAME);
      await page.getByTestId('style-save-as-confirm').click();
      await expect(page.getByTestId('style-save-as-notice')).toContainText(STYLE_NAME);
      await page.getByTestId('style-done').click();
      await expect(page.getByTestId('style-editor')).toHaveCount(0);
      await expect(page.getByTestId('style-current-name')).toHaveText(STYLE_NAME);
      await expect
        .poll(async () =>
          page
            .getByTestId('grid-cell-0-2')
            .evaluate((element) => getComputedStyle(element).backgroundColor),
        )
        .toBe('rgb(253, 226, 226)');
      const styled = readManifest(workspaceRoot).tableStyles.find(
        (entry) => entry.name === STYLE_NAME,
      );
      expect(styled?.conditionalRules).toHaveLength(1);
      metrics.styleId = styled?.id ?? '';
      metrics.styleRules = styled?.conditionalRules.length ?? 0;
      await capture(page, testInfo, 't6.5-04-style.png');

      // Step 5 — wide chart → long mapping → zoom, legend off, PNG export.
      await page.getByTestId('sidebar').getByRole('tab', { name: '图表' }).click();
      await page.getByTestId('chart-new').click();
      const chartDialog = page.getByRole('dialog', { name: '新建图表' });
      await expect(chartDialog).toBeVisible();
      await page.getByTestId('chart-new-table').selectOption(tableId);
      await page
        .getByTestId('chart-new-x')
        .selectOption(columnByKey(afterColumns, tableId, 'time').id);
      await page.getByTestId(`chart-new-y-${sensorA.id}`).check();
      await page.getByTestId(`chart-new-y-${sensorB.id}`).check();
      // The wizard resets the title when the table changes, so type it last.
      await page.getByTestId('chart-new-name').fill(CHART_NAME);
      await expect(page.getByTestId('chart-new-canvas')).toBeVisible();
      await page.getByTestId('chart-new-create').click();
      await expect(chartDialog).toHaveCount(0);

      const chartView = page.getByTestId('chart-view');
      await expect(chartView).toHaveAttribute('data-chart-state', 'ready');
      await expect(chartView).toHaveAttribute('data-chart-layout', 'wide');
      await expect(chartView).toHaveAttribute('data-chart-series-count', '2');
      metrics.wideSeries = 2;
      await captureLocator(chartView, testInfo, 't6.5-05-chart-wide.png');

      await page.getByTestId('inspector').getByRole('tab', { name: '映射' }).click();
      await page.getByTestId('chart-mapping-layout').selectOption('long');
      await page
        .getByTestId('chart-mapping-series')
        .selectOption(columnByKey(afterColumns, tableId, 'site').id);
      await page
        .getByTestId('chart-mapping-y')
        .selectOption(columnByKey(afterColumns, tableId, 'sensor_a').id);
      await expect(chartView).toHaveAttribute('data-chart-layout', 'long');
      await expect(chartView).toHaveAttribute('data-chart-series-count', '3');
      metrics.longSeries = 3;

      await page.getByTestId('chart-zoom-in').click();
      await expect
        .poll(async () => Number(await chartView.getAttribute('data-chart-zoom-start')))
        .toBeGreaterThan(0);
      await page.getByTestId('inspector').getByRole('tab', { name: '外观' }).click();
      await page.getByTestId('chart-legend').selectOption('none');
      await expect(chartView).toHaveAttribute('data-chart-legend', 'none');

      await page.getByTestId('chart-export-open').click();
      const exportDialog = page.getByRole('dialog', { name: '导出 PNG' });
      await expect(exportDialog).toBeVisible();
      await exportDialog.getByTestId('chart-export-confirm').click();
      await expect(page.getByTestId('chart-export-success')).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => existsSync(pngPath)).toBe(true);
      const exported = pngSize(pngPath);
      expect(exported.width).toBeGreaterThan(0);
      expect(exported.height).toBeGreaterThan(0);
      metrics.pngWidth = exported.width;
      metrics.pngHeight = exported.height;
      await exportDialog.getByRole('button', { name: '取消' }).click();
      await expect(exportDialog).toHaveCount(0);

      // Chart in its own pane so the restart can prove layout persistence.
      await pane(page, 0).getByTestId('pane-split-horizontal').click();
      await expect(page.getByTestId('layout')).toHaveAttribute('data-layout-panes', '2');
      await pane(page, 0).getByRole('tab', { name: CHART_NAME, exact: true }).click();
      await pane(page, 0).getByTestId('pane-move-next').click();
      await expect(
        pane(page, 1).getByRole('tab', { name: CHART_NAME, exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(chartView).toHaveAttribute('data-chart-state', 'ready');
      await capture(page, testInfo, 't6.5-05b-chart-long.png');

      // Step 6 — second table + 100k GBK CSV import through the wizard.
      await createTableViaUi(page, IMPORT_TABLE_NAME);
      const afterImportTable = readManifest(workspaceRoot);
      const importTable = afterImportTable.tables.find((entry) => entry.name === IMPORT_TABLE_NAME);
      const importTableId = importTable?.id ?? '';
      expect(importTableId).not.toBe('');
      const idColumn = importTable?.columns.find((column) => column.key === 'id');
      expect(idColumn).toBeDefined();
      const idColumnId = idColumn?.id ?? '';

      await page.getByRole('button', { name: `导入 ${IMPORT_TABLE_NAME}` }).click();
      const importDialog = page.getByRole('dialog', { name: '导入数据' });
      await expect(importDialog).toBeVisible();
      await expect(page.getByTestId('import-detected-encoding')).toContainText('GB18030');
      await page.getByTestId('import-next').click();
      await expect(page.getByTestId('import-step-preview')).toBeVisible();
      await expect(page.getByText(/100000 行数据/u)).toBeVisible();
      await page.getByTestId('import-next').click();
      await expect(page.getByTestId('import-step-mapping')).toBeVisible();
      await page.getByTestId('import-mapping-0').selectOption(`existing:${idColumnId}`);
      for (const index of [1, 2, 3, 4, 5]) {
        await page.getByTestId(`import-mapping-${String(index)}`).selectOption('new');
      }
      await page.getByTestId('import-validate').click();
      await expect(page.getByTestId('import-step-validation')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('import-stat-total')).toContainText('100000');
      await expect(page.getByTestId('import-stat-accepted')).toContainText('99997');
      await expect(page.getByTestId('import-stat-skipped')).toContainText('3');
      await page.getByTestId('import-skip').check();
      await page.getByTestId('import-next').click();
      await expect(page.getByTestId('import-step-commit')).toBeVisible();
      await page.getByTestId('import-commit').click();
      await expect(page.getByTestId('import-step-commit')).toHaveCount(0, { timeout: 30_000 });
      const importGrid = activePane(page).getByRole('grid');
      await expect(importGrid).toHaveAttribute('aria-rowcount', '99998', {
        timeout: 30_000,
      });
      await expect(activePane(page).getByTestId('grid-row-count')).toContainText(/99[,]?997/u);
      await waitForSaved(page);
      metrics.importedRows = IMPORTED_ROWS;
      await capture(page, testInfo, 't6.5-06-import-100k.png');

      // Scroll the 100k grid and chart it: sampled badge + timing contract.
      const importScroll = activePane(page).getByTestId('grid-scroll');
      await importScroll.evaluate((element) => {
        element.scrollTop = 120_000;
        element.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await expect
        .poll(async () => Number(await importScroll.evaluate((element) => element.scrollTop)))
        .toBeGreaterThan(0);

      const afterImport = readManifest(workspaceRoot);
      await page.getByTestId('sidebar').getByRole('tab', { name: '图表' }).click();
      await page.getByTestId('chart-new').click();
      await expect(page.getByRole('dialog', { name: '新建图表' })).toBeVisible();
      await page.getByTestId('chart-new-table').selectOption(importTableId);
      await page
        .getByTestId('chart-new-x')
        .selectOption(columnByKey(afterImport, importTableId, 'day').id);
      await page
        .getByTestId(`chart-new-y-${columnByKey(afterImport, importTableId, 'value').id}`)
        .check();
      await page.getByTestId('chart-new-name').fill(IMPORT_CHART_NAME);
      await page.getByTestId('chart-new-create').click();
      const importChart = activePane(page).getByTestId('chart-view');
      await expect(importChart).toHaveAttribute('data-chart-state', 'ready', { timeout: 60_000 });
      await expect(importChart).toHaveAttribute('data-chart-sampled', 'true');
      await expect(importChart).toHaveAttribute('data-chart-source-points', '99997');
      await expect(activePane(page).getByTestId('chart-sampled-badge')).toHaveText('已采样');
      await expect
        .poll(async () => (await importChart.getAttribute('data-chart-resolve-ms')) ?? '')
        .not.toBe('');
      // `data-chart-update-ms` belongs to the canvas element (T4.6 contract).
      const importCanvas = importChart.getByTestId('chart-canvas');
      await expect
        .poll(async () => Number(await importCanvas.getAttribute('data-chart-update-ms')))
        .toBeGreaterThan(0);
      const resolveMs = Number(await importChart.getAttribute('data-chart-resolve-ms'));
      const updateMs = Number(await importCanvas.getAttribute('data-chart-update-ms'));
      expect(resolveMs).toBeLessThanOrEqual(300);
      expect(updateMs).toBeLessThanOrEqual(200);
      await page.getByTestId('chart-zoom-in').click();
      await expect
        .poll(async () => Number(await importChart.getAttribute('data-chart-zoom-start')))
        .toBeGreaterThan(0);
      metrics.sampledPoints = Number(await importChart.getAttribute('data-chart-rendered-points'));
      metrics.resolveMs = resolveMs;
      metrics.updateMs = updateMs;
      await captureLocator(importChart, testInfo, 't6.5-06b-100k-chart.png');

      // Step 7 — five edits, undo 5, redo 3, then commit + force kill.
      await pane(page, 0).getByRole('tab', { name: TABLE_NAME, exact: true }).click();
      await expect(page.getByTestId('data-grid')).toBeVisible();
      const baseDepth = await historyDepth(page, 'data-undo-depth');
      for (const value of ['41', '42', '43', '44', '45']) {
        await editCell(page, 0, 0, 2, value);
        await page.waitForTimeout(900);
      }
      await expect.poll(() => historyDepth(page, 'data-undo-depth')).toBe(baseDepth + 5);
      metrics.undoBase = baseDepth;

      for (let index = 0; index < 5; index += 1) {
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(150);
      }
      await expect.poll(() => historyDepth(page, 'data-undo-depth')).toBe(baseDepth);
      await expect(page.getByTestId('grid-cell-0-2')).toHaveText('31.5');
      await expect.poll(() => historyDepth(page, 'data-redo-depth')).toBe(5);

      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press('Control+Shift+z');
        await page.waitForTimeout(150);
      }
      await expect.poll(() => historyDepth(page, 'data-redo-depth')).toBe(2);
      // Three redos replay the first three edits (41 → 42 → 43).
      await expect(page.getByTestId('grid-cell-0-2')).toHaveText('43');
      metrics.undoSteps = 5;
      metrics.redoSteps = 3;
      await capture(page, testInfo, 't6.5-07-history.png');

      // One committed value, then one edit inside the 1.5 s window.
      await editCell(page, 0, 0, 2, '77');
      await expect
        .poll(() => {
          const firstLine = readJsonl(workspaceRoot, tableId).split('\n')[0] ?? '{}';
          return (JSON.parse(firstLine) as { v: Cell[] }).v[2];
        })
        .toBe(77);
      await waitForSaved(page);
      await capture(page, testInfo, 't6.5-07b-before-kill.png');
      await editCell(page, 0, 0, 2, '999');
      await forceKill(first.electronApp);
      await waitForExit(first.electronApp);
      expect(existsSync(join(workspaceRoot, '.lock'))).toBe(true);
      await first.electronApp.close().catch(() => undefined);
      first = undefined;
      metrics.killedInAutosaveWindow = true;

      // ------------------------------------------------------------------
      // Launch 2 — step 8 recovery/restart, then step 9 template round-trip.
      // ------------------------------------------------------------------
      second = await launchCurveApp({ userDataDir, importFile: gbkPath, saveFile: stylePath });
      const restored = second.page;
      await expect(restored.getByTestId('welcome')).toBeVisible();
      await openRecent(restored, WORKSPACE);
      const recovery = restored.getByRole('dialog', { name: '上次未正常退出' });
      await expect(recovery).toBeVisible();
      await expect(recovery).toContainText('最后 1.5 秒内尚未落盘的修改可能已丢失');
      await capture(restored, testInfo, 't6.5-08-recovery.png');
      await recovery.getByRole('button', { name: '尝试恢复' }).click();
      await expect(restored.getByTestId('workspace-view')).toBeVisible();
      await dismissWarnings(restored);

      await expect(restored.getByTestId('layout')).toHaveAttribute('data-layout-panes', '2');
      await expect(restored.getByTestId('pane')).toHaveCount(2);
      await pane(restored, 1).getByRole('tab', { name: CHART_NAME, exact: true }).click();
      await expect(
        pane(restored, 1).getByRole('tab', { name: CHART_NAME, exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(pane(restored, 1).getByTestId('chart-view')).toHaveAttribute(
        'data-chart-state',
        'ready',
      );
      await pane(restored, 0).getByRole('tab', { name: TABLE_NAME, exact: true }).click();
      await restored.getByTestId('inspector').getByRole('tab', { name: '样式' }).click();
      await expect(restored.getByTestId('style-current-name')).toHaveText(STYLE_NAME);
      await expect(restored.getByTestId('grid-cell-0-2')).toHaveText('77');
      await expect(restored.getByTestId('data-grid')).toHaveAttribute(
        'data-table-style',
        String(metrics.styleId),
      );
      const restoredRows = readJsonl(workspaceRoot, tableId)
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { v: Cell[] });
      expect(restoredRows[0]?.v[2]).toBe(77);
      expect(restoredRows.some((row) => row.v[2] === 999)).toBe(false);
      metrics.restoredValue = 77;
      metrics.restoredPanes = 2;
      await capture(restored, testInfo, 't6.5-08b-restored.png');

      // Step 9 — export the style and apply it in a brand-new workspace.
      await restored.getByTestId('style-templates-open').click();
      await expect(restored.getByRole('dialog', { name: '模板管理' })).toBeVisible();
      await restored.getByTestId(`style-template-export-${String(metrics.styleId)}`).click();
      await expect(restored.getByTestId('style-template-status')).toContainText('已导出到');
      await expect.poll(() => existsSync(stylePath)).toBe(true);
      const exportedDocument = JSON.parse(readFileSync(stylePath, 'utf8')) as {
        kind: string;
        style: { name: string; builtin: boolean };
      };
      expect(exportedDocument.kind).toBe('curve-table-style');
      expect(exportedDocument.style.name).toBe(STYLE_NAME);
      expect(exportedDocument.style.builtin).toBe(false);
      await restored.getByTestId('style-templates-close').click();
      // The single import stub reads this path; the template replaces the CSV.
      copyFileSync(stylePath, gbkPath);

      await closeWorkspace(restored);
      await createWorkspaceViaUi(restored, SECOND_WORKSPACE);
      const secondRoot = join(userDataDir, 'dialog-directory', `${SECOND_WORKSPACE}.cstudio`);
      await createTableViaUi(restored, SECOND_TABLE_NAME);
      await restored.getByTestId('inspector').getByRole('tab', { name: '样式' }).click();
      await restored.getByTestId('style-templates-open').click();
      await expect(restored.getByRole('dialog', { name: '模板管理' })).toBeVisible();
      await restored.getByTestId('style-template-import').click();
      const importStyleDialog = restored.getByRole('dialog', { name: '导入表格样式' });
      await expect(importStyleDialog).toBeVisible();
      await restored.getByTestId('style-import-pick').click();
      await expect(restored.getByTestId('style-import-summary')).toContainText(STYLE_NAME);
      await restored.getByTestId('style-import-confirm').click();
      await expect(restored.getByTestId('style-import-dialog')).toHaveCount(0);
      await expect(restored.getByRole('dialog', { name: '模板管理' })).toHaveCount(0);

      const secondManifest = readManifest(secondRoot);
      const importedStyle = secondManifest.tableStyles.find((style) => style.name === STYLE_NAME);
      expect(importedStyle).toBeDefined();
      expect(importedStyle?.builtin).toBe(false);
      expect(importedStyle?.conditionalRules).toHaveLength(1);
      expect(importedStyle?.id).not.toBe(metrics.styleId);
      const secondView = secondManifest.views.find((view) => view.kind === 'table');
      expect(secondView?.tableView?.styleId).toBe(importedStyle?.id);
      await expect(restored.getByTestId('data-grid')).toHaveAttribute(
        'data-table-style',
        importedStyle?.id ?? '',
      );
      await expect(restored.getByTestId('style-current-name')).toHaveText(STYLE_NAME);
      metrics.importedStyleId = importedStyle?.id ?? '';
      await capture(restored, testInfo, 't6.5-09-template-imported.png');

      const metricsPath = testInfo.outputPath('t6.5-metrics.json');
      writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
      await testInfo.attach('t6.5-metrics', {
        path: metricsPath,
        contentType: 'application/json',
      });
    } finally {
      await second?.electronApp.close().catch(() => undefined);
      await first?.electronApp.close().catch(() => undefined);
    }
  });
});
