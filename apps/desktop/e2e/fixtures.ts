import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron, test as base } from '@playwright/test';

import { IMPORT_FIXTURE_DIR } from './import-fixtures';

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

/**
 * Builds the environment shared by every E2E launch. `CURVE_E2E_USER_DATA`
 * keeps window state, logs and the recent list inside the per-test scratch
 * directory; the other variables redirect the dialog stand-ins.
 */
function buildLaunchEnvironment(
  userDataDir: string,
  importFile: string,
  saveFile?: string,
  quitConfirm?: 'quit' | 'cancel',
): Record<string, string> {
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
  // T2.5 file stand-ins: one selected import file and one export target.
  env['CURVE_E2E_IMPORT'] = importFile;
  env['CURVE_E2E_SAVE'] = saveFile ?? join(userDataDir, 'import-errors.csv');
  // T5.3: answer the quit-time confirmation without a native modal.
  if (quitConfirm !== undefined) {
    env['CURVE_E2E_QUIT_CONFIRM'] = quitConfirm;
  }
  return env;
}

function electronLaunchArgs(): string[] {
  const args = [desktopAppDir];
  if (DISABLE_CHROMIUM_SANDBOX) {
    args.push('--no-sandbox');
  }
  return args;
}

export interface LaunchCurveAppOptions {
  /** Isolated userData directory; reuse the same path to simulate a restart. */
  userDataDir: string;
  /** Absolute path returned by the E2E import fixture generator. */
  importFile: string;
  /** Optional export target; defaults to `<userDataDir>/import-errors.csv`. */
  saveFile?: string;
  /** T5.3: answer the quit-time confirmation instead of showing a native modal. */
  quitConfirm?: 'quit' | 'cancel';
}

export interface LaunchedCurveApp {
  electronApp: ElectronApplication;
  page: Page;
  /** Wall-clock timestamp captured immediately before `_electron.launch`. */
  launchStartedAt: number;
}

/**
 * Launches the built app outside the `appLaunch` fixture.
 *
 * The M2 acceptance demo must quit Electron and start it again with the same
 * userData directory, which the single-launch fixture cannot express. Tracing
 * stays with the fixture; restart-flow callers attach their own screenshots.
 */
export async function launchCurveApp(options: LaunchCurveAppOptions): Promise<LaunchedCurveApp> {
  const env = buildLaunchEnvironment(
    options.userDataDir,
    options.importFile,
    options.saveFile,
    options.quitConfirm,
  );
  const launchStartedAt = Date.now();
  const electronApp = await electron.launch({
    executablePath: resolveElectronExecutable(),
    args: electronLaunchArgs(),
    cwd: desktopAppDir,
    env,
  });
  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { electronApp, page, launchStartedAt };
}

export interface AppLaunch {
  electronApp: ElectronApplication;
  /** Wall-clock timestamp captured immediately before `_electron.launch`. */
  launchStartedAt: number;
}

export interface AppFixtures {
  userDataDir: string;
  /** T2.7: exposes the launch timestamp for the cold-start measurement. */
  appLaunch: AppLaunch;
  electronApp: ElectronApplication;
  page: Page;
}

export interface WorkerFixtures {
  /** Generated import files shared by every test in this worker. */
  importDir: string;
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
export const test = base.extend<AppFixtures & { importFile: string }, WorkerFixtures>({
  importFile: ['points.json', { option: true }],

  importDir: [
    async ({}, provide) => {
      await provide(IMPORT_FIXTURE_DIR);
    },
    { scope: 'worker' },
  ],

  userDataDir: async ({}, provide) => {
    mkdirSync(E2E_SCRATCH_DIR, { recursive: true });
    const directory = mkdtempSync(join(E2E_SCRATCH_DIR, 'run-'));
    await provide(directory);
    rmSync(directory, { recursive: true, force: true });
  },

  appLaunch: async ({ userDataDir, importDir, importFile }, provide, testInfo) => {
    const env = buildLaunchEnvironment(userDataDir, join(importDir, importFile));
    const launchStartedAt = Date.now();
    const electronApp = await electron.launch({
      executablePath: resolveElectronExecutable(),
      args: electronLaunchArgs(),
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

    await provide({ electronApp, launchStartedAt });

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

  electronApp: async ({ appLaunch }, provide) => {
    await provide(appLaunch.electronApp);
  },

  page: async ({ electronApp }, provide) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await provide(page);
  },
});
