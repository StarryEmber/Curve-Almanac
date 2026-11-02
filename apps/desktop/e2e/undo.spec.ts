/**
 * T5.2 — undo/redo and history UI (SPEC §13.2, TESTPLAN E7 steps 3–4).
 *
 * Two scenarios:
 *  - five edits separated by more than the 800 ms merge window, five undos,
 *    three redos, persisted JSONL and the Edit menu label;
 *  - tab switches, selection and scrolling stay out of history, a focus-only
 *    layout change keeps the redo branch, and closing/reopening clears it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Locator, Page, TestInfo } from '@playwright/test';

const WORKSPACE_NAME = 'Undo Demo';
const TABLE_ID = 'tbl_undo';
const VIEW_ID = 'viw_undo';
const SECOND_VIEW_ID = 'viw_undo_2';

const COLUMNS = ['col_id', 'col_label', 'col_value'] as const;

const INITIAL_ROW_COUNT = 100;

async function seedWorkspace(page: Page, testInfo: TestInfo): Promise<{ root: string }> {
  const parent = testInfo.outputPath('undo');
  const result = await page.evaluate(
    async ({ dir, name, tableId, viewIds, columnIds, rowCount }) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir, name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      const timestamp = manifest.createdAt;
      const [idColumn = '', labelColumn = '', valueColumn = ''] = columnIds;
      const columns: WorkspaceManifest['tables'][number]['columns'] = [
        {
          id: idColumn,
          key: 'id',
          label: 'ID',
          type: 'text',
          role: 'none',
          required: true,
        },
        { id: labelColumn, key: 'label', label: 'Label', type: 'text', role: 'label' },
        { id: valueColumn, key: 'value', label: 'Value', type: 'number', role: 'y' },
      ];
      const tableView = () => ({
        tableId,
        styleId: 'builtin.report-light',
        columnOrder: [...columnIds],
        widths: {},
        hiddenColumnIds: [],
        sort: [],
        frozenColumnCount: 0,
      });
      const [firstViewId = '', secondViewId = ''] = viewIds;
      const views: WorkspaceManifest['views'] = [
        {
          id: firstViewId,
          kind: 'table',
          refId: tableId,
          title: 'Undo Demo',
          tableView: tableView(),
        },
        {
          id: secondViewId,
          kind: 'table',
          refId: tableId,
          title: 'Undo Demo (2)',
          tableView: tableView(),
        },
      ];
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        id: `row_${String(index + 1)}`,
        v: [`key${String(index + 1)}`, `Row ${String(index + 1)}`, (index + 1) * 10],
      }));
      const next: WorkspaceManifest = {
        ...manifest,
        updatedAt: timestamp,
        tables: [
          {
            id: tableId,
            name: 'Undo',
            file: `tables/${tableId}.jsonl`,
            schemaVersion: 1,
            columns,
            primaryKey: idColumn,
            rowCount: rows.length,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views,
        layout: {
          type: 'pane',
          viewIds: [firstViewId, secondViewId],
          activeViewId: firstViewId,
        },
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId,
        jsonl: `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
      });
      if (!tableWrite.ok) {
        throw new Error(`table write failed: ${tableWrite.error.code}`);
      }
      const closed = await api.workspace.close({ workspaceId: manifest.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
      return `${dir}\\${name}.cstudio`;
    },
    {
      dir: parent,
      name: WORKSPACE_NAME,
      tableId: TABLE_ID,
      viewIds: [VIEW_ID, SECOND_VIEW_ID],
      columnIds: [...COLUMNS],
      rowCount: INITIAL_ROW_COUNT,
    },
  );
  return { root: result };
}

function cell(page: Page, row: number, column: number): Locator {
  return page.getByTestId(`grid-cell-${String(row)}-${String(column)}`);
}

async function openRecent(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('data-grid').first()).toBeVisible();
}

async function editCell(page: Page, row: number, column: number, value: string): Promise<void> {
  const target = cell(page, row, column);
  const editor = page.getByTestId('cell-editor');
  await target.click();
  await page.keyboard.press('F2');
  if (!(await editor.isVisible().catch(() => false))) {
    await target.dblclick();
  }
  await editor.fill(value);
  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
}

async function capture(target: Page | Locator, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(name);
  await target.screenshot({ path });
  await testInfo.attach(name.replace(/\.png$/u, ''), { path, contentType: 'image/png' });
}

test.describe('T5.2 undo/redo history', () => {
  test('undo-redo: five edits, five undos, three redos and persisted data', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { root } = await seedWorkspace(page, testInfo);
    const jsonlPath = join(root, 'tables', `${TABLE_ID}.jsonl`);
    await openRecent(page, WORKSPACE_NAME);

    const historyMenu = page.getByTestId('history-menu');
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '0');
    await expect(historyMenu).toHaveAttribute('data-can-undo', 'false');

    for (let index = 0; index < 5; index += 1) {
      if (index > 0) {
        await page.waitForTimeout(900);
      }
      await editCell(page, index, 2, String(101 + index));
    }
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '5');
    await expect(historyMenu).toHaveAttribute('data-undo-action', 'table.cell.set');

    // The Edit menu shows the next undo command, not just an icon.
    await page.getByRole('button', { name: '历史: 编辑' }).click();
    await expect(page.getByRole('menuitem', { name: /撤销 编辑单元格/ })).toBeEnabled();
    await expect(page.getByRole('menuitem', { name: /重做/ })).toBeDisabled();
    await capture(page, testInfo, 't5.2-history-menu.png');
    await page.keyboard.press('Escape');

    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('Control+z');
    }
    await expect(cell(page, 0, 2)).toHaveText('10');
    await expect(cell(page, 1, 2)).toHaveText('20');
    await expect(cell(page, 4, 2)).toHaveText('50');
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '0');
    await expect(historyMenu).toHaveAttribute('data-redo-depth', '5');
    await page.getByRole('button', { name: '历史: 编辑' }).click();
    await expect(page.getByRole('menuitem', { name: /撤销/ })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: /重做 编辑单元格/ })).toBeEnabled();
    await capture(page, testInfo, 't5.2-history-undone.png');
    await page.keyboard.press('Escape');

    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('Control+Shift+z');
    }
    await expect(cell(page, 0, 2)).toHaveText('101');
    await expect(cell(page, 2, 2)).toHaveText('103');
    await expect(cell(page, 3, 2)).toHaveText('40');
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '3');
    await expect(historyMenu).toHaveAttribute('data-redo-depth', '2');

    await expect(page.getByTestId('autosave-status')).toContainText('已保存', {
      timeout: 20_000,
    });
    await expect.poll(() => readFileSync(jsonlPath, 'utf8')).toContain('"v":["key1","Row 1",101]');
    expect(readFileSync(jsonlPath, 'utf8')).toContain('"v":["key3","Row 3",103]');
    expect(readFileSync(jsonlPath, 'utf8')).toContain('"v":["key4","Row 4",40]');
  });

  test('undo-focus: tabs, selection and scrolling stay out of history', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await seedWorkspace(page, testInfo);
    await openRecent(page, WORKSPACE_NAME);

    const historyMenu = page.getByTestId('history-menu');
    await editCell(page, 0, 2, '999');
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '1');
    await expect(historyMenu).toHaveAttribute('data-undo-action', 'table.cell.set');

    // Selecting the other tab only changes focus; it must not add an entry.
    await page.getByRole('tab', { name: 'Undo Demo (2)', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Undo Demo (2)', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '1');
    await expect(historyMenu).toHaveAttribute('data-undo-action', 'table.cell.set');

    // Selection and scrolling are UI state too.
    await cell(page, 1, 1).click();
    const scroller = page.getByTestId('grid-scroll');
    await scroller.evaluate((element) => {
      element.scrollTop = 2_400;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '1');

    await page.keyboard.press('Control+z');
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '0');
    await expect(historyMenu).toHaveAttribute('data-can-redo', 'true');
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(cell(page, 0, 2)).toHaveText('10');

    // A focus-only tab switch after undo must preserve the redo branch.
    await page.getByRole('tab', { name: 'Undo Demo', exact: true }).click();
    await expect(historyMenu).toHaveAttribute('data-can-redo', 'true');
    await expect(historyMenu).toHaveAttribute('data-redo-depth', '1');
    await page.keyboard.press('Control+Shift+z');
    await expect(cell(page, 0, 2)).toHaveText('999');

    await page.getByRole('button', { name: '关闭工作区' }).click();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '0');
    await expect(historyMenu).toHaveAttribute('data-can-undo', 'false');
    await expect(historyMenu).toHaveAttribute('data-can-redo', 'false');

    // Reopening starts from an empty history.
    await openRecent(page, WORKSPACE_NAME);
    await expect(historyMenu).toHaveAttribute('data-undo-depth', '0');
  });

  test('undo-menu: keyboard navigation and the menu stay usable at 200% zoom', async ({
    electronApp,
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await seedWorkspace(page, testInfo);
    await openRecent(page, WORKSPACE_NAME);
    await editCell(page, 0, 2, '777');

    const trigger = page.getByRole('button', { name: '历史: 编辑' });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: /撤销 编辑单元格/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();

    await electronApp.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      window?.webContents.setZoomFactor(2);
    });
    await page.waitForFunction(() => window.innerWidth < 800);

    await trigger.click();
    await expect(page.getByRole('menuitem', { name: /撤销 编辑单元格/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /重做/ })).toBeVisible();
    const menuBox = await page.getByRole('menu').boundingBox();
    expect(menuBox).not.toBeNull();
    if (menuBox !== null) {
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.y).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await page.keyboard.press('Escape');
  });
});
