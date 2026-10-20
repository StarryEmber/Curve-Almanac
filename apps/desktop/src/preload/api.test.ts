import { describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../shared/contracts/channels';

import { createCurveApi } from './api';

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

  it('exposes no generic invoke/send escape hatch', () => {
    const api = createCurveApi(async () => ({ ok: true, data: null }));

    expect(Object.keys(api)).toEqual(['app', 'log']);
    expect(Object.keys(api.app)).toEqual(['info']);
    expect(Object.keys(api.log)).toEqual(['write']);
    expect(api).not.toHaveProperty('invoke');
    expect(api).not.toHaveProperty('send');
    expect(api).not.toHaveProperty('ipcRenderer');
  });
});
