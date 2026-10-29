import { describe, expect, it, vi } from 'vitest';

import { MemoryWorkspaceStore } from '@curve/persistence';

import { IMPLEMENTED_IPC_CHANNELS, IPC_CHANNELS } from '../../shared/contracts/channels';
import { DEFAULT_APP_SETTINGS } from '../../shared/contracts/settings';
import { createLogger } from '../logger';

import { registerIpcHandlers } from './handlers';
import { createIpcRegistrar } from './register';

import type { IpcMainLike } from './register';
import type { IpcResult } from '../../shared/contracts/envelope';
import type { WorkspaceManifest } from '../../shared/contracts/ipc';
import type { AppSettings } from '../../shared/contracts/settings';

interface FakeIpcMain extends IpcMainLike {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
  registered(): string[];
}

function createFakeIpcMain(): FakeIpcMain {
  const listeners = new Map<string, (event: unknown, payload?: unknown) => unknown>();
  return {
    handle(channel, listener) {
      if (listeners.has(channel)) {
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      }
      listeners.set(channel, listener);
    },
    async invoke(channel, payload) {
      const listener = listeners.get(channel);
      if (!listener) {
        throw new Error(`No handler registered for '${channel}'`);
      }
      return listener({}, payload);
    },
    registered: () => [...listeners.keys()],
  };
}

function wire(): {
  ipcMain: FakeIpcMain;
  lines: string[];
  inspectWorkspace: ReturnType<typeof vi.fn>;
  removeRecentWorkspace: ReturnType<typeof vi.fn>;
  clearRecentWorkspaces: ReturnType<typeof vi.fn>;
  respondToQuit: ReturnType<typeof vi.fn>;
} {
  const ipcMain = createFakeIpcMain();
  const lines: string[] = [];
  const logger = createLogger((level, line) => {
    lines.push(`${level}: ${line}`);
  });
  const registrar = createIpcRegistrar({ ipcMain, logger });
  const inspectWorkspace = vi.fn(async (request: { dir: string }) => ({
    dir: request.dir,
    name: 'Demo',
    lock: 'stale' as const,
    manifest: 'ok' as const,
    backups: [],
  }));
  const removeRecentWorkspace = vi.fn(async () => ({ ok: true as const }));
  const clearRecentWorkspaces = vi.fn(async () => ({ ok: true as const }));
  const respondToQuit = vi.fn(() => ({ ok: true as const }));
  let appSettings: AppSettings = DEFAULT_APP_SETTINGS;
  const updateAppSettings = vi.fn(async (settings: AppSettings) => {
    appSettings = settings;
    return settings;
  });

  registerIpcHandlers({
    registrar,
    logger,
    getAppInfo: () => ({
      version: '0.1.0',
      platform: 'win32',
      locale: 'en-US',
      documentsDir: 'C:\\Users\\test\\Documents',
    }),
    getAppSettings: () => appSettings,
    updateAppSettings,
    pickDirectory: async () => ({ path: 'C:\\picked' }),
    readImportFile: async () => ({
      token: 'tok_1',
      name: 'data.csv',
      bytes: new Uint8Array([1, 2, 3]),
      sha256: 'a'.repeat(64),
      size: 3,
      format: 'csv',
    }),
    exportTextFile: async () => ({ path: 'C:\\export.csv' }),
    exportCsv: async (request) =>
      request.op === 'begin'
        ? { op: 'begin', token: 'tok_csv', path: 'C:\\export.csv' }
        : request.op === 'append'
          ? { op: 'append', bytes: 10 }
          : request.op === 'finish'
            ? { op: 'finish', path: 'C:\\export.csv', bytes: 10, rows: 1 }
            : { op: 'cancel', removed: true },
    archiveImport: async () => ({
      copied: true,
      archivePath: 'imports/20260101T000000000Z-data.csv',
      sidecarPath: 'imports/20260101T000000000Z-data.csv.json',
    }),
    workspaceStore: new MemoryWorkspaceStore({ appVersion: '0.1.0', uuid: () => 'test' }),
    listRecentWorkspaces: async () => [],
    inspectWorkspace,
    removeRecentWorkspace,
    clearRecentWorkspaces,
    respondToQuit,
  });

  return {
    ipcMain,
    lines,
    inspectWorkspace,
    removeRecentWorkspace,
    clearRecentWorkspaces,
    respondToQuit,
  };
}

