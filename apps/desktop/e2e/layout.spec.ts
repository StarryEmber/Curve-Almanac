/**
 * T5.1 — split layout and tabs (SPEC §12, TESTPLAN E7 layout half).
 *
 * Three scenarios:
 *  - split, move a tab to the next pane, drag the ratio and restart;
 *  - invalid persisted layouts (missing view refs / ratio) fall back to one
 *    pane with every view preserved and a warning;
 *  - keyboard tab cycling/closing and the 200% zoom smoke.
 *
 * Undo/redo (the other half of E7) belongs to T5.2 and is not covered here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { launchCurveApp, test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Locator, Page, TestInfo } from '@playwright/test';

const WORKSPACE_NAME = 'Layout Demo';
const UNUSED_IMPORT = 'unused.json';

interface SeedOptions {
  dir: string;
  name: string;
}

async function seedWorkspace(page: Page, options: SeedOptions): Promise<string> {
  return page.evaluate(async ({ dir, name }) => {
    const api = (globalThis as unknown as { api: CurveApi }).api;
    const created = await api.workspace.create({ dir, name });
    if (!created.ok) {
      throw new Error(`create failed: ${created.error.code}`);
    }
    const manifest = created.data;
    const timestamp = manifest.createdAt;
    const columns: WorkspaceManifest['tables'][number]['columns'] = [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'none' },
    ];
    const tableView = (tableId: string) => ({
      tableId,
      styleId: 'builtin.report-light',
      columnOrder: ['col_id', 'col_value'],
      widths: {},
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: 0,
    });
    const tables: WorkspaceManifest['tables'] = [
      {
        id: 'tbl_alpha',
        name: 'Alpha',
        file: 'tables/tbl_alpha.jsonl',
        schemaVersion: 1,
        columns,
        primaryKey: 'col_id',
        rowCount: 3,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'tbl_beta',
        name: 'Beta',
        file: 'tables/tbl_beta.jsonl',
        schemaVersion: 1,
        columns,
        primaryKey: 'col_id',
        rowCount: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    const views: WorkspaceManifest['views'] = [
      {
        id: 'viw_alpha',
        kind: 'table',
        refId: 'tbl_alpha',
        title: 'Alpha',
        tableView: tableView('tbl_alpha'),
      },
      {
        id: 'viw_alpha_2',
        kind: 'table',
        refId: 'tbl_alpha',
        title: 'Alpha (2)',
        tableView: tableView('tbl_alpha'),
      },
      {
        id: 'viw_beta',
        kind: 'table',
        refId: 'tbl_beta',
        title: 'Beta',
        tableView: tableView('tbl_beta'),
      },
    ];
    const next: WorkspaceManifest = {
      ...manifest,
      updatedAt: timestamp,
      tables,
      views,
      layout: {
        type: 'pane',
        viewIds: ['viw_alpha', 'viw_alpha_2', 'viw_beta'],
        activeViewId: 'viw_alpha',
      },
    };
    const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
    if (!written.ok) {
      throw new Error(`manifest write failed: ${written.error.code}`);
    }
    const tablesJsonl: Record<string, string> = {
      tbl_alpha: [
        { id: 'row_a1', v: ['a1', 10] },
        { id: 'row_a2', v: ['a2', 20] },
        { id: 'row_a3', v: ['a3', 30] },
      ]
        .map((row) => JSON.stringify(row))
        .join('\n'),
      tbl_beta: [
        { id: 'row_b1', v: ['b1', 1] },
        { id: 'row_b2', v: ['b2', 2] },
      ]
        .map((row) => JSON.stringify(row))
        .join('\n'),
    };
    for (const [tableId, jsonl] of Object.entries(tablesJsonl)) {
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId,
        jsonl: `${jsonl}\n`,
      });
      if (!tableWrite.ok) {
        throw new Error(`table write failed: ${tableWrite.error.code}`);
      }
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

function writeLayout(root: string, layout: WorkspaceManifest['layout']): void {
  const manifest = readManifest(root);
  manifest.layout = layout;
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function openRecent(page: Page, name: string, marker: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId(marker).first()).toBeVisible();
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

function pane(page: Page, index: number): Locator {
  return page.getByTestId('pane').nth(index);
}

async function capture(target: Page | Locator, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(name);
  await target.screenshot({ path });
  await testInfo.attach(name.replace(/\.png$/u, ''), { path, contentType: 'image/png' });
}

async function setZoom(
  electronApp: ElectronApplication,
  page: Page,
  factor: number,
): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, value) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(value);
  }, factor);
  await page.waitForFunction(
    (expected) => (expected >= 2 ? window.innerWidth < 800 : window.innerWidth >= 800),
    factor,
  );
}

test.describe('T5.1 split layout and tabs', () => {
  test('layout-split: split, move, ratio and restart restore', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(180_000);
    const parent = testInfo.outputPath('layout');
    const root = join(parent, `${WORKSPACE_NAME}.cstudio`);
    let first: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let second: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    try {
      first = await launchCurveApp({
        userDataDir,
        importFile: join(userDataDir, UNUSED_IMPORT),
      });
      const page = first.page;
      await expect(page.getByTestId('welcome')).toBeVisible();
      expect(await seedWorkspace(page, { dir: parent, name: WORKSPACE_NAME })).toBe(root);
      await openRecent(page, WORKSPACE_NAME, 'data-grid');
      await dismissWarnings(page);

      const layout = page.getByTestId('layout');
      await expect(layout).toHaveAttribute('data-layout-panes', '1');
      await expect(page.getByTestId('pane')).toHaveCount(1);

      // Split horizontally → two panes, the new one empty and focused.
      await pane(page, 0).getByTestId('pane-split-horizontal').click();
      await expect(layout).toHaveAttribute('data-layout-panes', '2');
      await expect(page.getByTestId('pane')).toHaveCount(2);
      await expect(pane(page, 1)).toHaveAttribute('data-pane-active', 'true');
      await expect(pane(page, 1).getByTestId('workspace-empty')).toBeVisible();
      await expect(page.getByTestId('layout-split')).toHaveAttribute(
        'data-direction',
        'horizontal',
      );

      // Move the middle tab to the second pane.
      await pane(page, 0).getByRole('tab', { name: 'Alpha (2)', exact: true }).click();
      await pane(page, 0).getByTestId('pane-move-next').click();
      await expect(
        pane(page, 1).getByRole('tab', { name: 'Alpha (2)', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(pane(page, 0).getByRole('tab')).toHaveCount(2);
      await expect(pane(page, 0).getByRole('tab', { name: 'Beta', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      // Drag the separator to ~35% and assert the persisted ratio after debounce.
      const handle = page.getByTestId('split-handle');
      await expect(handle).toHaveAttribute('aria-valuenow', '50');
      const splitBox = await page.getByTestId('layout-split').boundingBox();
      const handleBox = await handle.boundingBox();
      expect(splitBox).not.toBeNull();
      expect(handleBox).not.toBeNull();
      if (splitBox !== null && handleBox !== null) {
        await page.mouse.move(
          handleBox.x + handleBox.width / 2,
          handleBox.y + handleBox.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          splitBox.x + splitBox.width * 0.35,
          handleBox.y + handleBox.height / 2,
          {
            steps: 5,
          },
        );
        await page.mouse.up();
      }
      await expect
        .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
        .toBeGreaterThanOrEqual(33);
      await expect
        .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
        .toBeLessThanOrEqual(37);
      const ratio = Number(await handle.getAttribute('aria-valuenow')) / 100;

      // Split vertically to three panes, then an empty pane horizontally to four.
      await pane(page, 1).getByTestId('pane-split-vertical').click();
      await expect(layout).toHaveAttribute('data-layout-panes', '3');
      await page.getByTestId('pane').last().getByTestId('pane-split-horizontal').click();
      await expect(layout).toHaveAttribute('data-layout-panes', '4');
      await expect(
        page.getByTestId('pane').first().getByTestId('pane-split-horizontal'),
      ).toBeDisabled();
      await capture(page.getByTestId('workspace-view'), testInfo, 't5.1-layout-four-panes.png');

      // Close the empty panes; populated panes only close through their tabs.
      while ((await page.getByTestId('pane').count()) > 2) {
        const before = await page.getByTestId('pane').count();
        const emptyPane = page
          .getByTestId('pane')
          .filter({ has: page.getByTestId('workspace-empty') })
          .first();
        await emptyPane.getByTestId('pane-close').click();
        await expect.poll(async () => page.getByTestId('pane').count()).toBeLessThan(before);
      }
      await expect(layout).toHaveAttribute('data-layout-panes', '2');
      await expect(pane(page, 0).getByRole('tab')).toHaveCount(2);
      await expect(pane(page, 1).getByRole('tab')).toHaveCount(1);
      await expect(handle).toHaveAttribute('aria-valuenow', String(Math.round(ratio * 100)));

      await expect
        .poll(() => {
          const persisted = readManifest(root).layout;
          return persisted.type === 'split' ? persisted.ratio : 0;
        })
        .toBeCloseTo(ratio, 2);
      await expect(page.getByTestId('autosave-status')).toContainText('已保存', {
        timeout: 20_000,
      });
      await capture(page.getByTestId('workspace-view'), testInfo, 't5.1-layout-split.png');

      // Close the workspace cleanly so the restart does not report a stale lock.
      await closeWorkspace(page);
      await first.electronApp.close();
      first = undefined;

      // Restart with the same userData: layout, ratio and per-pane active tabs.
      second = await launchCurveApp({
        userDataDir,
        importFile: join(userDataDir, UNUSED_IMPORT),
      });
      const restorePage = second.page;
      await openRecent(restorePage, WORKSPACE_NAME, 'data-grid');
      const restoredLayout = restorePage.getByTestId('layout');
      await expect(restoredLayout).toHaveAttribute('data-layout-panes', '2');
      await expect(restorePage.getByTestId('pane')).toHaveCount(2);
      await expect(restorePage.getByTestId('split-handle')).toHaveAttribute(
        'aria-valuenow',
        String(Math.round(ratio * 100)),
      );
      await expect(pane(restorePage, 0).getByRole('tab')).toHaveCount(2);
      await expect(
        pane(restorePage, 0).getByRole('tab', { name: 'Beta', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(
        pane(restorePage, 1).getByRole('tab', { name: 'Alpha (2)', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      await capture(
        restorePage.getByTestId('workspace-view'),
        testInfo,
        't5.1-layout-restored.png',
      );
    } finally {
      await second?.electronApp.close().catch(() => undefined);
      await first?.electronApp.close().catch(() => undefined);
    }
  });

  test('layout-fallback: invalid refs and ratios restore one pane without losing views', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(180_000);
    const parent = testInfo.outputPath('layout-fallback');
    const root = join(parent, `${WORKSPACE_NAME}.cstudio`);
    const app = await launchCurveApp({
      userDataDir,
      importFile: join(userDataDir, UNUSED_IMPORT),
    });
    try {
      await expect(app.page.getByTestId('welcome')).toBeVisible();
      expect(await seedWorkspace(app.page, { dir: parent, name: WORKSPACE_NAME })).toBe(root);
      writeLayout(root, {
        type: 'pane',
        viewIds: ['viw_alpha', 'viw_missing'],
        activeViewId: 'viw_alpha',
      });
      await openRecent(app.page, WORKSPACE_NAME, 'data-grid');
      await expect(app.page.locator('.cs-warnings')).toContainText('layout was invalid');
      await expect(app.page.getByTestId('layout')).toHaveAttribute('data-layout-panes', '1');
      await expect(app.page.getByTestId('pane').getByRole('tab')).toHaveCount(3);
      await capture(app.page.getByTestId('workspace-view'), testInfo, 't5.1-layout-fallback.png');
      await dismissWarnings(app.page);

      await closeWorkspace(app.page);
      writeLayout(root, {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.1,
        first: { type: 'pane', viewIds: ['viw_alpha', 'viw_alpha_2'], activeViewId: 'viw_alpha' },
        second: { type: 'pane', viewIds: ['viw_beta'], activeViewId: 'viw_beta' },
      });
      await openRecent(app.page, WORKSPACE_NAME, 'data-grid');
      await expect(app.page.locator('.cs-warnings')).toContainText('layout was invalid');
      await expect(app.page.getByTestId('layout')).toHaveAttribute('data-layout-panes', '1');
      await expect(app.page.getByTestId('pane').getByRole('tab')).toHaveCount(3);
      expect(
        readManifest(root)
          .views.map((view) => view.id)
          .sort(),
      ).toEqual(['viw_alpha', 'viw_alpha_2', 'viw_beta']);
    } finally {
      await app.electronApp.close();
    }
  });

  test('layout-keyboard: tab cycling, Ctrl+W and 200% zoom', async ({
    page,
    electronApp,
  }, testInfo) => {
    test.setTimeout(120_000);
    const parent = testInfo.outputPath('layout-keyboard');
    const root = join(parent, `${WORKSPACE_NAME}.cstudio`);
    expect(await seedWorkspace(page, { dir: parent, name: WORKSPACE_NAME })).toBe(root);
    await openRecent(page, WORKSPACE_NAME, 'data-grid');
    await dismissWarnings(page);

    const alphaTab = pane(page, 0).getByRole('tab', { name: 'Alpha', exact: true });
    await alphaTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      pane(page, 0).getByRole('tab', { name: 'Alpha (2)', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+w');
    await expect(page.getByRole('tab', { name: 'Alpha (2)', exact: true })).toHaveCount(0);
    await expect(pane(page, 0).getByRole('tab')).toHaveCount(2);

    await pane(page, 0).getByTestId('pane-split-vertical').click();
    await expect(page.getByTestId('layout')).toHaveAttribute('data-layout-panes', '2');
    const handle = page.getByTestId('split-handle');
    await expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
    await handle.focus();
    await page.keyboard.press('ArrowDown');
    await expect(handle).toHaveAttribute('aria-valuenow', '52');
    await expect(handle).toBeFocused();

    await setZoom(electronApp, page, 2);
    const handleBox = await handle.boundingBox();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(handleBox).not.toBeNull();
    if (handleBox !== null) {
      expect(handleBox.x).toBeGreaterThanOrEqual(0);
      expect(handleBox.y).toBeGreaterThanOrEqual(0);
      expect(handleBox.x + handleBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(handleBox.y + handleBox.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await expect(pane(page, 1).getByTestId('pane-split-horizontal')).toBeVisible();
    await setZoom(electronApp, page, 1);
  });
});
