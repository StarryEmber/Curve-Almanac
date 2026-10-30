/**
 * Packaged-app smoke for T6.4 (ADR-055).
 *
 * Usage:
 *   pnpm package         # build + electron-builder (NSIS + portable)
 *   pnpm package:smoke   # this script: install → launch → workspace → uninstall
 *
 * What it proves, against the *real* Windows artifacts in `release/`:
 *   1. the NSIS installer installs per-user (no elevation) and registers itself;
 *   2. the installed app is packaged (`app.isPackaged`), reports the package.json
 *      version/productName, and creates `%APPDATA%/Curve Almanac` on first launch;
 *   3. the default new-workspace location (`Documents/Curve Almanac`) is writable
 *      through the app itself;
 *   4. uninstalling removes program files, shortcuts and the uninstall entry but
 *      keeps the user's workspace and `%APPDATA%/Curve Almanac`;
 *   5. the production bundle keeps the renderer sandbox closed (`window.require`,
 *      `window.process` absent), uses the production CSP, ignores the E2E hooks,
 *      and ships only `out/` + production `node_modules` in `app.asar`.
 *
 * Environment notes:
 * - The DSH sandbox denies writes outside the workspace to executables that live
 *   inside the workspace, which breaks the installer when it runs from
 *   `release/`. The script therefore copies the installer to `%TEMP%` first; the
 *   installed app itself runs from `%LOCALAPPDATA%` and is unrestricted.
 * - `CURVE_E2E_NO_SANDBOX=1` adds `--no-sandbox` to the launch (restricted
 *   shells cannot start Chromium's OS sandbox). It never changes webPreferences.
 * - This script is destructive by design but refuses to run when a previous
 *   Curve Almanac installation is present, so it cannot uninstall real data.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const desktopDir = join(repositoryRoot, 'apps', 'desktop');
const releaseDir = join(repositoryRoot, 'release');
const reportDir = join(repositoryRoot, 'docs', 'reports', 't6.4');
const scratchDir = join(desktopDir, 'test-results', 'package-smoke');

const APP_ID = 'com.curvealmanac.app';
const INSTALL_DIR = join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Curve Almanac');
const START_MENU_SHORTCUT = join(
  process.env['APPDATA'] ?? '',
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Curve Almanac.lnk',
);
const DESKTOP_SHORTCUT = join(homedir(), 'Desktop', 'Curve Almanac.lnk');
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

interface PackageJson {
  version: string;
  productName: string;
}

interface AsarNode {
  files?: Record<string, AsarNode>;
  offset?: string;
  size?: number;
}

interface AsarFile {
  path: string;
  size: number;
}

interface StepTiming {
  installMs: number;
  launchMs: number;
  uninstallMs: number;
}

const packageJson = JSON.parse(
  readFileSync(join(desktopDir, 'package.json'), 'utf8'),
) as PackageJson;
const { productName, version } = packageJson;
const setupPath = join(releaseDir, `${productName} Setup ${version}.exe`);
const portablePath = join(releaseDir, `${productName} ${version}.exe`);
const unpackedExe = join(releaseDir, 'win-unpacked', `${productName}.exe`);
const asarPath = join(releaseDir, 'win-unpacked', 'resources', 'app.asar');

function fail(message: string): never {
  console.error(`\n[package-smoke] FAIL: ${message}`);
  process.exit(1);
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs = 60_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  fail(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

function runFile(file: string, args: readonly string[], timeoutMs = 180_000): number {
  const result = spawnSync(file, args, {
    windowsHide: true,
    timeout: timeoutMs,
    stdio: 'ignore',
  });
  check(!result.error, `failed to run ${file}: ${result.error?.message ?? 'unknown error'}`);
  return result.status ?? -1;
}

/** `reg query ... /d` returns 0 when a matching display name exists. */
function uninstallEntryExists(): boolean {
  const result = spawnSync('reg.exe', ['query', UNINSTALL_KEY, '/s', '/f', productName, '/d'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Minimal asar reader: the JSON header starts at byte 16 (header size + padding). */
function readAsarHeader(file: string): {
  header: { files?: Record<string, AsarNode> };
  headerSize: number;
} {
  const buffer = readFileSync(file);
  const headerSize = buffer.readUInt32LE(4);
  const jsonLength = buffer.readUInt32LE(12);
  const header = JSON.parse(buffer.subarray(16, 16 + jsonLength).toString('utf8')) as {
    files?: Record<string, AsarNode>;
  };
  return { header, headerSize };
}

function readAsarFiles(file: string): AsarFile[] {
  const { header } = readAsarHeader(file);
  const files: AsarFile[] = [];
  const walk = (node: AsarNode, prefix: string): void => {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const path = prefix === '' ? name : `${prefix}/${name}`;
      if (entry.files !== undefined) {
        walk(entry, path);
      } else {
        files.push({ path, size: entry.size ?? 0 });
      }
    }
  };
  walk(header, '');
  return files;
}

/** Reads a file from the asar (header offset + 8-byte header pickle size). */
function readAsarText(file: string, entryPath: string): string {
  const { header, headerSize } = readAsarHeader(file);
  let node: AsarNode | undefined = header;
  for (const segment of entryPath.split('/')) {
    node = node?.files?.[segment];
  }
  const entryNode = node;
  if (entryNode === undefined || entryNode.offset === undefined) {
    fail(`app.asar is missing ${entryPath}`);
  }
  const offset = Number(entryNode.offset);
  const size = entryNode.size ?? 0;
  const dataBase = 8 + headerSize;
  return readFileSync(file)
    .subarray(dataBase + offset, dataBase + offset + size)
    .toString('utf8');
}

function directorySize(directory: string): number {
  let total = 0;
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    const stats = statSync(full);
    total += stats.isDirectory() ? directorySize(full) : stats.size;
  }
  return total;
}

function buildEnvironment(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && !key.startsWith('CURVE_E2E')) {
      env[key] = value;
    }
  }
  // Electron starts as plain Node when this leaks in from the harness shell.
  delete env['ELECTRON_RUN_AS_NODE'];
  return { ...env, ...extra };
}

