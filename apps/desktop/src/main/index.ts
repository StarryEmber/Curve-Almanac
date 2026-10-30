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

import { toAppError, createAppError } from '@curve/domain';

import { APP_NAME } from '../shared/brand';
import { IPC_EVENT_CHANNELS } from '../shared/contracts/channels';

import { resolveE2EDialogStubs, resolveE2EQuitConfirm, resolveE2EUserDataPath } from './e2e-hooks';
import { createCsvExportWriter } from './export/csv-export-file';
import { exportTextFile, readImportSource } from './import/import-files';
import { createImportTokenStore } from './import/import-token-store';
import { registerIpcHandlers } from './ipc/handlers';
import { createIpcRegistrar } from './ipc/register';
import { createConsoleLogger } from './logger';
import { createMainLogger } from './logging/main-log';
import { buildMenuTemplate } from './menu';
import { isNavigationAllowed } from './navigation';
import { resolveFieldTypeStorage } from './plugins';
import { createQuitGuard, QUIT_TIMEOUT_MS, UNSAVED_QUIT_TIMEOUT_MS } from './quit-guard';
import { createAppSettingsStore } from './settings/app-settings-store';
import { buildWindowOptions } from './window-options';
import {
  captureWindowState,
  loadWindowState,
  resolveWindowState,
  saveWindowState,
  WINDOW_STATE_FILE,
} from './window-state';
import { FileWorkspaceStore } from './workspace/file-workspace-store';

import type { QuitConfirmOptions, QuitGuard } from './quit-guard';
import type { AppSettingsStore } from './settings/app-settings-store';
import type { ImportTextRequest, QuitRequest } from '../shared/contracts/ipc';
import type { MessageBoxOptions, OpenDialogOptions, SaveDialogOptions } from 'electron';

/**
 * Development means "served by `electron-vite dev`", not merely unpackaged: the
 * built renderer used by preview and E2E must behave like production.
 */
const isDev = !app.isPackaged && Boolean(process.env['ELECTRON_RENDERER_URL']);

let logger = createConsoleLogger({ minLevel: isDev ? 'debug' : 'info' });

let mainWindow: BrowserWindow | null = null;
/** Quit handshake state; created in `start()` before the window is shown. */
let quitGuard: QuitGuard | null = null;
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

