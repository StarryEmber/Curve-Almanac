/**
 * T5.3 — crash recovery (TESTPLAN E8 2–4).
 *
 * - force-kill a running app, restart and recover through the stale-lock prompt;
 * - forge stale/corrupt `.lock` files and choose "try recovery" / "open directly";
 * - corrupt `manifest.json`, refuse the rebuild (bytes unchanged) and then
 *   rebuild from `backups/manifest.*.json.bak` with the rows preserved.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

import type { CurveApi } from '../src/shared/contracts/ipc';
import type { Page } from '@playwright/test';

async function closeWorkspace(page: Page): Promise<void> {
  await page.getByRole('button', { name: '关闭工作区' }).click();
  await expect(page.getByTestId('welcome')).toBeVisible();
}

async function forceKill(app: Parameters<typeof waitForExit>[0]): Promise<void> {
  // `app.process().pid` is the launcher process; the Electron main process pid
  // is the one that owns the workspace `.lock`.
  const pid = await app.evaluate(() => process.pid);
  try {
    execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
  } catch {
    // Already gone (or taskkill raced the exit); the wait below is authoritative.
  }
}

test.describe('T5.3 crash recovery', () => {
  test('recovery-force-kill: committed data survives and the last 1.5s is warned about', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(180_000);
    const parent = join(userDataDir, 'force-kill');
    mkdirSync(parent, { recursive: true });
    const importFile = join(userDataDir, 'unused.json');

    let first: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let second: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    try {
      first = await launchCurveApp({ userDataDir, importFile });
      const seed = await seedSimpleWorkspace(first.page, parent, 'Kill Demo');
      await openRecentWorkspace(first.page, 'Kill Demo');
      await expectWorkspaceOpen(first.page);

      // 1 + 2: commit one value, wait until it is on disk, then edit again and
      // kill the process before the 1.5s autosave window elapses.
      await editCell(first.page, 0, 1, '555');
      await expect
        .poll(() => readFileSync(seed.jsonlPath, 'utf8'), { timeout: 10_000 })
        .toContain(',555]');
      await editCell(first.page, 0, 1, '999');
      await forceKill(first.electronApp);
      await waitForExit(first.electronApp);
      // A forced kill cannot run the quit guard: the lock and the last edit stay
      // on disk, which is exactly what the recovery prompt is for.
      expect(existsSync(join(seed.root, '.lock'))).toBe(true);
      await first.electronApp.close().catch(() => undefined);
      first = undefined;

      // 3: the next launch offers the recovery choice.
      second = await launchCurveApp({ userDataDir, importFile });
      const inspection = await second.page.evaluate(
        (dir) => (globalThis as unknown as { api: CurveApi }).api.workspace.inspect({ dir }),
        seed.root,
      );
      expect(inspection).toMatchObject({ ok: true, data: { lock: 'stale' } });
      await openRecentWorkspace(second.page, 'Kill Demo');
      const dialog = second.page.getByRole('dialog', { name: '上次未正常退出' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('最后 1.5 秒内尚未落盘的修改可能已丢失');
      await capture(second.page, testInfo, 't5.3-recovery-stale-lock.png');

      await dialog.getByRole('button', { name: '尝试恢复' }).click();
      await expectWorkspaceOpen(second.page);
      await expect(second.page.locator('.cs-warnings')).toContainText('stale lock');
      // 4: data committed before the kill is intact; the last edit may be lost.
      await expect(second.page.getByTestId('grid-cell-0-1')).toHaveText('555');
      await closeWorkspace(second.page);
    } finally {
      await second?.electronApp.close().catch(() => undefined);
      await first?.electronApp.close().catch(() => undefined);
    }
  });

  test('recovery-lock-choices: stale and corrupt locks offer recovery and direct open', async ({
    page,
  }, testInfo) => {
    const seed = await seedSimpleWorkspace(page, testInfo.outputPath('locks'), 'Lock Demo');
    const lockPath = join(seed.root, '.lock');

    // A stale lock (dead pid + 2020 timestamp) → "try recovery" or "direct open".
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        pid: 999_999,
        startedAt: '2020-01-01T00:00:00.000Z',
        appVersion: '0.1.0',
      })}\n`,
    );
    await openRecentWorkspace(page, 'Lock Demo');
    const staleDialog = page.getByRole('dialog', { name: '上次未正常退出' });
    await expect(staleDialog).toBeVisible();
    await capture(page, testInfo, 't5.3-recovery-lock-choices.png');
    await staleDialog.getByRole('button', { name: '直接打开' }).click();
    await expectWorkspaceOpen(page);
    await expect(page.locator('.cs-warnings')).toContainText('stale lock');
    await closeWorkspace(page);

    // A corrupt (unreadable) lock also goes through the recovery prompt.
    writeFileSync(lockPath, 'not a lock document\n');
    await page.getByTestId('recent-workspace').filter({ hasText: 'Lock Demo' }).first().click();
    const corruptDialog = page.getByRole('dialog', { name: '上次未正常退出' });
    await expect(corruptDialog).toBeVisible();
    await corruptDialog.getByRole('button', { name: '尝试恢复' }).click();
    await expectWorkspaceOpen(page);
    await expect(page.locator('.cs-warnings')).toContainText('unreadable');
    await closeWorkspace(page);
  });

  test('recovery-keyboard: the recovery dialog is keyboard operable at 200% zoom', async ({
    page,
    electronApp,
  }, testInfo) => {
    const seed = await seedSimpleWorkspace(page, testInfo.outputPath('zoom'), 'Zoom Demo');
    writeFileSync(
      join(seed.root, '.lock'),
      `${JSON.stringify({
        pid: 999_999,
        startedAt: '2020-01-01T00:00:00.000Z',
        appVersion: '0.1.0',
      })}\n`,
    );

    await electronApp.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      window?.webContents.setZoomFactor(2);
    });
    await page.waitForFunction(() => window.innerWidth < 800);

    await openRecentWorkspace(page, 'Zoom Demo');
    const dialog = page.getByRole('dialog', { name: '上次未正常退出' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (box !== null) {
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }

    // Escape closes the dialog without opening the workspace.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('welcome')).toBeVisible();

    // Pure keyboard: close (initial focus) → Cancel → Open directly → Try
    // recovery → Enter.
    await page.getByTestId('recent-workspace').filter({ hasText: 'Zoom Demo' }).first().click();
    await expect(dialog).toBeVisible();
    const tryButton = dialog.getByRole('button', { name: '尝试恢复' });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(tryButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expectWorkspaceOpen(page);
    await closeWorkspace(page);
  });

  test('recovery-manifest-backup: cancel keeps the corrupt bytes, rebuild restores every row', async ({
    page,
  }, testInfo) => {
    const seed = await seedSimpleWorkspace(page, testInfo.outputPath('manifest'), 'Backup Demo');
    const backupNames = readdirSync(join(seed.root, 'backups')).filter((name) =>
      /^manifest\..*\.json\.bak$/.test(name),
    );
    expect(backupNames.length).toBeGreaterThan(0);

    writeFileSync(seed.manifestPath, '{"formatVersion":1,"tables":[');
    const corrupt = readFileSync(seed.manifestPath);

    await openRecentWorkspace(page, 'Backup Demo');
    const dialog = page.getByRole('dialog', { name: '工作区清单已损坏' });
    await expect(dialog).toBeVisible();
    const select = dialog.getByTestId('recovery-backup-select');
    await expect(select.locator('option')).toHaveCount(backupNames.length);
    await capture(page, testInfo, 't5.3-recovery-manifest.png');

    // Refusing recovery leaves the corrupt manifest byte-for-byte untouched.
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toHaveCount(0);
    expect(readFileSync(seed.manifestPath)).toEqual(corrupt);

    await page.getByTestId('recent-workspace').filter({ hasText: 'Backup Demo' }).first().click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '使用所选备份重建' }).click();
    await expectWorkspaceOpen(page);
    await expect(page.getByTestId('grid-cell-0-0')).toHaveText('alpha');
    await expect(page.getByTestId('grid-cell-2-0')).toHaveText('gamma');

    const rebuilt = JSON.parse(readFileSync(seed.manifestPath, 'utf8')) as {
      tables: { id: string }[];
    };
    expect(rebuilt.tables.map((entry) => entry.id)).toEqual(['tbl_simple']);
    await closeWorkspace(page);
  });
});
