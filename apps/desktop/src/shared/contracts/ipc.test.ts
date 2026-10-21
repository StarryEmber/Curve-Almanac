import { describe, expect, it } from 'vitest';

import {
  appInfoRequestSchema,
  appInfoResponseSchema,
  logWriteRequestSchema,
  logWriteResponseSchema,
  manifestWriteRequestSchema,
  manifestWriteResponseSchema,
  pickDirectoryRequestSchema,
  pickDirectoryResponseSchema,
  workspaceCloseRequestSchema,
  workspaceCloseResponseSchema,
  workspaceCreateRequestSchema,
  workspaceCreateResponseSchema,
  workspaceOpenRequestSchema,
  workspaceOpenResponseSchema,
  workspaceRecentRequestSchema,
  workspaceRecentResponseSchema,
} from './ipc';

const MANIFEST = {
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

describe('app:info contract', () => {
  it('accepts the documented response', () => {
    const parsed = appInfoResponseSchema.safeParse({
      version: '0.1.0',
      platform: 'win32',
      locale: 'zh-CN',
      documentsDir: 'C:\\Users\\test\\Documents',
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
    expect(
      appInfoResponseSchema.safeParse({
        version: '0.1.0',
        platform: 'win32',
        locale: 'zh-CN',
        documentsDir: '',
      }).success,
    ).toBe(false);
  });

  it('rejects a response with fields outside the contract', () => {
    expect(
      appInfoResponseSchema.safeParse({
        version: '0.1.0',
        platform: 'win32',
        locale: 'zh-CN',
        documentsDir: 'C:\\Users\\test\\Documents',
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

describe('dialog:pickDirectory contract', () => {
  it('accepts an optional title and defaultPath', () => {
    expect(pickDirectoryRequestSchema.safeParse({}).success).toBe(true);
    expect(
      pickDirectoryRequestSchema.safeParse({
        title: 'Choose',
        defaultPath: 'C:\\Users\\test\\Documents\\Curve Studio',
      }).success,
    ).toBe(true);
    expect(pickDirectoryRequestSchema.safeParse({ defaultPath: '' }).success).toBe(false);
    expect(pickDirectoryRequestSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('accepts a path or null and rejects malformed replies', () => {
    expect(pickDirectoryResponseSchema.safeParse({ path: 'C:\\picked' }).success).toBe(true);
    expect(pickDirectoryResponseSchema.safeParse(null).success).toBe(true);
    expect(pickDirectoryResponseSchema.safeParse({ path: '' }).success).toBe(false);
    expect(pickDirectoryResponseSchema.safeParse({}).success).toBe(false);
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

describe('workspace contract', () => {
  it('accepts create/open requests and rejects missing or extra fields', () => {
    expect(workspaceCreateRequestSchema.safeParse({ dir: 'C:/tmp', name: 'Demo' }).success).toBe(
      true,
    );
    expect(workspaceCreateRequestSchema.safeParse({ dir: '', name: 'Demo' }).success).toBe(false);
    expect(
      workspaceCreateRequestSchema.safeParse({ dir: 'C:/tmp', name: 'Demo', x: 1 }).success,
    ).toBe(false);
    expect(workspaceOpenRequestSchema.safeParse({ dir: 'C:/tmp/Demo.cstudio' }).success).toBe(true);
    expect(workspaceOpenRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a valid manifest response and rejects an invalid one', () => {
    expect(workspaceCreateResponseSchema.safeParse(MANIFEST).success).toBe(true);
    expect(workspaceCreateResponseSchema.safeParse({ ...MANIFEST, formatVersion: 2 }).success).toBe(
      false,
    );
    expect(
      workspaceOpenResponseSchema.safeParse({ manifest: MANIFEST, warnings: [] }).success,
    ).toBe(true);
    expect(workspaceOpenResponseSchema.safeParse({ manifest: MANIFEST }).success).toBe(false);
  });

  it('validates workspace ids and the recent list', () => {
    expect(workspaceCloseRequestSchema.safeParse({ workspaceId: 'ws_1' }).success).toBe(true);
    expect(workspaceCloseRequestSchema.safeParse({ workspaceId: '../escape' }).success).toBe(false);
    expect(workspaceCloseResponseSchema.safeParse({ ok: true }).success).toBe(true);
    expect(workspaceRecentRequestSchema.safeParse(undefined).success).toBe(true);
    expect(workspaceRecentRequestSchema.safeParse({}).success).toBe(true);
    expect(workspaceRecentResponseSchema.safeParse([]).success).toBe(true);
    expect(
      workspaceRecentResponseSchema.safeParse([
        { path: 'C:/tmp/Demo.cstudio', name: 'Demo', lastOpenedAt: '2026-10-20T00:00:00.000Z' },
      ]).success,
    ).toBe(true);
    expect(
      workspaceRecentResponseSchema.safeParse([
        { path: 'C:/tmp/Demo.cstudio', name: 'Demo', lastOpenedAt: 'not-a-date' },
      ]).success,
    ).toBe(false);
  });

  it('requires a valid manifest for manifest:write', () => {
    expect(
      manifestWriteRequestSchema.safeParse({ workspaceId: 'ws_1', manifest: MANIFEST }).success,
    ).toBe(true);
    expect(
      manifestWriteRequestSchema.safeParse({ workspaceId: 'ws_1', manifest: {} }).success,
    ).toBe(false);
    expect(manifestWriteResponseSchema.safeParse({ ok: true }).success).toBe(true);
  });
});
