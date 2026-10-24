import { expect } from '@playwright/test';

import { ALL_IPC_CHANNELS, IMPLEMENTED_IPC_CHANNELS } from '../src/shared/contracts/channels';

import { test } from './fixtures';

import type { IpcResult } from '../src/shared/contracts/envelope';
import type { CurveApi } from '../src/shared/contracts/ipc';

/**
 * T0.3 — typed IPC and the error envelope, verified against the built app.
 * Every test starts from a fresh userData directory (see fixtures).
 */
test.describe('T0.3 typed IPC', () => {
  test('exposes only the whitelisted bridge methods', async ({ page }) => {
    const surface = await page.evaluate(() => {
      const api = (globalThis as unknown as { api: Record<string, unknown> }).api;
      return {
        namespaces: Object.keys(api).sort(),
        appMethods: Object.keys(api['app'] as Record<string, unknown>),
        dialogMethods: Object.keys(api['dialog'] as Record<string, unknown>),
        logMethods: Object.keys(api['log'] as Record<string, unknown>),
        workspaceMethods: Object.keys(api['workspace'] as Record<string, unknown>).sort(),
        manifestMethods: Object.keys(api['manifest'] as Record<string, unknown>),
        tableMethods: Object.keys(api['table'] as Record<string, unknown>).sort(),
        fileMethods: Object.keys(api['file'] as Record<string, unknown>).sort(),
        invoke: typeof (api as { invoke?: unknown }).invoke,
        send: typeof (api as { send?: unknown }).send,
        ipcRenderer: typeof (globalThis as { ipcRenderer?: unknown }).ipcRenderer,
      };
    });

    expect(surface).toEqual({
      namespaces: ['app', 'dialog', 'file', 'log', 'manifest', 'table', 'workspace'],
      appMethods: ['info'],
      dialogMethods: ['pickDirectory'],
      logMethods: ['write'],
      workspaceMethods: ['close', 'create', 'open', 'recent'],
      manifestMethods: ['write'],
      tableMethods: ['read', 'trash', 'write'],
      fileMethods: ['archiveImport', 'exportCsv', 'exportText', 'importText'],
      invoke: 'undefined',
      send: 'undefined',
      ipcRenderer: 'undefined',
    });
  });

  test('answers app:info and accepts a valid log:write', async ({ page }) => {
    const info = await page.evaluate(() =>
      (globalThis as unknown as { api: CurveApi }).api.app.info(),
    );
    expect(info.ok).toBe(true);
    if (info.ok) {
      expect(info.data.version.length).toBeGreaterThan(0);
      expect(info.data.platform).toBe(process.platform);
    }

    const logged = await page.evaluate(() =>
      (globalThis as unknown as { api: CurveApi }).api.log.write({
        level: 'info',
        message: 'e2e ipc smoke',
        detail: { spec: 'T0.3' },
      }),
    );
    expect(logged).toEqual({ ok: true, data: { ok: true } });
  });

  test('rejects invalid payloads without crashing the process', async ({ page }) => {
    const results = await page.evaluate(() => {
      const api = (
        globalThis as unknown as {
          api: { log: { write: (request: unknown) => Promise<IpcResult<unknown>> } };
        }
      ).api;

      return Promise.all([
        api.log.write({ level: 'info' }),
        api.log.write({ level: 'info', message: 'hello', extra: true }),
        api.log.write('not-an-object'),
      ]);
    });

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });
      expect(result).not.toHaveProperty('error.stack');
    }

    // The main process must still serve requests after the rejections.
    const info = await page.evaluate(() =>
      (globalThis as unknown as { api: CurveApi }).api.app.info(),
    );
    expect(info.ok).toBe(true);
  });

  test('registers handlers only for the implemented channels', async ({ electronApp }) => {
    // Electron has no public "is this channel handled?" API, so probe it: a
    // second `handle` call for the same channel throws. Channels we can claim
    // are therefore exactly the unhandled ones, and we remove them again.
    const alreadyHandled = await electronApp.evaluate(
      ({ ipcMain }, channels) => {
        const handled: string[] = [];
        for (const channel of channels) {
          try {
            ipcMain.handle(channel, () => null);
            ipcMain.removeHandler(channel);
          } catch {
            handled.push(channel);
          }
        }
        return handled.sort();
      },
      [...ALL_IPC_CHANNELS],
    );

    expect(alreadyHandled).toEqual([...IMPLEMENTED_IPC_CHANNELS].sort());
  });
});
