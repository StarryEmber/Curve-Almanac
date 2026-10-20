import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { IPC_CHANNELS } from '../../shared/contracts/channels';
import { createLogger } from '../logger';

import { createIpcRegistrar } from './register';

import type { IpcMainLike } from './register';

interface FakeIpcMain extends IpcMainLike {
  /** Mirrors `ipcRenderer.invoke`: rejects when the channel has no handler. */
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

const request = z.strictObject({ name: z.string().min(1) });
const response = z.strictObject({ greeting: z.string().min(1) });

function quietLogger(): ReturnType<typeof createLogger> {
  return createLogger(() => undefined);
}

describe('createIpcRegistrar', () => {
  it('registers the channel and answers through the envelope', async () => {
    const ipcMain = createFakeIpcMain();
    const registrar = createIpcRegistrar({ ipcMain, logger: quietLogger() });

    registrar.handle(IPC_CHANNELS.appInfo, { request, response }, (payload) => ({
      greeting: `Hello ${payload.name}`,
    }));

    await expect(ipcMain.invoke(IPC_CHANNELS.appInfo, { name: 'Ada' })).resolves.toEqual({
      ok: true,
      data: { greeting: 'Hello Ada' },
    });
    expect(ipcMain.registered()).toEqual([IPC_CHANNELS.appInfo]);
  });

  it('validates through the registrar, not the handler', async () => {
    const ipcMain = createFakeIpcMain();
    const registrar = createIpcRegistrar({ ipcMain, logger: quietLogger() });
    let calls = 0;
    registrar.handle(IPC_CHANNELS.logWrite, { request, response }, () => {
      calls += 1;
      return { greeting: 'never' };
    });

    const result = await ipcMain.invoke(IPC_CHANNELS.logWrite, 'nonsense');

    expect(result).toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
    expect(calls).toBe(0);
  });

  it('refuses to register the same channel twice', () => {
    const ipcMain = createFakeIpcMain();
    const registrar = createIpcRegistrar({ ipcMain, logger: quietLogger() });
    registrar.handle(IPC_CHANNELS.appInfo, { request, response }, () => ({ greeting: 'hi' }));

    expect(() =>
      registrar.handle(IPC_CHANNELS.appInfo, { request, response }, () => ({ greeting: 'hi' })),
    ).toThrow(/Duplicate IPC handler for channel "app:info"/);
  });

  it('leaves channels outside the whitelist unhandled', async () => {
    const ipcMain = createFakeIpcMain();
    const registrar = createIpcRegistrar({ ipcMain, logger: quietLogger() });
    registrar.handle(IPC_CHANNELS.appInfo, { request, response }, () => ({ greeting: 'hi' }));

    expect(registrar.handles(IPC_CHANNELS.workspaceOpen)).toBe(false);
    expect(registrar.channels()).toEqual([IPC_CHANNELS.appInfo]);
    await expect(ipcMain.invoke(IPC_CHANNELS.workspaceOpen, { dir: 'C:/ws' })).rejects.toThrow(
      /No handler registered for 'workspace:open'/,
    );
  });
});
