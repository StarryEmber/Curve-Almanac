import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect } from '@playwright/test';

import { desktopAppDir, repositoryRoot, test } from './fixtures';

import type { CurveApi } from '../src/shared/contracts/ipc';

/**
 * TESTPLAN E1 — startup and security smoke, run against the built app
 * (`pnpm build` first). Every test starts from a fresh userData directory.
 */
test.describe('E1 startup and security', () => {
  test('E1 smoke: loads the renderer without Node globals', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(`pageerror: ${error.message}`);
    });

    expect(page.url().startsWith('file:')).toBe(true);
    await expect(page).toHaveTitle(/Curve Studio/);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Curve Studio');

    const nodeGlobals = await page.evaluate(() => ({
      require: typeof (globalThis as { require?: unknown }).require,
      process: typeof (globalThis as { process?: unknown }).process,
      module: typeof (globalThis as { module?: unknown }).module,
      buffer: typeof (globalThis as { Buffer?: unknown }).Buffer,
    }));
    expect(nodeGlobals).toEqual({
      require: 'undefined',
      process: 'undefined',
      module: 'undefined',
      buffer: 'undefined',
    });

    const info = await page.evaluate(() =>
      (globalThis as unknown as { api: CurveApi }).api.app.info(),
    );
    expect(info.ok).toBe(true);
    if (info.ok) {
      expect(info.data.version.length).toBeGreaterThan(0);
      expect(info.data.platform).toBe(process.platform);
      expect(info.data.locale.length).toBeGreaterThan(0);
    }

    await expect(page.getByTestId('runtime-status')).toContainText('Version');

    // Reload after wiring the listeners so load-time console output is covered.
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();

    expect(consoleErrors.filter((message) => !message.toLowerCase().includes('favicon'))).toEqual(
      [],
    );
  });

  test('E1 smoke: denies external navigation and popups', async ({ page, electronApp }) => {
    const initialUrl = page.url();
    const initialWindowCount = electronApp.windows().length;

    const popupOpened = page
      .waitForEvent('popup', { timeout: 1500 })
      .then(() => true)
      .catch(() => false);

    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = 'https://example.com/';
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'external';
      document.body.append(link);
      link.click();
    });

    expect(await popupOpened).toBe(false);

    await page.evaluate(() => {
      window.location.assign('https://example.com/');
    });
    await page.waitForTimeout(750);

    expect(page.url()).toBe(initialUrl);
    expect(electronApp.windows()).toHaveLength(initialWindowCount);
  });

  test('E1 smoke: ships the production CSP and blocks inline scripts', async ({ page }) => {
    const inlineScriptRan = await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'globalThis.__curveInlineScriptRan = true;';
      document.head.append(script);
      return '__curveInlineScriptRan' in globalThis;
    });
    expect(inlineScriptRan).toBe(false);

    const policy = await page.evaluate(
      () =>
        document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content') ?? null,
    );
    expect(policy).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'",
    );

    // The policy must be injected at build time so it ships with the bundle.
    const html = readFileSync(join(desktopAppDir, 'out', 'renderer', 'index.html'), 'utf8');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
  });

  test('E1 smoke: keeps DevTools closed in the built app', async ({ page, electronApp }) => {
    expect(page.url().startsWith('file:')).toBe(true);

    const rendererUrl = await electronApp.evaluate(
      () => process.env['ELECTRON_RENDERER_URL'] ?? null,
    );
    expect(rendererUrl).toBeNull();

    const state = await electronApp.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      if (!window) {
        return { found: false, opened: false };
      }
      // With `devTools: false` this must be a no-op.
      window.webContents.openDevTools({ mode: 'detach' });
      return { found: true, opened: window.webContents.isDevToolsOpened() };
    });

    expect(state.found).toBe(true);
    expect(state.opened).toBe(false);
  });

  test('E1 smoke: captures the window shell for the task report', async ({ page }) => {
    const screenshotPath = join(repositoryRoot, 'docs', 'reports', 'm0', 't0.2-window.png');
    mkdirSync(dirname(screenshotPath), { recursive: true });

    await page.screenshot({ path: screenshotPath });

    expect(readFileSync(screenshotPath).byteLength).toBeGreaterThan(0);
  });
});
