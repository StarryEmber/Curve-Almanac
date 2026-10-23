/**
 * M2 acceptance demo (TASKS M2, ADR-033 §7, HANDOFF §6).
 *
 * One end-to-end scenario: create a workspace/table in the UI, paste 200 rows
 * (including the T2.4 quoted/embedded-newline fragment), import the 100k GBK
 * CSV with three bad rows, filter/sort, resize/freeze columns, quit Electron
 * while the workspace is open, relaunch with the same userData, reopen from
 * the recent list and assert that both the UI and the files on disk match.
 *
 * The app is launched through the explicit `launchCurveApp` helper instead of
 * the single-launch `appLaunch` fixture because this scenario must stop and
 * start Electron twice. Production code is not involved in the restart.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { launchCurveApp, test } from './fixtures';
import { prepareImportFile } from './import-fixtures';

import type { LaunchedCurveApp } from './fixtures';
import type { WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

const WORKSPACE_NAME = 'M2 Acceptance';
const TABLE_NAME = 'Readings';
const PASTED_ROWS = 200;
const IMPORT_ACCEPTED_ROWS = 99_997;
const TOTAL_ROWS = PASTED_ROWS + IMPORT_ACCEPTED_ROWS;
/** `value > 50` over the generated CSV: 499 of every 1,000 rows, 100 cycles. */
const FILTERED_ROWS = 49_900;

const IMPORT_BUDGET_MS = 8_000;
const OPEN_BUDGET_MS = 3_000;
const QUERY_BUDGET_MS = 400;
const MEMORY_BUDGET_MB = 600;

const SPECIAL_NAMES = ['Hello, world', 'Line1\nLine2', 'Say "hi"', 'Delta', 'Epsilon'] as const;

type TableMeta = WorkspaceManifest['tables'][number];
type TableView = NonNullable<WorkspaceManifest['views'][number]['tableView']>;

function readManifest(path: string): WorkspaceManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as WorkspaceManifest;
}

function requireTable(manifest: WorkspaceManifest): TableMeta {
  const table = manifest.tables[0];
  if (table === undefined) {
    throw new Error('workspace has no table');
  }
  return table;
}

function requireTableView(manifest: WorkspaceManifest): TableView {
  const view = manifest.views[0];
  if (view === undefined || view.tableView === undefined) {
    throw new Error('workspace has no table view');
  }
  return view.tableView;
}

function columnIdByKey(table: TableMeta, key: string): string {
  const column = table.columns.find((entry) => entry.key === key);
  if (column === undefined) {
    throw new Error(`missing column ${key}`);
  }
  return column.id;
}