describe('registerIpcHandlers', () => {
  it('registers exactly the channels implemented in this milestone', () => {
    const { ipcMain } = wire();

    expect(ipcMain.registered().sort()).toEqual([...IMPLEMENTED_IPC_CHANNELS].sort());
  });

  it('answers app:info from the injected provider', async () => {
    const { ipcMain } = wire();

    await expect(ipcMain.invoke(IPC_CHANNELS.appInfo)).resolves.toEqual({
      ok: true,
      data: {
        version: '0.1.0',
        platform: 'win32',
        locale: 'en-US',
        documentsDir: 'C:\\Users\\test\\Documents',
      },
    });
  });

  it('answers app:settings and persists a validated update', async () => {
    const { ipcMain } = wire();

    await expect(ipcMain.invoke(IPC_CHANNELS.appSettings)).resolves.toEqual({
      ok: true,
      data: DEFAULT_APP_SETTINGS,
    });

    const next = { ...DEFAULT_APP_SETTINGS, theme: 'dark' as const, autosave: false };
    await expect(
      ipcMain.invoke(IPC_CHANNELS.appSettingsUpdate, { settings: next }),
    ).resolves.toEqual({ ok: true, data: next });
    await expect(ipcMain.invoke(IPC_CHANNELS.appSettings)).resolves.toEqual({
      ok: true,
      data: next,
    });

    await expect(
      ipcMain.invoke(IPC_CHANNELS.appSettingsUpdate, {
        settings: { ...next, locale: 'fr-FR' },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
  });

  it('answers dialog:pickDirectory from the injected picker', async () => {
    const { ipcMain } = wire();

    await expect(
      ipcMain.invoke(IPC_CHANNELS.dialogPickDirectory, {
        title: 'Choose',
        defaultPath: 'C:\\Users\\test\\Documents\\Curve Almanac',
      }),
    ).resolves.toEqual({ ok: true, data: { path: 'C:\\picked' } });
  });

  it('accepts an empty object payload for app:info', async () => {
    const { ipcMain } = wire();

    await expect(ipcMain.invoke(IPC_CHANNELS.appInfo, {})).resolves.toMatchObject({ ok: true });
  });

  it('rejects an unexpected app:info payload', async () => {
    const { ipcMain } = wire();

    await expect(ipcMain.invoke(IPC_CHANNELS.appInfo, { dir: 'C:/ws' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_IPC_INVALID_PAYLOAD' },
    });
  });

  it('writes a renderer log entry and replies with ok', async () => {
    const { ipcMain, lines } = wire();

    await expect(
      ipcMain.invoke(IPC_CHANNELS.logWrite, { level: 'warn', message: 'renderer says hi' }),
    ).resolves.toEqual({ ok: true, data: { ok: true } });
    expect(lines).toEqual(['warn: [renderer] renderer says hi']);
  });

  it('normalises an unknown level to info', async () => {
    const { ipcMain, lines } = wire();

    await ipcMain.invoke(IPC_CHANNELS.logWrite, { level: 'verbose', message: 'hi' });

    expect(lines).toEqual(['info: [renderer] hi']);
  });

  it('forwards a detail value and truncates a very long message', async () => {
    const { ipcMain, lines } = wire();

    await ipcMain.invoke(IPC_CHANNELS.logWrite, {
      level: 'error',
      message: 'x'.repeat(5000),
      detail: 'EACCES',
    });

    expect(lines[0]).toContain('EACCES');
    expect(lines[0]?.length).toBeLessThan(2100);
    expect(lines[0]).toContain('...');
  });

  it('rejects an invalid log payload without throwing', async () => {
    const { ipcMain, lines } = wire();

    const result = await ipcMain.invoke(IPC_CHANNELS.logWrite, { level: 'info' });

    expect(result).toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
    expect(lines.some((line) => line.includes('invalid request payload'))).toBe(true);
  });

  it('routes the workspace lifecycle and manifest:write through the store', async () => {
    const { ipcMain } = wire();

    const created = (await ipcMain.invoke(IPC_CHANNELS.workspaceCreate, {
      dir: '/tmp/parent',
      name: 'Demo',
    })) as IpcResult<WorkspaceManifest>;
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    await expect(
      ipcMain.invoke(IPC_CHANNELS.workspaceOpen, { dir: '/tmp/parent/Demo.cstudio' }),
    ).resolves.toMatchObject({
      ok: true,
      data: { manifest: created.data, warnings: [] },
    });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.manifestWrite, {
        workspaceId: created.data.id,
        manifest: created.data,
      }),
    ).resolves.toEqual({ ok: true, data: { ok: true } });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.workspaceClose, { workspaceId: created.data.id }),
    ).resolves.toEqual({ ok: true, data: { ok: true } });
    await expect(ipcMain.invoke(IPC_CHANNELS.workspaceRecent, {})).resolves.toEqual({
      ok: true,
      data: [],
    });
  });

  it('rejects invalid workspace and manifest payloads', async () => {
    const { ipcMain } = wire();

    await expect(
      ipcMain.invoke(IPC_CHANNELS.workspaceCreate, { dir: '', name: 'Demo' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.workspaceClose, { workspaceId: '../escape' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.manifestWrite, { workspaceId: 'ws_1', manifest: {} }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
  });

  it('routes table:read/write/trash through the store and keeps paths out of IPC', async () => {
    const { ipcMain } = wire();

    const created = (await ipcMain.invoke(IPC_CHANNELS.workspaceCreate, {
      dir: '/tmp/tables',
      name: 'Demo',
    })) as IpcResult<WorkspaceManifest>;
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const table = {
      id: 'tbl_1',
      name: 'T',
      file: 'tables/tbl_1.jsonl',
      schemaVersion: 1,
      columns: [{ id: 'col_1', key: 'id', label: 'id', type: 'text', role: 'label' }],
      primaryKey: 'col_1',
      // Declared non-empty but the file does not exist yet: reading must fail
      // rather than pretend the table is empty (ADR-022).
      rowCount: 1,
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    };
    const manifest = { ...created.data, tables: [table] };
    await expect(
      ipcMain.invoke(IPC_CHANNELS.manifestWrite, {
        workspaceId: created.data.id,
        manifest,
      }),
    ).resolves.toEqual({ ok: true, data: { ok: true } });

    const ref = { workspaceId: created.data.id, tableId: 'tbl_1' };
    await expect(ipcMain.invoke(IPC_CHANNELS.tableRead, ref)).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_TABLE_NOT_FOUND' },
    });

    const jsonl = '{"id":"row_1","v":["a"]}\n';
    await expect(ipcMain.invoke(IPC_CHANNELS.tableWrite, { ...ref, jsonl })).resolves.toEqual({
      ok: true,
      data: { bytes: 25 },
    });
    await expect(ipcMain.invoke(IPC_CHANNELS.tableRead, ref)).resolves.toEqual({
      ok: true,
      data: { jsonl, bytes: 25 },
    });
    await expect(ipcMain.invoke(IPC_CHANNELS.tableTrash, ref)).resolves.toEqual({
      ok: true,
      data: { ok: true },
    });
    await expect(ipcMain.invoke(IPC_CHANNELS.tableRead, ref)).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_TABLE_NOT_FOUND' },
    });

    // Only ids cross the boundary; an absolute path in the payload is rejected.
    await expect(
      ipcMain.invoke(IPC_CHANNELS.tableRead, { workspaceId: created.data.id, path: '/tmp/x' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
  });

  it('routes the import file channels through their injected adapters', async () => {
    const { ipcMain } = wire();
    const filters = [{ name: 'Data', extensions: ['csv', 'json'] }];

    await expect(ipcMain.invoke(IPC_CHANNELS.fileImportText, { filters })).resolves.toMatchObject({
      ok: true,
      data: { token: 'tok_1', name: 'data.csv', size: 3, format: 'csv' },
    });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.fileExportText, {
        suggestedName: 'errors.csv',
        content: 'a\n',
        filters,
      }),
    ).resolves.toEqual({ ok: true, data: { path: 'C:\\export.csv' } });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.fileExportCsv, {
        op: 'begin',
        suggestedName: 'Data.csv',
        filters,
      }),
    ).resolves.toEqual({
      ok: true,
      data: { op: 'begin', token: 'tok_csv', path: 'C:\\export.csv' },
    });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.fileExportCsv, {
        op: 'append',
        token: 'tok_csv',
        chunk: 'a,b\r\n',
      }),
    ).resolves.toEqual({ ok: true, data: { op: 'append', bytes: 10 } });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.fileExportCsv, {
        op: 'finish',
        token: 'tok_csv',
        rows: 1,
      }),
    ).resolves.toEqual({
      ok: true,
      data: { op: 'finish', path: 'C:\\export.csv', bytes: 10, rows: 1 },
    });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.fileExportCsv, { op: 'cancel', token: 'tok_csv' }),
    ).resolves.toEqual({ ok: true, data: { op: 'cancel', removed: true } });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.fileExportCsv, { op: 'append', chunk: 'a' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.fileArchiveImport, {
        workspaceId: 'ws_1',
        token: 'tok_1',
        tableId: 'tbl_1',
        mode: 'append',
        name: 'data.csv',
        sha256: 'a'.repeat(64),
        size: 3,
        encoding: 'utf-8',
        format: 'csv',
      }),
    ).resolves.toMatchObject({ ok: true, data: { copied: true } });

    await expect(
      ipcMain.invoke(IPC_CHANNELS.fileImportText, { filters: [] }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
  });

  it('forwards workspace:inspect and recent-list mutations (T5.3)', async () => {
    const { ipcMain, inspectWorkspace, removeRecentWorkspace, clearRecentWorkspaces } = wire();

    await expect(
      ipcMain.invoke(IPC_CHANNELS.workspaceInspect, { dir: 'C:/Demo.cstudio' }),
    ).resolves.toMatchObject({
      ok: true,
      data: { dir: 'C:/Demo.cstudio', lock: 'stale', manifest: 'ok' },
    });
    expect(inspectWorkspace).toHaveBeenCalledWith({ dir: 'C:/Demo.cstudio' });

    await expect(
      ipcMain.invoke(IPC_CHANNELS.workspaceRecentRemove, { path: 'C:/Demo.cstudio' }),
    ).resolves.toEqual({ ok: true, data: { ok: true } });
    expect(removeRecentWorkspace).toHaveBeenCalledWith({ path: 'C:/Demo.cstudio' });

    await expect(ipcMain.invoke(IPC_CHANNELS.workspaceRecentClear, {})).resolves.toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(clearRecentWorkspaces).toHaveBeenCalledTimes(1);

    await expect(ipcMain.invoke(IPC_CHANNELS.workspaceInspect, {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_IPC_INVALID_PAYLOAD' },
    });
    await expect(
      ipcMain.invoke(IPC_CHANNELS.workspaceRecentRemove, { path: '' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
  });

  it('answers the quit handshake through the injected guard (T5.3)', async () => {
    const { ipcMain, respondToQuit } = wire();

    await expect(
      ipcMain.invoke(IPC_CHANNELS.appQuitResponse, { action: 'quit', flushed: true }),
    ).resolves.toEqual({ ok: true, data: { ok: true } });
    expect(respondToQuit).toHaveBeenCalledWith({ action: 'quit', flushed: true });

    await expect(
      ipcMain.invoke(IPC_CHANNELS.appQuitResponse, { action: 'maybe', flushed: true }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
    expect(respondToQuit).toHaveBeenCalledTimes(1);
  });
});
