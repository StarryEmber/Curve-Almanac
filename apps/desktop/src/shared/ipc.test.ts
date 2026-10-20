import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS, isIpcResult } from './ipc';

describe('IPC channel names', () => {
  it('uses the channel names frozen by SPEC §15.1', () => {
    expect(IPC_CHANNELS.appInfo).toBe('app:info');
  });
});

describe('isIpcResult', () => {
  it('accepts a success envelope with data', () => {
    expect(isIpcResult({ ok: true, data: { version: '0.1.0' } })).toBe(true);
  });

  it('accepts an error envelope with a code and message', () => {
    expect(isIpcResult({ ok: false, error: { code: 'E_UNKNOWN', message: 'boom' } })).toBe(true);
  });

  it('rejects non-objects, missing data and malformed errors', () => {
    expect(isIpcResult(null)).toBe(false);
    expect(isIpcResult('ok')).toBe(false);
    expect(isIpcResult({ ok: true })).toBe(false);
    expect(isIpcResult({ ok: false })).toBe(false);
    expect(isIpcResult({ ok: false, error: 'boom' })).toBe(false);
    expect(isIpcResult({ ok: false, error: { code: 1, message: 'boom' } })).toBe(false);
    expect(isIpcResult({ ok: 'yes', data: 1 })).toBe(false);
  });
});
