import { describe, expect, it } from 'vitest';

import { MemoryWorkspaceStore } from '@curve/persistence';

import { IMPLEMENTED_IPC_CHANNELS, IPC_CHANNELS } from '../../shared/contracts/channels';
import { createLogger } from '../logger';

import { registerIpcHandlers } from './handlers';
import { createIpcRegistrar } from './register';

import type { IpcMainLike } from './register';
import type { IpcResult } from '../../shared/contracts/envelope';
import type { WorkspaceManifest } from '../../shared/contracts/ipc';

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

function wire(): { ipcMain: FakeIpcMain; lines: string[] } {
  const ipcMain = createFakeIpcMain();
  const lines: string[] = [];
  const logger = createLogger((level, line) => {
    lines.push(`${level}: ${line}`);
  });
  const registrar = createIpcRegistrar({ ipcMain, logger });

  registerIpcHandlers({
    registrar,
    logger,
    getAppInfo: () => ({ version: '0.1.0', platform: 'win32', locale: 'en-US' }),
    workspaceStore: new MemoryWorkspaceStore({ appVersion: '0.1.0', uuid: () => 'test' }),
    listRecentWorkspaces: async () => [],
  });

  return { ipcMain, lines };
}

describe('registerIpcHandlers', () => {
  it('registers exactly the channels implemented in this milestone', () => {
    const { ipcMain } = wire();

    expect(ipcMain.registered()).toEqual([...IMPLEMENTED_IPC_CHANNELS]);
  });

  it('answers app:info from the injected provider', async () => {
    const { ipcMain } = wire();

    await expect(ipcMain.invoke(IPC_CHANNELS.appInfo)).resolves.toEqual({
      ok: true,
      data: { version: '0.1.0', platform: 'win32', locale: 'en-US' },
    });
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
});
