/**
 * T5.4 — keyboard map, command palette and shortcut safety (SPEC §13.4).
 *
 * Three scenarios:
 *  1. Ctrl+K palette → filter a layout command → run → recent-first ordering →
 *     run undo from the palette.
 *  2. Each editor keeps native keys: Ctrl+K in a cell editor is not hijacked,
 *     an unavailable command shows its reason, Ctrl+V in the palette is native,
 *     and the documented split shortcut still works outside the palette.
 *  3. Palette keyboard/home/end, 200% zoom bounds and the shell toggle command.
 */

import { expect } from '@playwright/test';

import { test } from './fixtures';
import {
  expectWorkspaceOpen,
  openRecentWorkspace,
  seedSimpleWorkspace,
  zoomToNarrowLayout,
} from './workspace-seed';

import type { Page, TestInfo } from '@playwright/test';

const WORKSPACE_NAME = 'Palette Demo';

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path });
  await testInfo.attach(name.replace(/\.png$/u, ''), { path, contentType: 'image/png' });
}

async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible();
  await expect(page.getByTestId('command-palette-input')).toBeFocused();
}

async function closePalette(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '命令面板' })).toHaveCount(0);
}

async function seed(page: Page, testInfo: TestInfo): Promise<void> {
  await seedSimpleWorkspace(page, testInfo.outputPath('palette'), WORKSPACE_NAME);
  await openRecentWorkspace(page, WORKSPACE_NAME);
  await expectWorkspaceOpen(page);
}

test.describe('T5.4 command palette', () => {
  test('palette-runs-commands: filter, execute, recent ordering and undo', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await seed(page, testInfo);

    const layout = page.getByTestId('layout');
    await expect(layout).toHaveAttribute('data-layout-panes', '1');

    await openPalette(page);
    const input = page.getByTestId('command-palette-input');
    await input.fill('分栏');

    const horizontal = page
      .getByTestId('command-palette-list')
      .getByRole('option', { name: /水平分栏/ });
    await expect(horizontal).toBeVisible();
    await expect(horizontal).toContainText('Ctrl+Alt+H');
    await expect(
      page.getByTestId('command-palette-list').getByRole('option', { name: /垂直分栏/ }),
    ).toBeVisible();
    await capture(page, testInfo, 't5.4-palette-search.png');

    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '命令面板' })).toHaveCount(0);
    await expect(layout).toHaveAttribute('data-layout-panes', '2');

    // The executed command becomes the first entry and is marked as recent.
    await openPalette(page);
    const firstOption = page.getByTestId('command-palette-list').getByRole('option').first();
    await expect(firstOption).toHaveAttribute('data-command-id', 'layout.splitHorizontal');
    await expect(firstOption).toHaveAttribute('data-command-recent', 'true');
    await closePalette(page);

    // Undo through the palette restores the single pane.
    await openPalette(page);
    await page.getByTestId('command-palette-input').fill('撤销');
    await expect(
      page.getByTestId('command-palette-list').getByRole('option', { name: /撤销/ }),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(layout).toHaveAttribute('data-layout-panes', '1');
    await expect(page.getByTestId('history-menu')).toHaveAttribute('data-undo-depth', '0');
  });

  test('palette-editor-safety: inputs keep Ctrl+K/Ctrl+V and disabled reasons', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await seed(page, testInfo);

    const layout = page.getByTestId('layout');

    // The cell editor owns the keyboard: Ctrl+K must not open the palette.
    await page.getByTestId('grid-cell-0-0').click();
    await page.bringToFront().catch(() => undefined);
    await page.keyboard.press('F2');
    if (
      !(await page
        .getByTestId('cell-editor')
        .isVisible()
        .catch(() => false))
    ) {
      await page.getByTestId('grid-cell-0-0').dblclick();
    }
    await expect(page.getByTestId('cell-editor')).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: '命令面板' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('cell-editor')).toHaveCount(0);

    // F1 opens the shortcut help; the command table is generated from the registry.
    await page.keyboard.press('F1');
    const help = page.getByRole('dialog', { name: '键盘快捷键' });
    await expect(help).toBeVisible();
    await expect(help).toContainText('命令与快捷键');
    await expect(help).toContainText('水平分栏');
    await expect(help).toContainText('Ctrl+Alt+H');
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);

    // A table view cannot duplicate a chart: the palette explains why.
    await openPalette(page);
    const input = page.getByTestId('command-palette-input');
    await input.fill('复制当前图表');
    const disabled = page
      .getByTestId('command-palette-list')
      .getByRole('option', { name: /复制当前图表/ });
    await expect(disabled).toBeVisible();
    await expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await expect(disabled).toContainText('当前视图不是图表');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible();
    await capture(page, testInfo, 't5.4-palette-disabled.png');

    // Ctrl+V inside the palette input stays native and never runs a command.
    await input.fill('水平');
    await page.keyboard.press('Control+v');
    await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible();
    await expect(layout).toHaveAttribute('data-layout-panes', '1');
    await closePalette(page);

    // The registry shortcut works outside the palette and is undoable.
    await page.keyboard.press('Control+Alt+h');
    await expect(layout).toHaveAttribute('data-layout-panes', '2');
    await page.keyboard.press('Control+z');
    await expect(layout).toHaveAttribute('data-layout-panes', '1');

    // Grid-scope duplicate: Ctrl/Cmd+Shift+D duplicates the active table view.
    const tabCount = await page.getByRole('tab').count();
    await page.keyboard.press('Control+Shift+d');
    await expect.poll(() => page.getByRole('tab').count()).toBe(tabCount + 1);
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.getByRole('tab').count()).toBe(tabCount);
  });

  test('palette-keyboard-200: arrows, empty state, shell command and zoom bounds', async ({
    electronApp,
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await seed(page, testInfo);

    await zoomToNarrowLayout(electronApp, page);

    await page.getByTestId('grid-cell-0-0').click();
    await openPalette(page);

    const input = page.getByTestId('command-palette-input');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const activeId = await input.getAttribute('aria-activedescendant');
    expect(activeId).not.toBeNull();

    await page.keyboard.press('End');
    const endId = await input.getAttribute('aria-activedescendant');
    expect(endId).not.toBe(activeId);

    await input.fill('zzzz');
    await expect(page.getByTestId('command-palette').getByRole('status')).toContainText(
      '没有匹配的命令',
    );
    await capture(page, testInfo, 't5.4-palette-empty-200.png');

    await input.fill('切换侧栏');
    await expect(
      page.getByTestId('command-palette-list').getByRole('option', { name: /切换侧栏/ }),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('shell')).toHaveAttribute('data-sidebar', 'closed');

    await openPalette(page);
    const dialogBox = await page.getByRole('dialog', { name: '命令面板' }).boundingBox();
    expect(dialogBox).not.toBeNull();
    if (dialogBox !== null) {
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      expect(dialogBox.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox.y).toBeGreaterThanOrEqual(0);
      expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await closePalette(page);
  });
});
