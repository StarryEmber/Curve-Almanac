/**
 * T5.5 — application settings and internationalisation.
 *
 * Covers the settings dialog (theme, language, autosave, default style),
 * `userData/settings.json` persistence across a restart, the autosave-off
 * Save / Discard / Cancel prompt for both workspace close and quit, and a
 * pseudo-localised (+30% copy) 200% zoom layout smoke test.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { launchCurveApp, test } from './fixtures';
import {
  capture,
  editCell,
  expectWorkspaceOpen,
  openRecentWorkspace,
  seedSimpleWorkspace,
  waitForExit,
} from './workspace-seed';

import type { AppSettings } from '../src/shared/contracts/settings';
import type { Page } from '@playwright/test';

const AUTOSAVE_OFF: AppSettings = {
  version: 1,
  theme: 'system',
  locale: 'zh-CN',
  autosave: false,
  defaultTableStyleId: 'builtin.report-light',
};

function settingsPath(userDataDir: string): string {
  return join(userDataDir, 'settings.json');
}

function writeSettings(userDataDir: string, settings: AppSettings): void {
  writeFileSync(settingsPath(userDataDir), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

function readSettings(userDataDir: string): AppSettings | null {
  try {
    return JSON.parse(readFileSync(settingsPath(userDataDir), 'utf8')) as AppSettings;
  } catch {
    return null;
  }
}

async function setZoom200(
  electronApp: Awaited<ReturnType<typeof launchCurveApp>>['electronApp'],
  page: Page,
): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(2);
  });
  await page.waitForFunction(() => window.innerWidth < 800);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
}

test.describe('T5.5 settings and i18n', () => {
  test('settings-persist: language, theme and autosave survive a restart', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(120_000);
    const parent = join(userDataDir, 'settings-persist');
    mkdirSync(parent, { recursive: true });
    const importFile = join(userDataDir, 'unused.json');

    let first: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let second: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    try {
      first = await launchCurveApp({ userDataDir, importFile });
      await openSettings(first.page);
      await expect(first.page.getByRole('dialog', { name: '设置' })).toBeVisible();

      await first.page.getByTestId('settings-language').selectOption('en-US');
      await expect(first.page.getByRole('dialog', { name: 'Settings' })).toBeVisible();

      await first.page.getByTestId('settings-theme').selectOption('dark');
      await expect
        .poll(() => first?.page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe('dark');

      await first.page.getByTestId('settings-autosave').selectOption('off');
      await expect
        .poll(() => readSettings(userDataDir))
        .toMatchObject({ locale: 'en-US', theme: 'dark', autosave: false });

      await capture(first.page, testInfo, 't5.5-settings-dialog.png');

      await first.page.getByTestId('settings-close').click();
      await expect(first.page.getByTestId('settings-dialog')).toHaveCount(0);
      await first.electronApp.close();
      first = undefined;

      second = await launchCurveApp({ userDataDir, importFile });
      await expect(second.page.locator('html')).toHaveAttribute('lang', 'en-US');
      await expect
        .poll(() =>
          second?.page.evaluate(() => document.documentElement.getAttribute('data-theme')),
        )
        .toBe('dark');
      // Let the restored window settle before taking evidence (the first frame
      // after a relaunch can still show the previous surface).
      await second.page.waitForTimeout(500);
      await capture(second.page, testInfo, 't5.5-settings-restored.png');

      await openSettings(second.page);
      await expect(second.page.getByTestId('settings-language')).toHaveValue('en-US');
      await expect(second.page.getByTestId('settings-theme')).toHaveValue('dark');
      await expect(second.page.getByTestId('settings-autosave')).toHaveValue('off');
      await expect(second.page.getByTestId('settings-close')).toHaveText('Close');
    } finally {
      await second?.electronApp.close().catch(() => undefined);
      await first?.electronApp.close().catch(() => undefined);
    }
  });

  test('settings-autosave-off-close: Save / Discard / Cancel on workspace close', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(150_000);
    const parent = join(userDataDir, 'autosave-off');
    mkdirSync(parent, { recursive: true });
    const importFile = join(userDataDir, 'unused.json');
    writeSettings(userDataDir, AUTOSAVE_OFF);

    let app: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    try {
      app = await launchCurveApp({ userDataDir, importFile });
      const seed = await seedSimpleWorkspace(app.page, parent, 'Autosave Off');
      await openRecentWorkspace(app.page, 'Autosave Off');
      await expectWorkspaceOpen(app.page);

      await editCell(app.page, 0, 1, '999');
      await expect(app.page.getByTestId('autosave-status')).toContainText('有未保存修改');
      // Autosave is off: no timer may write this value.
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      expect(readFileSync(seed.jsonlPath, 'utf8')).not.toContain(',999]');

      await app.page.getByRole('button', { name: '关闭工作区' }).click();
      await expect(app.page.getByRole('dialog', { name: '有未保存的修改' })).toBeVisible();
      await capture(app.page, testInfo, 't5.5-unsaved-close.png');
      await app.page.getByRole('button', { name: '取消' }).click();
      await expect(app.page.getByRole('dialog', { name: '有未保存的修改' })).toHaveCount(0);
      await expectWorkspaceOpen(app.page);
      expect(readFileSync(seed.jsonlPath, 'utf8')).not.toContain(',999]');

      await app.page.getByRole('button', { name: '关闭工作区' }).click();
      await app.page.getByRole('button', { name: '放弃修改' }).click();
      await expect(app.page.getByTestId('welcome')).toBeVisible();
      expect(readFileSync(seed.jsonlPath, 'utf8')).not.toContain(',999]');

      await openRecentWorkspace(app.page, 'Autosave Off');
      await expect(app.page.getByTestId('grid-cell-0-1')).toHaveText('1');

      await editCell(app.page, 0, 1, '999');
      await app.page.getByRole('button', { name: '关闭工作区' }).click();
      await app.page.getByRole('button', { name: '保存并继续' }).click();
      await expect(app.page.getByTestId('welcome')).toBeVisible();
      await expect.poll(() => readFileSync(seed.jsonlPath, 'utf8')).toContain(',999]');

      await openRecentWorkspace(app.page, 'Autosave Off');
      await expect(app.page.getByTestId('grid-cell-0-1')).toHaveText('999');
    } finally {
      await app?.electronApp.close().catch(() => undefined);
    }
  });

  test('settings-autosave-off-quit: cancel keeps the window, save then quits', async ({
    userDataDir,
  }) => {
    test.setTimeout(150_000);
    const parent = join(userDataDir, 'autosave-quit');
    mkdirSync(parent, { recursive: true });
    const importFile = join(userDataDir, 'unused.json');
    writeSettings(userDataDir, AUTOSAVE_OFF);

    let app: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let restarted: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    try {
      app = await launchCurveApp({ userDataDir, importFile });
      const seed = await seedSimpleWorkspace(app.page, parent, 'Quit Off');
      await openRecentWorkspace(app.page, 'Quit Off');
      await expectWorkspaceOpen(app.page);

      await editCell(app.page, 1, 1, '555');
      await app.electronApp
        .evaluate(({ app: electronApp }) => electronApp.quit())
        .catch(() => undefined);
      await expect(app.page.getByRole('dialog', { name: '有未保存的修改' })).toBeVisible();
      await app.page.getByRole('button', { name: '取消' }).click();
      await expect(app.page.getByRole('dialog', { name: '有未保存的修改' })).toHaveCount(0);
      await expect
        .poll(() =>
          app?.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
        )
        .toBe(1);
      expect(readFileSync(seed.jsonlPath, 'utf8')).not.toContain(',555]');

      await app.electronApp
        .evaluate(({ app: electronApp }) => electronApp.quit())
        .catch(() => undefined);
      await expect(app.page.getByRole('dialog', { name: '有未保存的修改' })).toBeVisible();
      await app.page.getByRole('button', { name: '保存并继续' }).click();
      await waitForExit(app.electronApp);
      await app.electronApp.close().catch(() => undefined);
      app = undefined;

      await expect.poll(() => readFileSync(seed.jsonlPath, 'utf8')).toContain(',555]');

      restarted = await launchCurveApp({ userDataDir, importFile });
      await openRecentWorkspace(restarted.page, 'Quit Off');
      await expect(restarted.page.getByRole('dialog', { name: '上次未正常退出' })).toHaveCount(0);
      await expect(restarted.page.getByTestId('grid-cell-1-1')).toHaveText('555');
    } finally {
      await restarted?.electronApp.close().catch(() => undefined);
      await app?.electronApp.close().catch(() => undefined);
    }
  });

  test('settings-i18n-layout: +30% copy stays inside the viewport at 200% zoom', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(120_000);
    const importFile = join(userDataDir, 'unused.json');
    let app: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    try {
      app = await launchCurveApp({ userDataDir, importFile });
      await openSettings(app.page);
      await app.page.getByTestId('settings-language').selectOption('en-US');
      await app.page.getByTestId('settings-close').click();
      await setZoom200(app.electronApp, app.page);
      await openSettings(app.page);

      // Pseudo-localisation: append 30% of every visible text node's own copy.
      await app.page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node instanceof Text && !node.parentElement?.closest('script,style')) {
            nodes.push(node);
          }
        }
        for (const node of nodes) {
          const text = node.textContent ?? '';
          if (text.trim().length === 0) {
            continue;
          }
          const extra = text.slice(0, Math.ceil(text.length * 0.3));
          node.textContent = `${text}${extra}`;
        }
      });

      const overflow = await app.page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const dialog = app.page.getByTestId('settings-dialog');
      await expect(dialog).toBeVisible();
      // The panel itself must fit; its body may scroll vertically when copy
      // grows, but it must not be clipped horizontally or leave the viewport.
      const panel = app.page.locator('[role="dialog"]');
      const box = await panel.boundingBox();
      const panelOverflow = await panel.evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      expect(panelOverflow.scrollWidth).toBeLessThanOrEqual(panelOverflow.clientWidth + 1);
      const viewport = await app.page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      expect(box).not.toBeNull();
      if (box !== null) {
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.y).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      }

      await capture(app.page, testInfo, 't5.5-settings-200.png');
    } finally {
      await app?.electronApp.close().catch(() => undefined);
    }
  });
});
