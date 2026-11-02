/**
 * M5 acceptance demo (TASKS M5, SPEC §12/§13/§16, TESTPLAN E7/E8/E10).
 *
 * One end-to-end scenario that walks the milestone acceptance script:
 *
 * 1. seed two tables through `window.api`, then use the real UI to duplicate a
 *    view (3 views in total), split into two panes and move one tab across;
 * 2. make five cell edits (each outside the 800ms merge window), undo all five,
 *    then redo all five; assert the grid and the JSONL after each phase;
 * 3. commit one value, edit another and force-kill the process before the 1.5s
 *    autosave window; restart and recover through the stale-lock prompt, with
 *    the committed value intact and the last edit reported as possibly lost;
 * 4. close and reopen the workspace from the recent list (no recovery prompt);
 * 5. switch to en-US and the dark theme through the settings dialog;
 * 6. restart once more and assert the language/theme, pane count, tab selection,
 *    layout and data were all restored, then capture evidence and metrics.
 *
 * The seed only writes table data/manifest through `window.api` (same pattern as
 * M2/M3/M4); every layout, history, recovery and settings action goes through
 * the real UI. Screenshots are attached to the report; no pixel equality is
 * asserted (HANDOFF §3.6).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { launchCurveApp, test } from './fixtures';
import { capture, waitForExit } from './workspace-seed';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Page } from '@playwright/test';

const WORKSPACE_NAME = 'M5 Demo';
const TABLE_A = 'tbl_m5_a';
const TABLE_B = 'tbl_m5_b';
const VIEW_A = 'viw_m5_a';
const VIEW_B = 'viw_m5_b';

const COL_A = {
  id: 'col_a_id',
  time: 'col_a_time',
  sensor: 'col_a_sensor',
  sensorB: 'col_a_sensor_b',
} as const;
const COL_B = { id: 'col_b_id', value: 'col_b_value', label: 'col_b_label' } as const;

type Column = WorkspaceManifest['tables'][number]['columns'][number];
type Cell = string | number | boolean | null;

const COLUMNS_A: Column[] = [
  { id: COL_A.id, key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: COL_A.time, key: 'time', label: 'Time', type: 'number', role: 'x' },
  { id: COL_A.sensor, key: 'sensor_a', label: 'Sensor A', type: 'number', role: 'y' },
  { id: COL_A.sensorB, key: 'sensor_b', label: 'Sensor B', type: 'number', role: 'y' },
];
const COLUMNS_B: Column[] = [
  { id: COL_B.id, key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: COL_B.value, key: 'value', label: 'Value', type: 'number', role: 'y' },
  { id: COL_B.label, key: 'label', label: 'Label', type: 'text', role: 'none' },
];

const ROWS_A: Cell[][] = Array.from({ length: 12 }, (_, index) => [
  `r${String(index + 1)}`,
  index + 1,
  10 * (index + 1),
  100 + index,
]);
const ROWS_B: Cell[][] = [
  ['b1', 5, 'north'],
  ['b2', 8, 'east'],
  ['b3', 13, 'south'],
  ['b4', 21, 'west'],
  ['b5', 34, 'north'],
  ['b6', 55, 'east'],
];

interface DemoSeed {
  root: string;
  jsonlA: string;
  jsonlB: string;
}

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

function tableJsonl(rows: readonly Cell[][]): string {
  return `${rows
    .map((values, index) => JSON.stringify({ id: `row_m5_${String(index + 1)}`, v: values }))
    .join('\n')}\n`;
}

/** Seeds the two-table workspace and both table views through `window.api`. */
async function seedDemoWorkspace(page: Page, dir: string): Promise<DemoSeed> {
  const root = await page.evaluate(
    async (seed) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir: seed.dir, name: seed.name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const base = created.data;
      const timestamp = base.createdAt;

      const tableA: WorkspaceManifest['tables'][number] = {
        id: seed.tableAId,
        name: 'Sensors',
        file: `tables/${seed.tableAId}.jsonl`,
        schemaVersion: 1,
        columns: seed.columnsA,
        primaryKey: seed.columnsA[0]?.id ?? 'col_a_id',
        rowCount: seed.rowsA.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const tableB: WorkspaceManifest['tables'][number] = {
        id: seed.tableBId,
        name: 'Readings',
        file: `tables/${seed.tableBId}.jsonl`,
        schemaVersion: 1,
        columns: seed.columnsB,
        primaryKey: seed.columnsB[0]?.id ?? 'col_b_id',
        rowCount: seed.rowsB.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const manifest: WorkspaceManifest = {
        ...base,
        updatedAt: timestamp,
        tables: [tableA, tableB],
        views: [
          {
            id: seed.viewAId,
            kind: 'table',
            refId: seed.tableAId,
            title: 'Sensors',
            tableView: {
              tableId: seed.tableAId,
              styleId: 'builtin.report-light',
              columnOrder: seed.columnsA.map((column) => column.id),
              widths: {},
              hiddenColumnIds: [],
              sort: [],
              frozenColumnCount: 0,
            },
          },
          {
            id: seed.viewBId,
            kind: 'table',
            refId: seed.tableBId,
            title: 'Readings',
            tableView: {
              tableId: seed.tableBId,
              styleId: 'builtin.report-light',
              columnOrder: seed.columnsB.map((column) => column.id),
              widths: {},
              hiddenColumnIds: [],
              sort: [],
              frozenColumnCount: 0,
            },
          },
        ],
        layout: {
          type: 'pane',
          viewIds: [seed.viewAId, seed.viewBId],
          activeViewId: seed.viewAId,
        },
      };

      const written = await api.manifest.write({ workspaceId: base.id, manifest });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const writeA = await api.table.write({
        workspaceId: base.id,
        tableId: seed.tableAId,
        jsonl: seed.jsonlA,
      });
      if (!writeA.ok) {
        throw new Error(`table A write failed: ${writeA.error.code}`);
      }
      const writeB = await api.table.write({
        workspaceId: base.id,
        tableId: seed.tableBId,
        jsonl: seed.jsonlB,
      });
      if (!writeB.ok) {
        throw new Error(`table B write failed: ${writeB.error.code}`);
      }
      // A second manifest write creates the backup used by crash recovery.
      const backedUp = await api.manifest.write({ workspaceId: base.id, manifest });
      if (!backedUp.ok) {
        throw new Error(`manifest backup failed: ${backedUp.error.code}`);
      }
      const closed = await api.workspace.close({ workspaceId: base.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
      return `${seed.dir}\\${seed.name}.cstudio`;
    },
    {
      dir,
      name: WORKSPACE_NAME,
      tableAId: TABLE_A,
      tableBId: TABLE_B,
      viewAId: VIEW_A,
      viewBId: VIEW_B,
      columnsA: COLUMNS_A,
      columnsB: COLUMNS_B,
      rowsA: ROWS_A,
      rowsB: ROWS_B,
      jsonlA: tableJsonl(ROWS_A),
      jsonlB: tableJsonl(ROWS_B),
    },
  );

  return {
    root,
    jsonlA: join(root, 'tables', `${TABLE_A}.jsonl`),
    jsonlB: join(root, 'tables', `${TABLE_B}.jsonl`),
  };
}

async function forceKill(
  app: Awaited<ReturnType<typeof launchCurveApp>>['electronApp'],
): Promise<void> {
  // `app.process().pid` is the launcher; the workspace `.lock` belongs to the
  // Electron main process returned by `evaluate`.
  const pid = await app.evaluate(() => process.pid);
  try {
    execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
  } catch {
    // Already gone or taskkill raced the exit; `waitForExit` is authoritative.
  }
}

function pane(page: Page, index: number): ReturnType<Page['getByTestId']> {
  return page.getByTestId('pane').nth(index);
}

async function editCellIn(
  page: Page,
  paneIndex: number,
  row: number,
  column: number,
  value: string,
): Promise<void> {
  const cell = pane(page, paneIndex).getByTestId(`grid-cell-${row}-${column}`);
  await cell.click();
  // Focusing the pane may rebuild the grid subtree; focus the cell explicitly
  // before F2 so the grid's own keydown handler owns the key.
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
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
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

async function expectLayout(page: Page, panes: number, tabs: number): Promise<void> {
  await expect(page.getByTestId('layout')).toHaveAttribute('data-layout-panes', String(panes));
  await expect(page.getByTestId('pane')).toHaveCount(panes);
  await expect(page.getByTestId('pane').getByRole('tab')).toHaveCount(tabs);
}

test.describe('M5 acceptance demo', () => {
  test('layout, history, crash recovery, recent list and settings restore', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(360_000);

    const parent = testInfo.outputPath('m5');
    mkdirSync(parent, { recursive: true });
    const importFile = join(parent, 'unused.json');
    const settingsPath = join(userDataDir, 'settings.json');
    const metrics: Record<string, unknown> = {};

    let first: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let second: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let third: Awaited<ReturnType<typeof launchCurveApp>> | undefined;

    try {
      // ------------------------------------------------------------------
      // Launch 1 — layout, five-step history, committed edit + force kill.
      // ------------------------------------------------------------------
      first = await launchCurveApp({ userDataDir, importFile });
      const page = first.page;
      await expect(page.getByTestId('welcome')).toBeVisible();
      const seed = await seedDemoWorkspace(page, parent);
      expect(existsSync(join(seed.root, 'manifest.json'))).toBe(true);

      await openRecent(page, WORKSPACE_NAME);
      await expect(page.getByTestId('workspace-view')).toBeVisible();
      await dismissWarnings(page);
      await expectLayout(page, 1, 2);
      await expect(
        pane(page, 0).getByRole('tab', { name: 'Sensors', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');

      // 3 views: duplicate the active table view.
      await page.getByTestId('tab-new-view').first().click();
      await expect(page.getByTestId('pane').getByRole('tab')).toHaveCount(3);
      await expect(
        pane(page, 0).getByRole('tab', { name: 'Sensors (2)', exact: true }),
      ).toBeVisible();

      // 2 panes: split the first pane, then move the duplicate across.
      await pane(page, 0).getByTestId('pane-split-horizontal').click();
      await expectLayout(page, 2, 3);
      await expect(pane(page, 1)).toHaveAttribute('data-pane-active', 'true');
      await expect(pane(page, 1).getByTestId('workspace-empty')).toBeVisible();
      await pane(page, 0).getByRole('tab', { name: 'Sensors (2)', exact: true }).click();
      await pane(page, 0).getByTestId('pane-move-next').click();
      await expect(
        pane(page, 1).getByRole('tab', { name: 'Sensors (2)', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(pane(page, 0).getByRole('tab')).toHaveCount(2);
      await pane(page, 0).getByRole('tab', { name: 'Readings', exact: true }).click();
      await expect(
        pane(page, 0).getByRole('tab', { name: 'Readings', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expectLayout(page, 2, 3);
      metrics.panes = 2;
      metrics.tabs = 3;
      await capture(page, testInfo, 'm5-01-two-panes.png');

      // Five edits, each beyond the 800ms merge window.
      const history = page.getByTestId('history-menu');
      const baseDepth = Number(await history.getAttribute('data-undo-depth'));
      metrics.baseDepth = baseDepth;
      for (const [index, value] of ['101', '102', '103', '104', '105'].entries()) {
        await editCellIn(page, 0, 0, 1, value);
        await expect(pane(page, 0).getByTestId('grid-cell-0-1')).toHaveText(value);
        if (index < 4) {
          await page.waitForTimeout(900);
        }
      }
      await expect(history).toHaveAttribute('data-undo-depth', String(baseDepth + 5));
      await expect
        .poll(() => readFileSync(seed.jsonlB, 'utf8'), { timeout: 10_000 })
        .toContain('["b1",105,');
      await expect(page.getByTestId('autosave-status')).toContainText('已保存');
      metrics.editDepth = Number(await history.getAttribute('data-undo-depth'));

      // Undo all five, then redo all five.
      for (let index = 0; index < 5; index += 1) {
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(120);
      }
      await expect(history).toHaveAttribute('data-undo-depth', String(baseDepth));
      await expect(history).toHaveAttribute('data-redo-depth', '5');
      await expect(pane(page, 0).getByTestId('grid-cell-0-1')).toHaveText('5');
      await expect
        .poll(() => readFileSync(seed.jsonlB, 'utf8'), { timeout: 10_000 })
        .toContain('["b1",5,');

      // Evidence for the five-step history: the Edit menu now offers redo.
      await page.getByRole('button', { name: '历史: 编辑' }).click();
      await expect(page.getByRole('menuitem', { name: /重做 编辑单元格/ })).toBeEnabled();
      await capture(page, testInfo, 'm5-02-history.png');
      await page.keyboard.press('Escape');

      for (let index = 0; index < 5; index += 1) {
        await page.keyboard.press('Control+Shift+z');
        await page.waitForTimeout(120);
      }
      await expect(history).toHaveAttribute('data-undo-depth', String(baseDepth + 5));
      await expect(history).toHaveAttribute('data-redo-depth', '0');
      await expect(pane(page, 0).getByTestId('grid-cell-0-1')).toHaveText('105');
      await expect
        .poll(() => readFileSync(seed.jsonlB, 'utf8'), { timeout: 10_000 })
        .toContain('["b1",105,');
      metrics.undoDepth = Number(await history.getAttribute('data-undo-depth'));
      metrics.redoDepth = Number(await history.getAttribute('data-redo-depth'));

      // One committed edit, then one edit killed inside the 1.5s window.
      await editCellIn(page, 0, 0, 1, '200');
      await expect
        .poll(() => readFileSync(seed.jsonlB, 'utf8'), { timeout: 10_000 })
        .toContain('["b1",200,');
      await expect(page.getByTestId('autosave-status')).toContainText('已保存');
      await capture(page, testInfo, 'm5-03-before-kill.png');
      await editCellIn(page, 0, 0, 1, '999');
      await forceKill(first.electronApp);
      await waitForExit(first.electronApp);
      expect(existsSync(join(seed.root, '.lock'))).toBe(true);
      await first.electronApp.close().catch(() => undefined);
      first = undefined;

      // ------------------------------------------------------------------
      // Launch 2 — crash recovery, recent list, English + dark.
      // ------------------------------------------------------------------
      second = await launchCurveApp({ userDataDir, importFile });
      await openRecent(second.page, WORKSPACE_NAME);
      const recovery = second.page.getByRole('dialog', { name: '上次未正常退出' });
      await expect(recovery).toBeVisible();
      await expect(recovery).toContainText('最后 1.5 秒内尚未落盘的修改可能已丢失');
      await capture(second.page, testInfo, 'm5-04-recovery.png');
      await recovery.getByRole('button', { name: '尝试恢复' }).click();
      await expect(second.page.getByTestId('workspace-view')).toBeVisible();
      await dismissWarnings(second.page);
      await expectLayout(second.page, 2, 3);
      await expect(
        pane(second.page, 1).getByRole('tab', { name: 'Sensors (2)', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(pane(second.page, 0).getByTestId('grid-cell-0-1')).toHaveText('200');
      await capture(second.page, testInfo, 'm5-05-restored-layout.png');
      metrics.recoveredValue = await pane(second.page, 0)
        .getByTestId('grid-cell-0-1')
        .textContent();
      metrics.discardedValueLost = metrics.recoveredValue !== '999';

      // Recent list after recovery: close and reopen with no prompt.
      await second.page.getByRole('button', { name: '关闭工作区' }).click();
      await expect(second.page.getByTestId('welcome')).toBeVisible();
      await expect(second.page.getByTestId('recent-workspace')).toHaveCount(1);
      metrics.recentEntries = 1;
      await second.page.getByTestId('recent-workspace').first().click();
      await expect(second.page.getByTestId('workspace-view')).toBeVisible();
      await expect(second.page.getByRole('dialog', { name: '上次未正常退出' })).toHaveCount(0);
      await expectLayout(second.page, 2, 3);
      await expect(pane(second.page, 0).getByRole('tab')).toHaveCount(2);
      await expect(pane(second.page, 1).getByRole('tab')).toHaveCount(1);

      // English + dark through the settings dialog.
      await second.page.getByTestId('open-settings').click();
      await expect(second.page.getByTestId('settings-dialog')).toBeVisible();
      await second.page.getByTestId('settings-language').selectOption('en-US');
      await second.page.getByTestId('settings-theme').selectOption('dark');
      await expect(second.page.getByTestId('settings-close')).toHaveText('Close');
      await capture(second.page, testInfo, 'm5-06-english-dark.png');
      await second.page.getByTestId('settings-close').click();
      await expect(second.page.locator('html')).toHaveAttribute('lang', 'en-US');
      await expect
        .poll(() =>
          second?.page.evaluate(() => document.documentElement.getAttribute('data-theme')),
        )
        .toBe('dark');
      await expect(second.page.getByTestId('titlebar')).toContainText('Settings');
      await expect(second.page.getByTestId('sidebar')).toContainText('Tables');
      await expect
        .poll(() => {
          try {
            return JSON.parse(readFileSync(settingsPath, 'utf8')) as {
              locale: string;
              theme: string;
            };
          } catch {
            // The settings write is asynchronous; let expect.poll retry.
            return undefined;
          }
        })
        .toMatchObject({ locale: 'en-US', theme: 'dark' });
      metrics.language = 'en-US';
      metrics.theme = 'dark';

      await second.electronApp.close().catch(() => undefined);
      second = undefined;

      // ------------------------------------------------------------------
      // Launch 3 — restart: language/theme, panes, tabs and data restored.
      // ------------------------------------------------------------------
      third = await launchCurveApp({ userDataDir, importFile });
      await expect(third.page.getByTestId('welcome')).toBeVisible();
      await expect(third.page.locator('html')).toHaveAttribute('lang', 'en-US');
      await expect
        .poll(() => third?.page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe('dark');
      await expect(third.page.getByTestId('welcome')).toContainText('Start from a workspace');

      await third.page.getByTestId('recent-workspace').filter({ hasText: WORKSPACE_NAME }).click();
      await expect(third.page.getByTestId('workspace-view')).toBeVisible();
      await expectLayout(third.page, 2, 3);
      await expect(
        pane(third.page, 0).getByRole('tab', { name: 'Readings', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(
        pane(third.page, 1).getByRole('tab', { name: 'Sensors (2)', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(pane(third.page, 0).getByTestId('grid-cell-0-1')).toHaveText('200');
      await expect(third.page.getByTestId('titlebar')).toContainText('Settings');
      await expect
        .poll(() => third?.page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe('dark');
      await capture(third.page, testInfo, 'm5-07-restart-restored.png');

      const manifest = readManifest(seed.root);
      expect(manifest.tables).toHaveLength(2);
      expect(manifest.views).toHaveLength(3);
      expect(manifest.layout.type).toBe('split');
      expect(readFileSync(seed.jsonlB, 'utf8')).toContain('["b1",200,');
      expect(readFileSync(seed.jsonlB, 'utf8')).not.toContain('999');
      metrics.finalPanes = 2;
      metrics.finalTabs = 3;
      metrics.manifestTables = manifest.tables.length;
      metrics.manifestViews = manifest.views.length;
      metrics.jsonlContainsCommitted = true;

      const metricsPath = testInfo.outputPath('m5-metrics.json');
      writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
      await testInfo.attach('m5-metrics', {
        path: metricsPath,
        contentType: 'application/json',
      });
    } finally {
      await third?.electronApp.close().catch(() => undefined);
      await second?.electronApp.close().catch(() => undefined);
      await first?.electronApp.close().catch(() => undefined);
    }
  });
});
