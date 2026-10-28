/**
 * T5.3 — autosave, manual save, exit flush, save failure/retry and recent list.
 *
 * TESTPLAN E8 1/4/5 plus the recent-list acceptance item. The force-kill and
 * lock/manifest recovery cases live in `recovery.spec.ts`.
 */

import { chmodSync, mkdirSync, readFileSync, statSync } from 'node:fs';
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

import type { SimpleSeed } from './workspace-seed';
import type { Page } from '@playwright/test';

async function closeWorkspace(page: Page): Promise<void> {
  await page.getByRole('button', { name: '关闭工作区' }).click();
  await expect(page.getByTestId('welcome')).toBeVisible();
}

/**
 * Making the table file read-only (Windows) or its directory read-only (POSIX)
 * makes the atomic-replace fail without touching the in-memory document. This
 * is the TESTPLAN E8 step 5 "read-only directory" scenario.
 */
function makeTableUnwritable(seed: SimpleSeed): number {
  const original = statSync(seed.jsonlPath).mode & 0o777;
  if (process.platform === 'win32') {
    chmodSync(seed.jsonlPath, 0o444);
  } else {
    chmodSync(join(seed.root, 'tables'), 0o555);
  }
  return original;
}

function makeTableWritable(seed: SimpleSeed, original: number): void {
  if (process.platform === 'win32') {
    chmodSync(seed.jsonlPath, original === 0 ? 0o666 : original);
  } else {
    chmodSync(join(seed.root, 'tables'), 0o755);
  }
}

test.describe('T5.3 autosave and recent workspaces', () => {
  test('autosave-debounce-and-ctrl-s: waits for the 1.5s window and manual save bypasses it', async ({
    page,
  }, testInfo) => {
    const seed = await seedSimpleWorkspace(page, testInfo.outputPath('autosave'), 'Autosave Demo');
    await openRecentWorkspace(page, 'Autosave Demo');
    await expectWorkspaceOpen(page);

    await editCell(page, 0, 1, '111');
    // The window is 1.5s, so the status is "saving" long before the write.
    await expect(page.getByTestId('autosave-status')).toContainText('保存中');
    await expect
      .poll(() => readFileSync(seed.jsonlPath, 'utf8'), { timeout: 10_000 })
      .toContain(',111]');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');

    // Ctrl+S must write before the debounce timer would (1500ms).
    await editCell(page, 0, 1, '222');
    await page.keyboard.press('Control+s');
    await expect
      .poll(() => readFileSync(seed.jsonlPath, 'utf8'), { timeout: 1_400 })
      .toContain(',222]');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');

    await capture(page, testInfo, 't5.3-autosave-status.png');
  });

  test('autosave-quit-flush: quitting inside the debounce window still saves and unlocks', async ({
    userDataDir,
  }) => {
    test.setTimeout(150_000);
    const parent = join(userDataDir, 'quit-flush');
    mkdirSync(parent, { recursive: true });
    const importFile = join(userDataDir, 'unused.json');

    let first: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let second: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    try {
      first = await launchCurveApp({ userDataDir, importFile });
      const seed = await seedSimpleWorkspace(first.page, parent, 'Quit Flush');
      await openRecentWorkspace(first.page, 'Quit Flush');
      await expectWorkspaceOpen(first.page);

      await editCell(first.page, 1, 1, '444');
      // Quit immediately: the 1.5s autosave timer has not fired yet.
      await first.electronApp.evaluate(({ app }) => app.quit()).catch(() => undefined);
      await waitForExit(first.electronApp);
      await first.electronApp.close().catch(() => undefined);
      first = undefined;

      second = await launchCurveApp({ userDataDir, importFile });
      await openRecentWorkspace(second.page, 'Quit Flush');
      // A clean exit removes the lock, so no recovery prompt appears.
      await expect(second.page.getByRole('dialog', { name: '上次未正常退出' })).toHaveCount(0);
      await expectWorkspaceOpen(second.page);
      await expect(second.page.getByTestId('grid-cell-1-1')).toHaveText('444');
      await expect.poll(() => readFileSync(seed.jsonlPath, 'utf8')).toContain(',444]');
      await closeWorkspace(second.page);
    } finally {
      await second?.electronApp.close().catch(() => undefined);
      await first?.electronApp.close().catch(() => undefined);
    }
  });

  test('autosave-failure-retry: a write failure is visible, keeps memory data and retries', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(150_000);
    const parent = join(userDataDir, 'failure');
    mkdirSync(parent, { recursive: true });

    let app: Awaited<ReturnType<typeof launchCurveApp>> | undefined;
    let originalMode: number | undefined;
    let seed: SimpleSeed | undefined;
    try {
      // The quit confirmation is answered by the E2E stub so the test can
      // assert that cancelling keeps the application open.
      app = await launchCurveApp({
        userDataDir,
        importFile: join(userDataDir, 'unused.json'),
        quitConfirm: 'cancel',
      });
      seed = await seedSimpleWorkspace(app.page, parent, 'Failure Demo');
      await openRecentWorkspace(app.page, 'Failure Demo');
      await expectWorkspaceOpen(app.page);

      originalMode = makeTableUnwritable(seed);
      await editCell(app.page, 0, 1, '777');
      // The committed value stays in memory while the queue reports failure.
      await expect(app.page.getByTestId('grid-cell-0-1')).toHaveText('777');
      await expect(app.page.getByTestId('autosave-status')).toContainText('保存失败', {
        timeout: 10_000,
      });
      await capture(app.page, testInfo, 't5.3-save-failure.png');

      // Quitting while dirty asks for confirmation; "cancel" keeps the window.
      await app.electronApp
        .evaluate(({ app: electronApp }) => electronApp.quit())
        .catch(() => undefined);
      await expect
        .poll(
          () =>
            app?.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
          { timeout: 10_000 },
        )
        .toBe(1);
      await expect(app.page.getByTestId('autosave-status')).toContainText('保存失败');

      makeTableWritable(seed, originalMode);
      originalMode = undefined;
      await app.page.getByTestId('autosave-status').getByRole('button', { name: '重试' }).click();
      await expect(app.page.getByTestId('autosave-status')).toContainText('已保存', {
        timeout: 10_000,
      });
      await expect.poll(() => readFileSync(seed?.jsonlPath ?? '', 'utf8')).toContain(',777]');

      await app.page.getByRole('button', { name: '关闭工作区' }).click();
      await expect(app.page.getByTestId('welcome')).toBeVisible();
      await app.electronApp
        .evaluate(({ app: electronApp }) => electronApp.quit())
        .catch(() => undefined);
      await waitForExit(app.electronApp);
      await app.electronApp.close().catch(() => undefined);
      app = undefined;
    } finally {
      if (seed !== undefined && originalMode !== undefined) {
        makeTableWritable(seed, originalMode);
      }
      await app?.electronApp.close().catch(() => undefined);
    }
  });

  test('autosave-recent-list: remove one entry and clear all, persisted across reloads', async ({
    page,
  }, testInfo) => {
    const parent = testInfo.outputPath('recent');
    await seedSimpleWorkspace(page, parent, 'Recent One');
    await seedSimpleWorkspace(page, parent, 'Recent Two');

    await page.reload();
    await expect(page.getByTestId('recent-workspace')).toHaveCount(2);

    await page.getByTestId('recent-remove').first().click();
    await expect(page.getByTestId('recent-workspace')).toHaveCount(1);
    await expect(page.getByTestId('recent-workspace')).toContainText('Recent One');

    await page.getByTestId('recent-clear').click();
    await expect(page.getByTestId('recent-workspace')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('recent-workspace')).toHaveCount(0);
  });
});