function desktopShortcutExists(): boolean {
  const candidates = [
    DESKTOP_SHORTCUT,
    join(process.env['OneDrive'] ?? '', 'Desktop', 'Curve Almanac.lnk'),
    join(process.env['USERPROFILE'] ?? '', 'OneDrive', 'Desktop', 'Curve Almanac.lnk'),
  ].filter((candidate) => candidate.length > 0);
  return candidates.some((candidate) => existsSync(candidate));
}

function removeDirectoryIfExists(directory: string): void {
  if (existsSync(directory)) {
    rmSync(directory, { recursive: true, force: true });
  }
}

function sizeOf(file: string): number {
  return statSync(file).size;
}

async function main(): Promise<void> {
  console.log(`[package-smoke] ${productName} ${version}`);

  // ── Preconditions ──────────────────────────────────────────────────────────
  check(existsSync(setupPath), `missing installer: ${setupPath} (run \`pnpm package\`)`);
  check(existsSync(portablePath), `missing portable build: ${portablePath}`);
  check(existsSync(unpackedExe), `missing unpacked build: ${unpackedExe}`);
  check(existsSync(asarPath), `missing app.asar: ${asarPath}`);
  check(
    !existsSync(INSTALL_DIR) && !uninstallEntryExists(),
    `a previous ${productName} installation exists; uninstall it before running this smoke`,
  );

  const appDataRoot = process.env['APPDATA'] ?? '';
  const userDataDir = join(appDataRoot, productName);
  const userDataExistedBefore = existsSync(userDataDir);
  const documentsRoot = join(homedir(), 'Documents');
  const workspaceParent = join(documentsRoot, productName);
  const workspaceDir = join(workspaceParent, 'T6.4 Smoke.cstudio');
  const workspaceParentExistedBefore = existsSync(workspaceParent);
  const decoyUserData = join(scratchDir, 'decoy-user-data');
  const tempRoot = join(process.env['TEMP'] ?? scratchDir, 'curve-almanac-smoke');
  const tempInstaller = join(tempRoot, `${productName} Setup.exe`);
  const startMenuExistedBefore = existsSync(START_MENU_SHORTCUT);
  check(!startMenuExistedBefore, 'an existing Start Menu shortcut would be removed; aborting');
  const timings: StepTiming = { installMs: 0, launchMs: 0, uninstallMs: 0 };
  const metrics: Record<string, unknown> = {};

  try {
    // ── Artifact / asar inspection ───────────────────────────────────────────
    const asarFiles = readAsarFiles(asarPath);
    const asarPaths = new Set(asarFiles.map((file) => file.path));
    for (const required of [
      'out/main/index.cjs',
      'out/preload/index.cjs',
      'out/renderer/index.html',
      'package.json',
      'node_modules/write-file-atomic/lib/index.js',
      'node_modules/signal-exit/dist/cjs/index.js',
      'node_modules/electron-log/src/index.js',
    ]) {
      check(asarPaths.has(required), `app.asar is missing ${required}`);
    }
    // Production dependencies may legitimately ship `src/` (electron-log does);
    // only the app's own development folders are forbidden.
    const forbidden = asarFiles.filter(
      (file) =>
        (!file.path.startsWith('node_modules/') &&
          /(^|\/)(src|e2e|test|tests|docs|fixtures)\//.test(file.path)) ||
        file.path.endsWith('.map') ||
        file.path.startsWith('build/'),
    );
    check(
      forbidden.length === 0,
      `app.asar contains development files: ${forbidden
        .slice(0, 5)
        .map((file) => file.path)
        .join(', ')}`,
    );
    const packedPackageJson = JSON.parse(readAsarText(asarPath, 'package.json')) as PackageJson;
    check(packedPackageJson.version === version, 'packaged package.json version drift');

    // ── Install (NSIS, per user) ─────────────────────────────────────────────
    mkdirSync(tempRoot, { recursive: true });
    rmSync(tempInstaller, { force: true });
    copyFileSync(setupPath, tempInstaller);
    const installStartedAt = Date.now();
    // `/S` is NSIS' silent switch; the per-user default is chosen by nsis.perMachine=false.
    check(runFile(tempInstaller, ['/S']) === 0, 'installer exited non-zero');
    await waitFor(
      'installed executable',
      () => existsSync(join(INSTALL_DIR, `${productName}.exe`)),
      120_000,
    );
    timings.installMs = Date.now() - installStartedAt;
    await waitFor('Start Menu shortcut', () => existsSync(START_MENU_SHORTCUT));
    check(desktopShortcutExists(), 'desktop shortcut was not created');
    check(uninstallEntryExists(), 'uninstall registry entry was not created');
    const installedExe = join(INSTALL_DIR, `${productName}.exe`);
    const installedUninstaller = join(INSTALL_DIR, `Uninstall ${productName}.exe`);
    check(existsSync(installedUninstaller), 'uninstaller was not installed');

    // ── Launch the installed app with a real, first-run userData ────────────
    mkdirSync(scratchDir, { recursive: true });
    removeDirectoryIfExists(decoyUserData);
    if (!userDataExistedBefore) {
      removeDirectoryIfExists(userDataDir);
    }
    const launchStartedAt = Date.now();
    const app = await electron.launch({
      executablePath: installedExe,
      args: process.env['CURVE_E2E_NO_SANDBOX'] === '1' ? ['--no-sandbox'] : [],
      env: buildEnvironment({
        CURVE_E2E: '1',
        CURVE_E2E_USER_DATA: decoyUserData,
      }),
    });

    try {
      const info = await app.evaluate(({ app: electronApp, BrowserWindow }) => ({
        isPackaged: electronApp.isPackaged,
        name: electronApp.getName(),
        version: electronApp.getVersion(),
        userData: electronApp.getPath('userData'),
        documents: electronApp.getPath('documents'),
        appPath: electronApp.getAppPath(),
        devToolsOpened: BrowserWindow.getAllWindows()[0]?.webContents.isDevToolsOpened() ?? false,
      }));
      check(info.isPackaged, 'installed app reports app.isPackaged=false');
      check(info.name === productName, `app name is ${info.name}, expected ${productName}`);
      check(info.version === version, `app version is ${info.version}, expected ${version}`);
      check(
        resolve(info.userData) === resolve(userDataDir),
        `userData is ${info.userData}, expected ${userDataDir}`,
      );
      check(info.appPath.includes('app.asar'), `app path is not an asar: ${info.appPath}`);
      check(!info.devToolsOpened, 'DevTools are open in the production build');
      check(
        resolve(info.documents) === resolve(documentsRoot),
        `documents path is ${info.documents}, expected ${documentsRoot}`,
      );

      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      check((await page.title()) === productName, 'window title drift');
      const renderer = await page.evaluate(() => {
        const globals = window as unknown as {
          require?: unknown;
          process?: unknown;
          api?: unknown;
        };
        return {
          require: typeof globals.require,
          process: typeof globals.process,
          api: typeof globals.api,
          csp: document
            .querySelector('meta[http-equiv="Content-Security-Policy"]')
            ?.getAttribute('content'),
        };
      });
      const csp = renderer.csp ?? '';
      check(renderer.require === 'undefined', 'window.require is exposed in the packaged app');
      check(renderer.process === 'undefined', 'window.process is exposed in the packaged app');
      check(renderer.api === 'object', 'the typed window.api bridge is missing');
      check(
        csp.includes("default-src 'self'") && !csp.includes('unsafe-eval'),
        `unexpected production CSP: ${renderer.csp ?? '(missing)'}`,
      );
      check(!existsSync(decoyUserData), 'CURVE_E2E_USER_DATA was honoured by the packaged build');

      await page.getByTestId('welcome').waitFor({ state: 'visible' });
      mkdirSync(reportDir, { recursive: true });
      await page.screenshot({ path: join(reportDir, 't6.4-installed-window.png') });

      // Create the workspace through the UI, leaving the default location untouched.
      await page.getByRole('button', { name: '新建工作区' }).click();
      const dialog = page.getByRole('dialog', { name: '新建工作区' });
      await dialog.waitFor({ state: 'visible' });
      const defaultLocation = await dialog.getByLabel('保存位置').inputValue();
      check(
        resolve(defaultLocation) === resolve(workspaceParent),
        `default workspace parent is ${defaultLocation}, expected ${workspaceParent}`,
      );
      await dialog.getByLabel('名称').fill('T6.4 Smoke');
      await dialog.getByRole('button', { name: '创建工作区' }).click();
      await page.getByTestId('workspace-view').waitFor({ state: 'visible' });
      await page.screenshot({ path: join(reportDir, 't6.4-installed-workspace.png') });
      timings.launchMs = Date.now() - launchStartedAt;
    } finally {
      await app.close();
    }

    await waitFor('window state written to userData', () =>
      existsSync(join(userDataDir, 'window-state.json')),
    );
    check(existsSync(userDataDir), `first launch did not create ${userDataDir}`);
    const manifestPath = join(workspaceDir, 'manifest.json');
    check(existsSync(manifestPath), `workspace was not created at ${workspaceDir}`);
    const workspaceManifestHash = sha256(manifestPath);
    const rowsFile = join(workspaceDir, 'tables', 'tbl_v1min.jsonl');
    // The UI-created workspace has no tables yet; prove the parent directory is
    // writable and the manifest is a real workspace manifest.
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { formatVersion?: number };
    check(manifest.formatVersion === 1, 'created workspace manifest is not formatVersion 1');
    check(!existsSync(rowsFile), 'fresh workspace unexpectedly has table rows');

    // ── Uninstall (per user) and data retention ─────────────────────────────
    const uninstallStartedAt = Date.now();
    check(
      runFile(installedUninstaller, ['/currentuser', '/S']) === 0,
      'uninstaller exited non-zero',
    );
    await waitFor('program files removed', () => !existsSync(INSTALL_DIR), 120_000);
    await waitFor('Start Menu shortcut removed', () => !existsSync(START_MENU_SHORTCUT), 60_000);
    await waitFor('uninstall entry removed', () => !uninstallEntryExists(), 60_000);
    timings.uninstallMs = Date.now() - uninstallStartedAt;
    check(!desktopShortcutExists(), 'desktop shortcut survived uninstall');
    check(existsSync(manifestPath), 'uninstall removed the user workspace');
    check(sha256(manifestPath) === workspaceManifestHash, 'uninstall changed the user workspace');
    check(
      existsSync(join(userDataDir, 'window-state.json')),
      'uninstall removed %APPDATA%/Curve Almanac (deleteAppDataOnUninstall=false)',
    );

    // ── Portable artifact ───────────────────────────────────────────────────
    metrics['artifacts'] = {
      setup: { file: setupPath, bytes: sizeOf(setupPath) },
      portable: { file: portablePath, bytes: sizeOf(portablePath) },
      unpackedBytes: directorySize(join(releaseDir, 'win-unpacked')),
    };
    metrics['asar'] = {
      files: asarFiles.length,
      required: [
        'out/main/index.cjs',
        'out/preload/index.cjs',
        'out/renderer/index.html',
        'package.json',
        'node_modules/write-file-atomic/lib/index.js',
        'node_modules/signal-exit/dist/cjs/index.js',
        'node_modules/electron-log/src/index.js',
      ],
      forbidden: forbidden.length,
    };
    metrics['installed'] = {
      dir: INSTALL_DIR,
      exe: installedExe,
      startMenuShortcut: START_MENU_SHORTCUT,
      desktopShortcut: DESKTOP_SHORTCUT,
      uninstallDisplayName: `${productName} ${version}`,
    };
    metrics['runtime'] = {
      isPackaged: true,
      version,
      userData: userDataDir,
      userDataExistedBefore,
      windowStateCreated: true,
      nodeGlobals: 'absent',
      csp: 'production',
    };
    metrics['workspace'] = {
      dir: workspaceDir,
      manifestSha256: workspaceManifestHash,
      retainedAfterUninstall: true,
    };
    metrics['uninstall'] = {
      installDirRemoved: true,
      shortcutsRemoved: true,
      uninstallEntryRemoved: true,
      userDataRetained: true,
    };
    metrics['timings'] = timings;
    metrics['timestamps'] = {
      date: new Date().toISOString(),
      appId: APP_ID,
      electron: (
        JSON.parse(
          readFileSync(join(desktopDir, 'node_modules', 'electron', 'package.json'), 'utf8'),
        ) as { version: string }
      ).version,
    };
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      join(reportDir, 't6.4-package-metrics.json'),
      `${JSON.stringify(metrics, null, 2)}\n`,
      'utf8',
    );

    console.log('[package-smoke] PASS');
    console.log(`  install:   ${timings.installMs}ms → ${INSTALL_DIR}`);
    console.log(`  launch:    ${timings.launchMs}ms → ${userDataDir}`);
    console.log(`  workspace: ${workspaceDir}`);
    console.log(`  uninstall: ${timings.uninstallMs}ms`);
  } finally {
    // Always restore the machine: remove what this smoke created, never a real install.
    removeDirectoryIfExists(workspaceDir);
    if (!workspaceParentExistedBefore) {
      const remaining = existsSync(workspaceParent) ? readdirSync(workspaceParent) : [];
      if (remaining.length === 0) {
        removeDirectoryIfExists(workspaceParent);
      }
    }
    if (!userDataExistedBefore) {
      removeDirectoryIfExists(userDataDir);
    }
    removeDirectoryIfExists(decoyUserData);
    removeDirectoryIfExists(tempRoot);
    removeDirectoryIfExists(scratchDir);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
