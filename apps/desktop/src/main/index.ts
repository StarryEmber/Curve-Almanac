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

import { resolveE2EDialogStubs, resolveE2EUserDataPath } from './e2e-hooks';
import { createCsvExportWriter } from './export/csv-export-file';
import { exportTextFile, readImportSource } from './import/import-files';
import { createImportTokenStore } from './import/import-token-store';
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
import { FileWorkspaceStore } from './workspace/file-workspace-store';

import type { ImportTextRequest } from '../shared/contracts/ipc';
import type { OpenDialogOptions, SaveDialogOptions } from 'electron';

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

function registerIpc(workspaceStore: FileWorkspaceStore): void {
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
  app.on('before-quit', () => {
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
  const workspaceStore = new FileWorkspaceStore({
    userDataPath: app.getPath('userData'),
    appVersion: app.getVersion(),
    logger,
  });
  registerIpc(workspaceStore);
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
