import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './api-client';

import type { CurveApi } from '../shared/contracts/ipc';

const INFO = { version: '0.1.0', platform: 'win32', locale: 'en-US' };

function bridgeReturning(
  infoResult: unknown,
  writeResult: unknown = { ok: true, data: { ok: true } },
): CurveApi {
  return {
    app: { info: async () => infoResult },
    log: { write: async () => writeResult },
  } as unknown as CurveApi;
}

describe('createApiClient', () => {
  it('forwards a valid app:info response', async () => {
    const client = createApiClient(bridgeReturning({ ok: true, data: INFO }));

    await expect(client.app.info()).resolves.toEqual({ ok: true, data: INFO });
  });

  it('rejects a response whose data does not match the contract', async () => {
    const client = createApiClient(bridgeReturning({ ok: true, data: { version: 1 } }));

    await expect(client.app.info()).resolves.toEqual({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'The main process returned a malformed response.' },
    });
  });

  it('passes an error envelope through', async () => {
    const envelope = { ok: false, error: { code: 'E_WS_LOCKED', message: 'locked' } };
    const client = createApiClient(bridgeReturning(envelope));

    await expect(client.app.info()).resolves.toEqual(envelope);
  });

  it('reports a rejected bridge without leaking the thrown message', async () => {
    const client = createApiClient({
      app: {
        info: async () => {
          throw new Error('SECRET stack details');
        },
      },
      log: { write: async () => ({ ok: true, data: { ok: true } }) },
    });

    const result = await client.app.info();

    expect(result).toEqual({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'The main process did not answer.' },
    });
  });

  it('rejects an invalid request and never calls the bridge', async () => {
    const write = vi.fn(async () => ({ ok: true as const, data: { ok: true as const } }));
    const client = createApiClient({
      app: { info: async () => ({ ok: true, data: INFO }) },
      log: { write },
    });

    const result = await client.log.write({ level: '', message: 'hello' });

    expect(result).toEqual({
      ok: false,
      error: { code: 'E_VALIDATION', message: 'The request payload is invalid.' },
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('validates the log:write reply', async () => {
    const client = createApiClient(
      bridgeReturning({ ok: true, data: INFO }, { ok: true, data: {} }),
    );

    const result = await client.log.write({ level: 'info', message: 'hello' });

    expect(result).toMatchObject({ ok: false, error: { code: 'E_UNKNOWN' } });
  });

  it('reports an unavailable preload bridge', async () => {
    const client = createApiClient(undefined);

    await expect(client.app.info()).resolves.toEqual({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'The preload bridge is unavailable.' },
    });
    await expect(client.log.write({ level: 'info', message: 'hello' })).resolves.toMatchObject({
      ok: false,
    });
  });

  it('exposes no generic invoke/send escape hatch', () => {
    const client = createApiClient(bridgeReturning({ ok: true, data: INFO }));

    expect(Object.keys(client)).toEqual(['app', 'log']);
    expect(client).not.toHaveProperty('invoke');
    expect(client).not.toHaveProperty('send');
  });
});
