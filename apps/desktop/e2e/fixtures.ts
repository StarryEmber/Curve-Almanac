import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron, test as base } from '@playwright/test';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

const e2eDirectory = dirname(fileURLToPath(import.meta.url));

/** Repository root, used for report artifacts. */
export const repositoryRoot = resolve(e2eDirectory, '../../..');

/** The Electron app directory; its package.json `main` points at the build output. */
export const desktopAppDir = resolve(repositoryRoot, 'apps/desktop');

/**
 * Scratch directory for E2E userData. It lives inside the repository (and is
 * git-ignored) instead of the OS temp directory so the suite also works in
 * shells whose sandbox only allows writes under the workspace.
 */
const E2E_SCRATCH_DIR = join(desktopAppDir, 'test-results', 'e2e-user-data');

/**
 * Restricted shells (for example the agent sandbox) cannot initialise
 * Chromium's OS sandbox. Setting `CURVE_E2E_NO_SANDBOX=1` passes
 * `--no-sandbox` to Electron *for the test run only*; it never changes the
 * app's `webPreferences.sandbox` and is never read by application code.
 */
const DISABLE_CHROMIUM_SANDBOX = process.env['CURVE_E2E_NO_SANDBOX'] === '1';

function resolveElectronExecutable(): string {
  const requireFromHere = createRequire(import.meta.url);
  const electronEntry = requireFromHere.resolve('electron');
  const electronDirectory = dirname(electronEntry);
  const executableName = readFileSync(join(electronDirectory, 'path.txt'), 'utf8').trim();
  return join(electronDirectory, 'dist', executableName);
}

export interface AppFixtures {
  userDataDir: string;
  electronApp: ElectronApplication;
  page: Page;
}

type StopTracing = (path?: string) => Promise<void>;

/**
 * Keeps the failure evidence promised by `playwright.config.ts`.
 *
 * The built-in `screenshot: 'only-on-failure'` already saves `test-failed-1.png`
 * for the failing Electron test, but its built-in trace only records test steps.
 * The fixture therefore records a browser-context trace (DOM snapshots,
 * screencast, console) for every test and keeps it — attached to the report —
 * only when the test fails. Evidence collection never masks the real failure.
 */
async function captureFailureTrace(testInfo: TestInfo, stopTracing: StopTracing): Promise<void> {
  const tracePath = testInfo.outputPath('trace.zip');
  mkdirSync(dirname(tracePath), { recursive: true });
  await stopTracing(tracePath);
  if (existsSync(tracePath)) {
    await testInfo.attach('trace', { path: tracePath, contentType: 'application/zip' });
  }
}

/**
 * Launches the built app once per test with an isolated userData directory.
 * `ELECTRON_RUN_AS_NODE` must be removed or Electron starts as plain Node.
 *
 * The fixture callback is passed to the test runner positionally, so it is
 * named `provide` instead of Playwright's `use` to avoid tripping
 * react-hooks/rules-of-hooks in this non-React package.
 */
export const test = base.extend<AppFixtures>({
  userDataDir: async ({}, provide) => {
    mkdirSync(E2E_SCRATCH_DIR, { recursive: true });
    const directory = mkdtempSync(join(E2E_SCRATCH_DIR, 'run-'));
    await provide(directory);
    rmSync(directory, { recursive: true, force: true });
  },

  electronApp: async ({ userDataDir }, provide, testInfo) => {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') {
        env[key] = value;
      }
    }
    delete env['ELECTRON_RUN_AS_NODE'];
    env['CURVE_E2E'] = '1';
    env['CURVE_E2E_USER_DATA'] = userDataDir;
    // T2.1 dialog stand-in: a per-test directory the welcome page can "pick".
    const dialogDirectory = join(userDataDir, 'dialog-directory');
    mkdirSync(dialogDirectory, { recursive: true });
    env['CURVE_E2E_DIR'] = dialogDirectory;

    const args = [desktopAppDir];
    if (DISABLE_CHROMIUM_SANDBOX) {
      args.push('--no-sandbox');
    }

    const electronApp = await electron.launch({
      executablePath: resolveElectronExecutable(),
      args,
      cwd: desktopAppDir,
      env,
    });

    const context = electronApp.context();
    let tracing = false;
    let traceStopped = false;

    const stopTracing: StopTracing = async (path) => {
      if (!tracing || traceStopped) {
        return;
      }
      traceStopped = true;
      try {
        await context.tracing.stop(path === undefined ? undefined : { path });
      } catch (error) {
        // Evidence collection must never mask the real test outcome.
        await testInfo.attach('trace-error', { body: String(error), contentType: 'text/plain' });
      }
    };

    try {
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
        title: testInfo.title,
      });
      tracing = true;
    } catch (error) {
      await testInfo.attach('trace-unavailable', {
        body: String(error),
        contentType: 'text/plain',
      });
    }

    await provide(electronApp);

    const failed = testInfo.status !== testInfo.expectedStatus;
    try {
      if (failed) {
        await captureFailureTrace(testInfo, stopTracing);
      }
    } finally {
      await stopTracing();
      await electronApp.close();
    }
  },

  page: async ({ electronApp }, provide) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await provide(page);
  },
});
