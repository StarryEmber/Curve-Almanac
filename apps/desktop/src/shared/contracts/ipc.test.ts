import { describe, expect, it } from 'vitest';

import {
  appInfoRequestSchema,
  appInfoResponseSchema,
  logWriteRequestSchema,
  logWriteResponseSchema,
} from './ipc';

describe('app:info contract', () => {
  it('accepts the documented response', () => {
    const parsed = appInfoResponseSchema.safeParse({
      version: '0.1.0',
      platform: 'win32',
      locale: 'zh-CN',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects a response with a missing or empty field', () => {
    expect(appInfoResponseSchema.safeParse({ version: '0.1.0', platform: 'win32' }).success).toBe(
      false,
    );
    expect(
      appInfoResponseSchema.safeParse({ version: '', platform: 'win32', locale: 'zh-CN' }).success,
    ).toBe(false);
  });

  it('rejects a response with fields outside the contract', () => {
    expect(
      appInfoResponseSchema.safeParse({
        version: '0.1.0',
        platform: 'win32',
        locale: 'zh-CN',
        extra: 1,
      }).success,
    ).toBe(false);
  });

  it('accepts an empty request and rejects unexpected request fields', () => {
    expect(appInfoRequestSchema.safeParse(undefined).success).toBe(true);
    expect(appInfoRequestSchema.safeParse({}).success).toBe(true);
    expect(appInfoRequestSchema.safeParse({ dir: 'C:/elsewhere' }).success).toBe(false);
    expect(appInfoRequestSchema.safeParse('app:info').success).toBe(false);
  });
});

describe('log:write contract', () => {
  it('accepts a minimal request', () => {
    expect(logWriteRequestSchema.safeParse({ level: 'info', message: 'hello' }).success).toBe(true);
  });

  it('accepts an arbitrary detail value', () => {
    expect(
      logWriteRequestSchema.safeParse({
        level: 'error',
        message: 'failed',
        detail: { table: 't1', bytes: 12 },
      }).success,
    ).toBe(true);
    expect(
      logWriteRequestSchema.safeParse({ level: 'error', message: 'failed', detail: 'EACCES' })
        .success,
    ).toBe(true);
  });

  it('rejects a missing, blank or non-string message', () => {
    expect(logWriteRequestSchema.safeParse({ level: 'info' }).success).toBe(false);
    expect(logWriteRequestSchema.safeParse({ level: 'info', message: '' }).success).toBe(false);
    expect(logWriteRequestSchema.safeParse({ level: 'info', message: 42 }).success).toBe(false);
  });

  it('rejects a missing or blank level', () => {
    expect(logWriteRequestSchema.safeParse({ message: 'hello' }).success).toBe(false);
    expect(logWriteRequestSchema.safeParse({ level: '', message: 'hello' }).success).toBe(false);
  });

  it('rejects fields outside the contract', () => {
    expect(
      logWriteRequestSchema.safeParse({ level: 'info', message: 'hello', stack: 'at foo' }).success,
    ).toBe(false);
  });

  it('accepts only the { ok: true } reply', () => {
    expect(logWriteResponseSchema.safeParse({ ok: true }).success).toBe(true);
    expect(logWriteResponseSchema.safeParse({ ok: false }).success).toBe(false);
    expect(logWriteResponseSchema.safeParse({}).success).toBe(false);
  });
});
