/**
 * Electron main process entry.
 *
 * Responsibilities:
 * - Create the single hardened BrowserWindow (SPEC §15.3).
 * - Serve the renderer from the Vite dev server in development, from
 *   `out/renderer/index.html` otherwise.
 * - Deny navigation, popups, webviews and permission requests.
 * - Register the typed IPC handlers (T0.3, see `./ipc`).
 * - Persist window geometry in `userData`.
 *
 * Pure logic lives in sibling modules so it can be unit tested; this file is
 * wiring only and is excluded from the coverage gate (E2E covers it).
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, BrowserWindow, dialog, ipcMain, Menu, screen, session } from 'electron';

import { toAppError } from '@curve/domain';

import { resolveE2EUserDataPath } from './e2e-hooks';
import { registerIpcHandlers } from './ipc/handlers';
import { createIpcRegistrar } from './ipc/register';
import { createConsoleLogger } from './logger';
import { buildMenuTemplate } from './menu';
import { isNavigationAllowed } from './navigation';
import { buildWindowOptions } from './window-options';
import {
  captureWindowState,
  loadWindowState,
  resolveWindowState,
  saveWindowState,
  WINDOW_STATE_FILE,
} from './window-state';

const APP_NAME = 'Curve Studio';

/**
 * Development means "served by `electron-vite dev`", not merely unpackaged: the
 * built renderer used by preview and E2E must behave like production.
 */
const isDev = !app.isPackaged && Boolean(process.env['ELECTRON_RENDERER_URL']);

const logger = createConsoleLogger({ minLevel: isDev ? 'debug' : 'info' });

let mainWindow: BrowserWindow | null = null;
/** Base URL of the loaded renderer; the navigation guard fails closed while empty. */
let rendererBaseUrl = '';

app.setName(APP_NAME);
applyE2EUserDataOverride();

function applyE2EUserDataOverride(): void {
  const userDataPath = resolveE2EUserDataPath({
    isPackaged: app.isPackaged,
    env: process.env,
  });
  if (!userDataPath) {
    return;
  }
  try {
    mkdirSync(userDataPath, { recursive: true });
    app.setPath('userData', userDataPath);
  } catch (error) {
    logger.error('ignored E2E userData override', toAppError(error).message);
  }
}

function registerIpc(): void {
  const registrar = createIpcRegistrar({ ipcMain, logger });
  registerIpcHandlers({
    registrar,
    logger,
    getAppInfo: () => ({
      version: app.getVersion(),
      platform: process.platform,
      locale: app.getLocale(),
    }),
  });
}

function installNavigationGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isNavigationAllowed(url, rendererBaseUrl)) {
        event.preventDefault();
      }
    });
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

function installPermissionHandlers(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function showAbout(): void {
  const options = {
    type: 'info' as const,
    title: `About ${APP_NAME}`,
    message: APP_NAME,
    detail:
      `Version ${app.getVersion()}\n` +
      `Electron ${process.versions.electron ?? 'unknown'}\n` +
      `Chromium ${process.versions.chrome ?? 'unknown'}`,
    buttons: ['OK'],
  };
  const focusedWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (focusedWindow) {
    void dialog.showMessageBox(focusedWindow, options);
    return;
  }
  void dialog.showMessageBox(options);
}

function installApplicationMenu(): void {
  const template = buildMenuTemplate(
    { appName: APP_NAME, isDev, platform: process.platform },
    { showAbout },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow(): BrowserWindow {
  const stateFile = join(app.getPath('userData'), WINDOW_STATE_FILE);
  const state = resolveWindowState(
    loadWindowState(stateFile),
    screen.getAllDisplays().map((display) => display.workArea),
  );

  const preloadPath = join(__dirname, '../preload/index.cjs');
  const rendererEntry = join(__dirname, '../renderer/index.html');
  const devServerUrl = isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined;
  rendererBaseUrl = devServerUrl ?? pathToFileURL(rendererEntry).href;

  const appWindow = new BrowserWindow(
    buildWindowOptions({ preloadPath, isDev, bounds: state.bounds }),
  );

  if (state.maximized) {
    appWindow.maximize();
  }

  appWindow.once('ready-to-show', () => {
    appWindow.show();
    logger.info(
      `window ready (mode=${isDev ? 'development' : 'production'}, ` +
        `devTools=${String(isDev)}, visible=${String(appWindow.isVisible())})`,
    );
  });

  appWindow.on('close', () => {
    saveWindowState(
      stateFile,
      captureWindowState({
        maximized: appWindow.isMaximized(),
        bounds: appWindow.getBounds(),
        normalBounds: appWindow.getNormalBounds(),
      }),
    );
  });

  appWindow.on('closed', () => {
    mainWindow = null;
  });

  if (devServerUrl) {
    void appWindow.loadURL(devServerUrl);
  } else {
    void appWindow.loadFile(rendererEntry);
  }

  return appWindow;
}

async function start(): Promise<void> {
  await app.whenReady();

  installNavigationGuards();
  installPermissionHandlers();
  registerIpc();
  installApplicationMenu();

  mainWindow = createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

void start().catch((error: unknown) => {
  const appError = toAppError(error);
  logger.error(`failed to start ${APP_NAME}: ${appError.code} ${appError.message}`, error);
  app.exit(1);
});
