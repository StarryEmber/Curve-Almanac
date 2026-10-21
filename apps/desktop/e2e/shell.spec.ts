import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { repositoryRoot, test } from './fixtures';

import type { Page } from '@playwright/test';

/**
 * T0.4 App Shell checks (TASKS T0.4 "验证：pnpm e2e -- --grep shell"):
 * layout landmarks, keyboard operation, 200% zoom, light/dark tokens and the
 * bilingual copy. Screenshots double as the task-report evidence; per TESTPLAN
 * §8 the stable assertions are the computed tokens, not the pixels.
 */

/**
 * Waits for a freshly composed frame. The first shot after startup can capture
 * the previous (still resizing) surface, which stitches the title bar into the
 * bottom of the image on high-DPI Windows displays.
 */
async function settleFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

test.describe('T0.4 shell', () => {
  test('shell: renders the title bar, navigator, main, inspector and status bar', async ({
    page,
  }) => {
    await expect(page.getByTestId('titlebar')).toBeVisible();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('inspector')).toBeVisible();
    await expect(page.getByTestId('statusbar')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Curve Studio');
    await expect(page.getByTestId('workspace-label')).toContainText('未打开工作区');
    await expect(page.getByRole('tab', { name: '数据表' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '图表' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '样式' })).toBeVisible();
    await expect(page.getByTestId('runtime-status')).toContainText('版本');
  });

  test('shell: collapses and restores the side panels', async ({ page }) => {
    const toggle = page.getByRole('button', { name: '切换侧栏' });

    await toggle.click();
    await expect(page.getByTestId('sidebar')).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(page.getByTestId('sidebar')).toBeVisible();

    await page.getByRole('button', { name: '切换检查器' }).click();
    await expect(page.getByTestId('inspector')).toBeHidden();
  });

  test('shell: is operable with the keyboard alone', async ({ page }) => {
    // The skip link is the first tab stop, the title bar second.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: '跳到主内容' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '切换侧栏' })).toBeFocused();

    // Tabs: arrows move both focus and selection.
    await page.getByRole('tab', { name: '数据表' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '图表' })).toBeFocused();
    await expect(page.getByRole('tab', { name: '图表' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: '数据表' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Menu: Enter opens, Escape closes and returns focus to the trigger.
    const themeTrigger = page.getByRole('button', { name: '外观: 跟随系统' });
    await themeTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitemradio', { name: '浅色' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(themeTrigger).toBeFocused();

    // Dialog: Enter opens, focus lands inside, Escape closes and restores focus.
    const help = page.getByRole('button', { name: '帮助' });
    await help.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '键盘快捷键' })).toBeVisible();
    await expect(page.getByRole('button', { name: '关闭' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(help).toBeFocused();
  });

  test('shell: has no horizontal clipping at 200% zoom', async ({ page, electronApp }) => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      window?.webContents.setZoomFactor(2);
    });
    await page.waitForFunction(() => window.innerWidth < 800);

    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(viewport.width).toBeLessThanOrEqual(720);

    const horizontalOverflow = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '[data-testid="titlebar"], [data-testid="sidebar"], [data-testid="main"], [data-testid="inspector"], [data-testid="statusbar"]',
        ),
      ).map((element) => ({
        region: element.getAttribute('data-testid') ?? '',
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      })),
    );
    for (const region of horizontalOverflow) {
      expect(
        region.scrollWidth,
        `${region.region} clips horizontally at 200% zoom`,
      ).toBeLessThanOrEqual(region.clientWidth + 1);
    }

    const targets = [
      page.getByTestId('titlebar'),
      page.getByTestId('main'),
      page.getByTestId('statusbar'),
      page.getByRole('button', { name: '切换侧栏' }),
      page.getByRole('button', { name: '切换检查器' }),
      page.getByRole('button', { name: '帮助' }),
      page.getByRole('tab', { name: '数据表' }),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    }

    // The welcome actions remain reachable and open the T2.1 dialog.
    await expect(page.getByRole('button', { name: '新建工作区' })).toBeVisible();
    await page.getByRole('button', { name: '新建工作区' }).click();
    await expect(page.getByRole('dialog', { name: '新建工作区' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('shell: switches light/dark tokens and captures both baselines', async ({ page }) => {
    const readTokens = () =>
      page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        return {
          theme: document.documentElement.getAttribute('data-theme'),
          scheme: styles.colorScheme,
          canvas: styles.getPropertyValue('--cs-color-bg-canvas').trim(),
          foreground: styles.getPropertyValue('--cs-color-fg-default').trim(),
          bodyBackground: getComputedStyle(document.body).backgroundColor,
        };
      });

    const light = await readTokens();
    expect(light.theme).toBe('light');
    expect(light.canvas).toBe('#f2f5f9');
    expect(light.scheme).toBe('light');

    const screenshotDirectory = join(repositoryRoot, 'docs', 'reports', 'm0');
    mkdirSync(screenshotDirectory, { recursive: true });
    const lightPath = join(screenshotDirectory, 't0.4-shell-light.png');
    const darkPath = join(screenshotDirectory, 't0.4-shell-dark.png');
    await settleFrame(page);
    await page.screenshot({ path: lightPath });

    await page.getByRole('button', { name: '外观: 跟随系统' }).click();
    await page.getByRole('menuitemradio', { name: '深色' }).click();

    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('dark');
    const dark = await readTokens();
    expect(dark.canvas).toBe('#11161d');
    expect(dark.foreground).toBe('#e7edf5');
    expect(dark.scheme).toBe('dark');
    expect(dark.bodyBackground).not.toBe(light.bodyBackground);
    await settleFrame(page);
    await page.screenshot({ path: darkPath });

    const lightBytes = readFileSync(lightPath);
    const darkBytes = readFileSync(darkPath);
    expect(lightBytes.byteLength).toBeGreaterThan(5_000);
    expect(darkBytes.byteLength).toBeGreaterThan(5_000);
    expect(lightBytes.equals(darkBytes)).toBe(false);

    // The choice survives a reload (localStorage + pre-paint layout effect).
    await page.reload();
    await expect(page.getByTestId('titlebar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
      'dark',
    );
  });

  test('shell: switches every visible string to en-US', async ({ page }) => {
    await page.getByLabel('语言').selectOption('en-US');

    await expect(page.getByRole('tab', { name: 'Tables' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Charts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
    await expect(page.getByTestId('workspace-label')).toContainText('No workspace open');
    await expect(page.getByTestId('runtime-status')).toContainText('Version');
    await expect(page.getByTestId('workspace-status')).toContainText('Workspace: None');
    await expect(page.getByRole('heading', { name: 'Start from a workspace' })).toBeVisible();

    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/\b(?:shell|theme|language|error)\.[A-Za-z]/);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en-US');
  });
});