function tsvCell(value: string): string {
  if (/[\t\n\r"]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * 200 rows × 6 columns. The first five rows carry the T2.4 5×4 fragment
 * (quoted comma, embedded newline, escaped quote) in their id/name/value/day
 * cells; every pasted `value` is ≤ 50 so the filter count below stays exact.
 */
function buildPasteMatrix(): string {
  const lines: string[] = [];
  for (let index = 0; index < PASTED_ROWS; index += 1) {
    const rowNumber = index + 1;
    const id = `p-${String(rowNumber).padStart(4, '0')}`;
    const specialName = index < SPECIAL_NAMES.length ? (SPECIAL_NAMES[index] ?? '') : undefined;
    const name = specialName ?? `Paste ${String(rowNumber)}`;
    const value = specialName === undefined ? String(index % 10) : (rowNumber / 10).toFixed(1);
    const day =
      specialName === undefined ? '2026-01-01' : `2026-02-${String(rowNumber).padStart(2, '0')}`;
    const active = index % 2 === 0 ? 'true' : 'false';
    const site = `站点-${String(index % 7)}`;
    lines.push([id, name, value, day, active, site].map(tsvCell).join('\t'));
  }
  return lines.join('\r\n');
}

/** Dispatches a real `paste` ClipboardEvent with text/plain on the active cell. */
async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    // An empty table renders no cells; the grid scroll container owns onPaste
    // and its initial anchor is row 0 / column 0.
    const target =
      document.querySelector<HTMLElement>('[data-active="true"]') ??
      document.querySelector<HTMLElement>('[data-testid="grid-scroll"]');
    if (target === null) {
      throw new Error('No grid surface to paste into.');
    }
    const data = new DataTransfer();
    data.setData('text/plain', value);
    target.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

function countJsonlRows(path: string): number {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0).length;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

function headerOf(page: Page, columnId: string) {
  return page.locator(`[role="columnheader"][data-column-id="${columnId}"]`);
}

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

test.describe('M2 acceptance demo', () => {
  test('restores the 200-row paste, 100k import, filter/sort and widths after a restart', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(180_000);

    const importFile = prepareImportFile('gbk-100k.csv');
    const parent = testInfo.outputPath('m2-parent');
    mkdirSync(parent, { recursive: true });
    const root = join(parent, `${WORKSPACE_NAME}.cstudio`);
    const manifestPath = join(root, 'manifest.json');

    let first: LaunchedCurveApp | undefined;
    let second: LaunchedCurveApp | undefined;

    try {
      first = await launchCurveApp({ userDataDir, importFile });
      const page = first.page;
      const grid = page.getByTestId('data-grid');

      // 1. New workspace and table through the UI (no API seeding).
      await expect(page.getByTestId('welcome')).toBeVisible();
      await page.getByRole('button', { name: '新建工作区' }).click();
      const workspaceDialog = page.getByRole('dialog', { name: '新建工作区' });
      await workspaceDialog.getByLabel('名称').fill(WORKSPACE_NAME);
      await workspaceDialog.getByLabel('保存位置').fill(parent);
      await workspaceDialog.getByRole('button', { name: '创建工作区' }).click();
      await expect(page.getByTestId('workspace-view')).toBeVisible();
      await expect(page.getByTestId('workspace-label')).toHaveText(WORKSPACE_NAME);

      await page.getByRole('button', { name: '新建表' }).click();
      const tableDialog = page.getByRole('dialog', { name: '新建数据表' });
      await tableDialog.getByLabel('表名').fill(TABLE_NAME);
      await tableDialog.getByRole('button', { name: '创建表' }).click();
      await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '1');
      await expect(page.getByRole('grid')).toHaveAttribute('aria-colcount', '1');

      await expect.poll(() => readManifest(manifestPath).tables.length).toBe(1);
      let manifest = readManifest(manifestPath);
      const tableId = requireTable(manifest).id;
      const viewId = manifest.views[0]?.id;
      expect(viewId).toBeDefined();

      // 2. Paste the 200 × 6 matrix and confirm the five new typed columns.
      //    An empty table has no cell to focus; the helper targets the grid.
      await pasteText(page, buildPasteMatrix());

      const columnsDialog = page.getByTestId('paste-columns-dialog');
      await expect(columnsDialog).toBeVisible();
      await expect(page.getByRole('dialog', { name: /新增 5 列/ })).toBeVisible();
      const drafts = [
        { label: 'Name', type: 'text' },
        { label: 'Value', type: 'number' },
        { label: 'Day', type: 'date' },
        { label: 'Active', type: 'boolean' },
        { label: 'Site', type: 'text' },
      ] as const;
      for (const [index, draft] of drafts.entries()) {
        await page.getByTestId(`paste-column-label-${String(index)}`).fill(draft.label);
        await page.getByTestId(`paste-column-type-${String(index)}`).selectOption(draft.type);
      }
      await page.getByTestId('paste-columns-confirm').click();

      await expect(page.getByRole('grid')).toHaveAttribute('aria-colcount', '6');
      await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '201');
      await expect(grid).toHaveAttribute('data-visible-rows', String(PASTED_ROWS));
      await expect(page.getByTestId('grid-cell-0-1')).toHaveText('Hello, world');
      await expect(page.getByTestId('grid-cell-1-1')).toContainText('Line1');
      await expect(page.getByTestId('grid-cell-2-1')).toHaveText('Say "hi"');
      await expect(page.getByTestId('autosave-status')).toContainText('已保存');
      await expect.poll(() => readManifest(manifestPath).tables[0]?.rowCount).toBe(PASTED_ROWS);

      manifest = readManifest(manifestPath);
      const pastedTable = requireTable(manifest);
      expect(pastedTable.columns.map((column) => column.key)).toEqual([
        'id',
        'name',
        'value',
        'day',
        'active',
        'site',
      ]);

      const idColumnId = columnIdByKey(pastedTable, 'id');
      const nameColumnId = columnIdByKey(pastedTable, 'name');
      const valueColumnId = columnIdByKey(pastedTable, 'value');
      const dayColumnId = columnIdByKey(pastedTable, 'day');
      const jsonlPath = join(root, 'tables', `${tableId}.jsonl`);

      await capture(page, testInfo, 'm2-01-paste.png');

      // 3. Import the 100k GBK semicolon CSV into the same table.
      await page.getByRole('button', { name: `导入 ${TABLE_NAME}` }).click();
      await expect(page.getByRole('dialog', { name: '导入数据' })).toBeVisible();
      await expect(page.getByTestId('import-detected-encoding')).toContainText('GB18030');
      await page.getByTestId('import-next').click();
      await expect(page.getByTestId('import-step-preview')).toBeVisible();
      await expect(page.getByText(/100000 行数据/)).toBeVisible();
      await expect(page.getByTestId('import-delimiter')).toHaveValue(';');
      await expect(page.getByTestId('import-header')).toBeChecked();

      await page.getByTestId('import-next').click();
      await expect(page.getByTestId('import-step-mapping')).toBeVisible();
      for (let index = 0; index < 6; index += 1) {
        await expect(page.getByTestId(`import-mapping-${String(index)}`)).toHaveValue(/^existing:/);
      }
      await page.getByTestId('import-validate').click();
      await expect(page.getByTestId('import-step-validation')).toBeVisible();
      await expect(page.getByTestId('import-stat-total')).toContainText('100000');
      await expect(page.getByTestId('import-stat-accepted')).toContainText('99997');
      await expect(page.getByTestId('import-stat-skipped')).toContainText('3');

      await page.getByTestId('import-skip').check();
      await page.getByTestId('import-next').click();
      await expect(page.getByTestId('import-step-commit')).toBeVisible();
      await expect(page.getByTestId('import-large-confirm')).toBeVisible();
      await page.getByTestId('import-large-confirm').check();
      await expect(page.getByTestId('import-commit')).toBeEnabled();

      const importStartedAt = Date.now();
      await page.getByTestId('import-commit').click();
      await expect(page.getByTestId('import-step-commit')).toHaveCount(0);
      await expect(page.getByRole('grid')).toHaveAttribute(
        'aria-rowcount',
        String(TOTAL_ROWS + 1),
        { timeout: 15_000 },
      );
      const importMs = Date.now() - importStartedAt;
      expect(importMs, `import took ${String(importMs)}ms`).toBeLessThanOrEqual(IMPORT_BUDGET_MS);
      await expect(page.getByTestId('autosave-status')).toContainText('已保存', {
        timeout: 30_000,
      });
      await expect
        .poll(() => readManifest(manifestPath).tables[0]?.rowCount, { timeout: 30_000 })
        .toBe(TOTAL_ROWS);
      await expect.poll(() => countJsonlRows(jsonlPath), { timeout: 30_000 }).toBe(TOTAL_ROWS);

      await capture(page, testInfo, 'm2-02-import.png');

      // 4. Single-level all filter, then three sort levels.
      await page.getByTestId('grid-filter-open').click();
      const filterDialog = page.getByRole('dialog', { name: '筛选条件' });
      await expect(filterDialog).toBeVisible();
      await filterDialog.getByLabel('列', { exact: true }).first().selectOption({ label: 'Value' });
      await filterDialog.getByLabel('操作符', { exact: true }).first().selectOption('gt');
      await filterDialog.getByLabel('值', { exact: true }).first().fill('50');
      await filterDialog.getByRole('button', { name: '应用筛选' }).click();
      await expect(filterDialog).toHaveCount(0);

      await expect(grid).toHaveAttribute('data-query-mode', 'worker');
      await expect(grid).toHaveAttribute('data-visible-rows', String(FILTERED_ROWS));
      await expect(grid).toHaveAttribute('data-query-busy', 'false');
      const filterMs = Number(await grid.getAttribute('data-query-ms'));
      expect(filterMs, `filter query took ${String(filterMs)}ms`).toBeGreaterThan(0);
      expect(filterMs, `filter query took ${String(filterMs)}ms`).toBeLessThanOrEqual(
        QUERY_BUDGET_MS,
      );

      const valueHeader = headerOf(page, valueColumnId);
      const dayHeader = headerOf(page, dayColumnId);
      const idHeader = headerOf(page, idColumnId);

      await valueHeader.getByRole('button').click();
      await expect(valueHeader).toHaveAttribute('aria-sort', 'ascending');
      await dayHeader.getByRole('button').click({ modifiers: ['Shift'] });
      await expect(dayHeader).toHaveAttribute('aria-sort', 'ascending');
      await idHeader.getByRole('button').click({ modifiers: ['Shift'] });
      await expect(idHeader).toHaveAttribute('aria-sort', 'ascending');
      await expect(grid).toHaveAttribute('data-query-busy', 'false');
      await expect(grid).toHaveAttribute('data-visible-rows', String(FILTERED_ROWS));
      await expect(valueHeader.locator('.cs-grid__sort-level')).toHaveText('1');
      await expect(dayHeader.locator('.cs-grid__sort-level')).toHaveText('2');
      await expect(idHeader.locator('.cs-grid__sort-level')).toHaveText('3');
      const sortMs = Number(await grid.getAttribute('data-query-ms'));
      expect(sortMs, `sort query took ${String(sortMs)}ms`).toBeGreaterThan(0);
      expect(sortMs, `sort query took ${String(sortMs)}ms`).toBeLessThanOrEqual(QUERY_BUDGET_MS);

      // 5. Resize the Name column and freeze two columns.
      const nameHeader = headerOf(page, nameColumnId);
      const resizer = nameHeader.getByRole('separator');
      const resizerBox = await resizer.boundingBox();
      expect(resizerBox).not.toBeNull();
      if (resizerBox === null) {
        throw new Error('column resizer is not visible');
      }
      await page.mouse.move(
        resizerBox.x + resizerBox.width / 2,
        resizerBox.y + resizerBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        resizerBox.x + resizerBox.width / 2 + 90,
        resizerBox.y + resizerBox.height / 2,
        { steps: 6 },
      );
      await page.mouse.up();

      await expect
        .poll(() => readManifest(manifestPath).views[0]?.tableView?.widths?.[nameColumnId])
        .toBeGreaterThan(160);
      const draggedNameWidth =
        readManifest(manifestPath).views[0]?.tableView?.widths?.[nameColumnId] ?? 0;

      // Double-click autofit commits one deterministic width. Dispatch the
      // event directly: a real double-click also emits pointerup, which can
      // overwrite the autofit commit with the lagging drag state.
      await resizer.dispatchEvent('dblclick');
      await expect
        .poll(() => readManifest(manifestPath).views[0]?.tableView?.widths?.[nameColumnId])
        .not.toBe(draggedNameWidth);
      const persistedNameWidth =
        readManifest(manifestPath).views[0]?.tableView?.widths?.[nameColumnId] ?? 0;
      await expect
        .poll(async () =>
          Math.round(
            Number.parseFloat(
              await nameHeader.evaluate((element) => getComputedStyle(element).width),
            ),
          ),
        )
        .toBe(persistedNameWidth);

      await page.getByLabel('冻结列').selectOption('2');
      await expect
        .poll(() => readManifest(manifestPath).views[0]?.tableView?.frozenColumnCount)
        .toBe(2);
      await expect(page.locator('.cs-grid__header-cell--frozen')).toHaveCount(2);

      // 6. Quit with the workspace open, relaunch with the same userData and reopen.
      await expect(page.getByTestId('autosave-status')).toContainText('已保存');
      const manifestBefore = readManifest(manifestPath);
      const tableViewBefore = requireTableView(manifestBefore);
      expect(tableViewBefore.filter).toMatchObject({
        kind: 'all',
        children: [{ kind: 'compare', columnId: valueColumnId, op: 'gt', value: 50 }],
      });
      expect(tableViewBefore.sort).toEqual([
        { columnId: valueColumnId, direction: 'asc' },
        { columnId: dayColumnId, direction: 'asc' },
        { columnId: idColumnId, direction: 'asc' },
      ]);
      expect(tableViewBefore.widths?.[nameColumnId]).toBe(persistedNameWidth);
      expect(tableViewBefore.frozenColumnCount).toBe(2);

      const jsonlHashBefore = sha256File(jsonlPath);
      expect(countJsonlRows(jsonlPath)).toBe(TOTAL_ROWS);
      await capture(page, testInfo, 'm2-03-view-state.png');

      await first.electronApp.close();
      first = undefined;

      second = await launchCurveApp({ userDataDir, importFile });
      const restored = second.page;
      await expect(restored.getByTestId('welcome')).toBeVisible();
      await restored.waitForFunction(
        () => performance.getEntriesByName('curve:app-ready').length > 0,
      );
      const coldStartMs = Date.now() - second.launchStartedAt;

      await restored
        .getByTestId('recent-workspace')
        .filter({ hasText: WORKSPACE_NAME })
        .first()
        .click();
      await expect(restored.getByTestId('data-grid')).toBeVisible();
      // The persisted filter is restored, so the grid renders 49,900 of the
      // 100,197 physical rows; both counters are asserted below.
      await expect(restored.getByRole('grid')).toHaveAttribute(
        'aria-rowcount',
        String(FILTERED_ROWS + 1),
        { timeout: 15_000 },
      );
      await restored.waitForFunction(() => performance.getEntriesByName('curve:open').length > 0);
      const openMs = await restored.evaluate(
        () => performance.getEntriesByName('curve:open').at(-1)?.duration ?? -1,
      );
      expect(openMs, `instrumented open took ${String(openMs)}ms`).toBeGreaterThan(0);
      expect(openMs, `instrumented open took ${String(openMs)}ms`).toBeLessThanOrEqual(
        OPEN_BUDGET_MS,
      );

      // A quit without closing the workspace leaves a stale lock; T5.3 owns the
      // full recovery UX, so the demo records and dismisses it.
      const warnings = restored.locator('.cs-warnings');
      let staleLockWarning = false;
      if ((await warnings.count()) > 0) {
        staleLockWarning = true;
        await expect(warnings).toContainText('stale lock');
        await warnings.getByRole('button', { name: '隐藏提示' }).click();
        await expect(warnings).toHaveCount(0);
      }

      const restoredGrid = restored.getByTestId('data-grid');
      await expect(restoredGrid).toHaveAttribute('data-query-mode', 'worker');
      await expect(restoredGrid).toHaveAttribute('data-total-rows', String(TOTAL_ROWS));
      await expect(restoredGrid).toHaveAttribute('data-visible-rows', String(FILTERED_ROWS));
      await expect(restoredGrid).toHaveAttribute('data-query-busy', 'false');
      await expect(restored.getByTestId('grid-filter-open')).toContainText('1 个条件');

      const restoredValueHeader = headerOf(restored, valueColumnId);
      const restoredDayHeader = headerOf(restored, dayColumnId);
      const restoredIdHeader = headerOf(restored, idColumnId);
      await expect(restoredValueHeader).toHaveAttribute('aria-sort', 'ascending');
      await expect(restoredDayHeader).toHaveAttribute('aria-sort', 'ascending');
      await expect(restoredIdHeader).toHaveAttribute('aria-sort', 'ascending');
      await expect(restoredValueHeader.locator('.cs-grid__sort-level')).toHaveText('1');
      await expect(restoredDayHeader.locator('.cs-grid__sort-level')).toHaveText('2');
      await expect(restoredIdHeader.locator('.cs-grid__sort-level')).toHaveText('3');
      const restoredNameHeader = headerOf(restored, nameColumnId);
      const restoredNameWidth = Math.round(
        Number.parseFloat(
          await restoredNameHeader.evaluate((element) => getComputedStyle(element).width),
        ),
      );
      expect(restoredNameWidth).toBe(persistedNameWidth);
      await expect(restored.locator('.cs-grid__header-cell--frozen')).toHaveCount(2);

      const restoredQueryMs = Number(await restoredGrid.getAttribute('data-query-ms'));
      expect(restoredQueryMs, `restored query took ${String(restoredQueryMs)}ms`).toBeGreaterThan(
        0,
      );
      expect(
        restoredQueryMs,
        `restored query took ${String(restoredQueryMs)}ms`,
      ).toBeLessThanOrEqual(QUERY_BUDGET_MS);

      const manifestAfter = readManifest(manifestPath);
      const tableViewAfter = requireTableView(manifestAfter);
      expect(manifestAfter.tables[0]?.rowCount).toBe(TOTAL_ROWS);
      expect(tableViewAfter.filter).toEqual(tableViewBefore.filter);
      expect(tableViewAfter.sort).toEqual(tableViewBefore.sort);
      expect(tableViewAfter.widths?.[nameColumnId]).toBe(persistedNameWidth);
      expect(tableViewAfter.frozenColumnCount).toBe(2);
      expect(countJsonlRows(jsonlPath)).toBe(TOTAL_ROWS);
      expect(sha256File(jsonlPath)).toBe(jsonlHashBefore);

      const privateSamples: number[] = [];
      const workingSetSamples: number[] = [];
      for (let index = 0; index < 5; index += 1) {
        privateSamples.push(await appPrivateMb(second.electronApp));
        workingSetSamples.push(await appWorkingSetMb(second.electronApp));
        await restored.waitForTimeout(100);
      }
      const privatePeakMb = Math.max(...privateSamples);
      const workingSetPeakMb = Math.max(...workingSetSamples);
      expect(
        privatePeakMb,
        `app private memory peaked at ${String(privatePeakMb)}MB`,
      ).toBeLessThanOrEqual(MEMORY_BUDGET_MB);

      await capture(restored, testInfo, 'm2-04-restored.png');

      const summary = [
        `workspace=${root}`,
        `tableId=${tableId}`,
        `rowsAfterPaste=${String(PASTED_ROWS)}`,
        `rowsAfterImport=${String(TOTAL_ROWS)}`,
        `filteredRows=${String(FILTERED_ROWS)}`,
        `importMs=${String(importMs)}`,
        `filterMs=${String(filterMs)}`,
        `sortMs=${String(sortMs)}`,
        `coldStartMs=${String(coldStartMs)}`,
        `openMs=${String(Math.round(openMs))}`,
        `restoredQueryMs=${String(restoredQueryMs)}`,
        `privatePeakMb=${String(privatePeakMb)}`,
        `workingSetPeakMb=${String(workingSetPeakMb)}`,
        `privateSamplesMb=${privateSamples.join(',')}`,
        `staleLockWarning=${String(staleLockWarning)}`,
        `jsonlSha256=${jsonlHashBefore}`,
      ].join('\n');
      console.log(`[m2] ${summary.replaceAll('\n', ' ')}`);
      await testInfo.attach('m2-timings.txt', { body: `${summary}\n`, contentType: 'text/plain' });
      await testInfo.attach('m2-manifest.json', {
        body: JSON.stringify(
          {
            tableId,
            viewId,
            rowCount: manifestAfter.tables[0]?.rowCount,
            tableView: tableViewAfter,
            jsonlSha256: jsonlHashBefore,
          },
          null,
          2,
        ),
        contentType: 'application/json',
      });
    } finally {
      await second?.electronApp.close().catch(() => undefined);
      await first?.electronApp.close().catch(() => undefined);
    }
  });
});