function registerIpc(workspaceStore: FileWorkspaceStore, settingsStore: AppSettingsStore): void {
  const registrar = createIpcRegistrar({ ipcMain, logger });
  const importTokens = createImportTokenStore();
  const pickerWindow = (): BrowserWindow | null => BrowserWindow.getFocusedWindow() ?? mainWindow;

  const chooseSavePath = async (
    suggestedName: string,
    filters: { name: string; extensions: string[] }[],
  ): Promise<string | null> => {
    const stubs = resolveE2EDialogStubs({ isPackaged: app.isPackaged, env: process.env });
    if (stubs !== null) {
      return stubs.savePath;
    }
    const options: SaveDialogOptions = {
      defaultPath: suggestedName,
      filters: filters.map((filter) => ({
        name: filter.name,
        extensions: filter.extensions,
      })),
    };
    const focusedWindow = pickerWindow();
    const result =
      focusedWindow === null
        ? await dialog.showSaveDialog(options)
        : await dialog.showSaveDialog(focusedWindow, options);
    return result.canceled || result.filePath.length === 0 ? null : result.filePath;
  };

  const csvWriter = createCsvExportWriter({ chooseSavePath });
  app.on('will-quit', () => {
    csvWriter.dispose();
  });

  const pickImportPath = async (request: ImportTextRequest): Promise<string | null> => {
    const stubs = resolveE2EDialogStubs({ isPackaged: app.isPackaged, env: process.env });
    if (stubs !== null) {
      return stubs.importPath;
    }
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: request.filters.map((filter) => ({
        name: filter.name,
        extensions: filter.extensions,
      })),
    };
    const focusedWindow = pickerWindow();
    const result =
      focusedWindow === null
        ? await dialog.showOpenDialog(options)
        : await dialog.showOpenDialog(focusedWindow, options);
    const chosen = result.filePaths[0];
    return result.canceled || chosen === undefined ? null : chosen;
  };

  registerIpcHandlers({
    registrar,
    logger,
    getAppInfo: () => ({
      version: app.getVersion(),
      platform: process.platform,
      locale: app.getLocale(),
      documentsDir: app.getPath('documents'),
    }),
    getAppSettings: () => settingsStore.get(),
    updateAppSettings: (settings) => settingsStore.update(settings),
    pickDirectory: async (request) => {
      const stubs = resolveE2EDialogStubs({ isPackaged: app.isPackaged, env: process.env });
      if (stubs !== null) {
        return stubs.directory === null ? null : { path: stubs.directory };
      }
      const options: OpenDialogOptions = {
        properties: ['openDirectory', 'createDirectory'],
        ...(request.title === undefined ? {} : { title: request.title }),
        ...(request.defaultPath === undefined ? {} : { defaultPath: request.defaultPath }),
      };
      const focusedWindow = pickerWindow();
      const result =
        focusedWindow === null
          ? await dialog.showOpenDialog(options)
          : await dialog.showOpenDialog(focusedWindow, options);
      const chosen = result.filePaths[0];
      return result.canceled || chosen === undefined ? null : { path: chosen };
    },
    readImportFile: async (request) => {
      const path = await pickImportPath(request);
      if (path === null) {
        return null;
      }
      const source = await readImportSource(path);
      const token = importTokens.issue({
        path,
        name: source.name,
        size: source.size,
        sha256: source.sha256,
        format: source.format,
      });
      return {
        token,
        name: source.name,
        bytes: source.bytes,
        sha256: source.sha256,
        size: source.size,
        format: source.format,
      };
    },
    exportTextFile: async (request) => {
      const path = await chooseSavePath(request.suggestedName, request.filters);
      if (path === null) {
        return null;
      }
      await exportTextFile(path, request.content, request.encoding ?? 'utf8');
      return { path };
    },
    exportCsv: (request) => csvWriter.handle(request),
    archiveImport: async (request) => {
      const entry = importTokens.get(request.token);
      if (
        entry.name !== request.name ||
        entry.size !== request.size ||
        entry.sha256 !== request.sha256 ||
        entry.format !== request.format
      ) {
        throw createAppError(
          'E_IMPORT_FORMAT',
          'The import source metadata changed before commit; choose the file again.',
        );
      }
      const archived = await workspaceStore.archiveImport({
        workspaceId: request.workspaceId,
        sourcePath: entry.path,
        name: request.name,
        sha256: request.sha256,
        size: request.size,
        encoding: request.encoding,
        format: request.format,
        tableId: request.tableId,
        mode: request.mode,
      });
      importTokens.consume(request.token);
      return archived;
    },
    workspaceStore,
    listRecentWorkspaces: () => workspaceStore.listRecent(),
    inspectWorkspace: (request) => workspaceStore.inspect(request),
    removeRecentWorkspace: async (request) => {
      await workspaceStore.removeRecent(request.path);
      return { ok: true };
    },
    clearRecentWorkspaces: async () => {
      await workspaceStore.clearRecent();
      return { ok: true };
    },
    respondToQuit: (request) => {
      quitGuard?.respond(request);
      return { ok: true };
    },
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

/**
 * Native fallback for a renderer that cannot flush within 3s (SPEC §13.3).
 * The E2E dialog stub answers it so Playwright never blocks on a native modal.
 */
async function confirmQuit(options: QuitConfirmOptions): Promise<boolean> {
  const stub = resolveE2EQuitConfirm({ isPackaged: app.isPackaged, env: process.env });
  if (stub !== null) {
    return stub;
  }
  const messageBox: MessageBoxOptions = {
    type: 'warning',
    title: options.title,
    message: options.message,
    detail: options.detail,
    buttons: ['Cancel', 'Quit anyway'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const focusedWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const result =
    focusedWindow === null
      ? await dialog.showMessageBox(messageBox)
      : await dialog.showMessageBox(focusedWindow, messageBox);
  return result.response === 1;
}

function installQuitGuard(settingsStore: AppSettingsStore): QuitGuard {
  const guard = createQuitGuard({
    request: (reason) => {
      if (mainWindow === null || mainWindow.isDestroyed()) {
        return;
      }
      const payload: QuitRequest = { reason };
      mainWindow.webContents.send(IPC_EVENT_CHANNELS.appQuitRequested, payload);
    },
    confirm: confirmQuit,
    close: () => {
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.close();
        return;
      }
      app.quit();
    },
    // T5.5: with autosave off the renderer asks the user before it answers, so
    // the native fallback must not interrupt that dialog after 3 seconds.
    timeoutMs: () => (settingsStore.get().autosave ? QUIT_TIMEOUT_MS : UNSAVED_QUIT_TIMEOUT_MS),
    logger,
    appName: APP_NAME,
  });

  app.on('before-quit', (event) => {
    if (!guard.canQuit()) {
      event.preventDefault();
      guard.request('app-quit');
    }
  });

  return guard;
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

  appWindow.on('close', (event) => {
    saveWindowState(
      stateFile,
      captureWindowState({
        maximized: appWindow.isMaximized(),
        bounds: appWindow.getBounds(),
        normalBounds: appWindow.getNormalBounds(),
      }),
    );
    if (quitGuard !== null && !quitGuard.canQuit()) {
      event.preventDefault();
      quitGuard.request('window-close');
    }
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

  // T6.6 (SPEC §16.5): attach console + `userData/logs/main.log` after the E2E
  // userData override has settled, but before settings/window/IPC can log.
  logger = createMainLogger({ userDataDir: app.getPath('userData'), isDev });

  installNavigationGuards();
  installPermissionHandlers();
  const userDataPath = app.getPath('userData');
  const settingsStore = createAppSettingsStore({ userDataPath, logger });
  await settingsStore.load();
  const workspaceStore = new FileWorkspaceStore({
    userDataPath,
    appVersion: app.getVersion(),
    logger,
    // New workspaces inherit the user's default table style (T5.5). Existing
    // workspaces keep their own manifest setting.
    appSettings: () => settingsStore.get(),
    // T6.2: semantic field types are compiled in, so the manifest can be
    // validated before the renderer (and its plugin host) exists.
    resolveFieldTypeStorage,
  });
  quitGuard = installQuitGuard(settingsStore);
  registerIpc(workspaceStore, settingsStore);
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

/**
 * SPEC §7.5: one instance per userData directory. A second launch focuses the
 * existing window instead of opening the same workspace twice.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  void start().catch((error: unknown) => {
    const appError = toAppError(error);
    logger.error(`failed to start ${APP_NAME}: ${appError.code} ${appError.message}`, error);
    app.exit(1);
  });
}
