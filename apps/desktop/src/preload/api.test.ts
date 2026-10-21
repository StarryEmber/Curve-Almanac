import { describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../shared/contracts/channels';

import { createCurveApi } from './api';

import type { WorkspaceManifest } from '../shared/contracts/ipc';

const MANIFEST: WorkspaceManifest = {
  formatVersion: 1,
  id: 'ws_1',
  name: 'Demo',
  appVersion: '0.1.0',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  tables: [],
  charts: [],
  views: [],
  tableStyles: [],
  layout: { type: 'pane', viewIds: [], activeViewId: null },
  settings: {
    theme: 'system',
    locale: 'zh-CN',
    defaultTableStyleId: 'builtin.report-light',
    autosave: true,
  },
};

describe('createCurveApi', () => {
  it('calls app:info without a payload and forwards a well-formed response', async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      data: { version: '0.1.0', platform: 'win32', locale: 'zh-CN' },
    }));
    const api = createCurveApi(invoke);

    await expect(api.app.info()).resolves.toEqual({
      ok: true,
      data: { version: '0.1.0', platform: 'win32', locale: 'zh-CN' },
    });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.appInfo, undefined);
  });

  it('forwards a log:write request and its reply', async () => {
    const invoke = vi.fn(async () => ({ ok: true, data: { ok: true } }));
    const api = createCurveApi(invoke);

    await expect(api.log.write({ level: 'info', message: 'hello' })).resolves.toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.logWrite, {
      level: 'info',
      message: 'hello',
    });
  });

  it('forwards workspace and manifest methods over their channels', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === IPC_CHANNELS.workspaceCreate) {
        return { ok: true, data: MANIFEST };
      }
      if (channel === IPC_CHANNELS.workspaceOpen) {
        return { ok: true, data: { manifest: MANIFEST, warnings: [] } };
      }
      if (channel === IPC_CHANNELS.workspaceRecent) {
        return { ok: true, data: [] };
      }
      return { ok: true, data: { ok: true } };
    });
    const api = createCurveApi(invoke);

    await expect(api.workspace.create({ dir: 'C:/tmp', name: 'Demo' })).resolves.toMatchObject({
      ok: true,
    });
    await expect(api.workspace.open({ dir: 'C:/tmp/Demo.cstudio' })).resolves.toMatchObject({
      ok: true,
    });
    await expect(api.workspace.close({ workspaceId: 'ws_1' })).resolves.toEqual({
      ok: true,
      data: { ok: true },
    });
    await expect(api.workspace.recent()).resolves.toEqual({ ok: true, data: [] });
    await expect(api.manifest.write({ workspaceId: 'ws_1', manifest: MANIFEST })).resolves.toEqual({
      ok: true,
      data: { ok: true },
    });

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.workspaceCreate, {
      dir: 'C:/tmp',
      name: 'Demo',
    });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.workspaceOpen, {
      dir: 'C:/tmp/Demo.cstudio',
    });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.workspaceClose, { workspaceId: 'ws_1' });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.workspaceRecent, undefined);
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.manifestWrite, {
      workspaceId: 'ws_1',
      manifest: MANIFEST,
    });
  });

  it('forwards table methods over their channels', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === IPC_CHANNELS.tableRead) {
        return { ok: true, data: { jsonl: 'x\n', bytes: 2 } };
      }
      if (channel === IPC_CHANNELS.tableWrite) {
        return { ok: true, data: { bytes: 2 } };
      }
      return { ok: true, data: { ok: true } };
    });
    const api = createCurveApi(invoke);

    await expect(api.table.read({ workspaceId: 'ws_1', tableId: 'tbl_1' })).resolves.toEqual({
      ok: true,
      data: { jsonl: 'x\n', bytes: 2 },
    });
    await expect(
      api.table.write({ workspaceId: 'ws_1', tableId: 'tbl_1', jsonl: 'x\n' }),
    ).resolves.toEqual({ ok: true, data: { bytes: 2 } });
    await expect(api.table.trash({ workspaceId: 'ws_1', tableId: 'tbl_1' })).resolves.toEqual({
      ok: true,
      data: { ok: true },
    });

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.tableRead, {
      workspaceId: 'ws_1',
      tableId: 'tbl_1',
    });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.tableWrite, {
      workspaceId: 'ws_1',
      tableId: 'tbl_1',
      jsonl: 'x\n',
    });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.tableTrash, {
      workspaceId: 'ws_1',
      tableId: 'tbl_1',
    });
  });

  it('passes an error envelope through unchanged', async () => {
    const envelope = {
      ok: false as const,
      error: { code: 'E_IPC_INVALID_PAYLOAD' as const, message: 'nope' },
    };
    const api = createCurveApi(async () => envelope);

    await expect(api.log.write({ level: 'info', message: 'hello' })).resolves.toEqual(envelope);
  });

  it('replaces a malformed response with an E_UNKNOWN envelope', async () => {
    const api = createCurveApi(async () => ({ hello: 'world' }));

    await expect(api.app.info()).resolves.toEqual({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'The main process returned a malformed response.' },
    });
  });

  it('propagates a rejected invoke so the renderer can show a failure state', async () => {
    const api = createCurveApi(async () => Promise.reject(new Error('IPC channel closed')));

    await expect(api.app.info()).rejects.toThrow('IPC channel closed');
  });

  it('forwards dialog:pickDirectory over its channel', async () => {
    const invoke = vi.fn(async () => ({ ok: true, data: { path: 'C:\\picked' } }));
    const api = createCurveApi(invoke);

    await expect(
      api.dialog.pickDirectory({ title: 'Choose', defaultPath: 'C:\\start' }),
    ).resolves.toEqual({ ok: true, data: { path: 'C:\\picked' } });
    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.dialogPickDirectory, {
      title: 'Choose',
      defaultPath: 'C:\\start',
    });
  });

  it('exposes no generic invoke/send escape hatch', () => {
    const api = createCurveApi(async () => ({ ok: true, data: null }));

    expect(Object.keys(api)).toEqual(['app', 'dialog', 'log', 'workspace', 'manifest', 'table']);
    expect(Object.keys(api.app)).toEqual(['info']);
    expect(Object.keys(api.dialog)).toEqual(['pickDirectory']);
    expect(Object.keys(api.log)).toEqual(['write']);
    expect(Object.keys(api.workspace)).toEqual(['create', 'open', 'close', 'recent']);
    expect(Object.keys(api.manifest)).toEqual(['write']);
    expect(Object.keys(api.table)).toEqual(['read', 'write', 'trash']);
    expect(api).not.toHaveProperty('invoke');
    expect(api).not.toHaveProperty('send');
    expect(api).not.toHaveProperty('ipcRenderer');
  });
});
