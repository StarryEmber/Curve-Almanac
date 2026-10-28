import { describe, expect, it } from 'vitest';

import {
  appInfoRequestSchema,
  appInfoResponseSchema,
  exportCsvRequestSchema,
  exportCsvResponseSchema,
  exportTextRequestSchema,
  logWriteRequestSchema,
  logWriteResponseSchema,
  manifestWriteRequestSchema,
  manifestWriteResponseSchema,
  pickDirectoryRequestSchema,
  pickDirectoryResponseSchema,
  quitRequestSchema,
  quitResponseRequestSchema,
  quitResponseResponseSchema,
  workspaceCloseRequestSchema,
  workspaceCloseResponseSchema,
  workspaceCreateRequestSchema,
  workspaceCreateResponseSchema,
  workspaceInspectRequestSchema,
  workspaceInspectResponseSchema,
  workspaceOpenRequestSchema,
  workspaceOpenResponseSchema,
  workspaceRecentClearRequestSchema,
  workspaceRecentRemoveRequestSchema,
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

describe('file:exportCsv contract', () => {
  const filters = [{ name: 'CSV', extensions: ['csv'] }];

  it('accepts the four streaming operations', () => {
    expect(
      exportCsvRequestSchema.safeParse({ op: 'begin', suggestedName: 'Data.csv', filters }).success,
    ).toBe(true);
    expect(
      exportCsvRequestSchema.safeParse({ op: 'append', token: 'tok_1', chunk: '\uFEFFa,b\r\n' })
        .success,
    ).toBe(true);
    expect(
      exportCsvRequestSchema.safeParse({ op: 'finish', token: 'tok_1', rows: 2 }).success,
    ).toBe(true);
    expect(exportCsvRequestSchema.safeParse({ op: 'cancel', token: 'tok_1' }).success).toBe(true);
  });

  it('rejects unknown operations, missing tokens and extra fields', () => {
    expect(exportCsvRequestSchema.safeParse({ op: 'write', token: 't', chunk: 'x' }).success).toBe(
      false,
    );
    expect(exportCsvRequestSchema.safeParse({ op: 'append', chunk: 'x' }).success).toBe(false);
    expect(exportCsvRequestSchema.safeParse({ op: 'append', token: '', chunk: 'x' }).success).toBe(
      false,
    );
    expect(
      exportCsvRequestSchema.safeParse({ op: 'append', token: 't', chunk: 'x', path: 'C:/x' })
        .success,
    ).toBe(false);
    expect(exportCsvRequestSchema.safeParse({ op: 'finish', token: 't', rows: -1 }).success).toBe(
      false,
    );
    expect(
      exportCsvRequestSchema.safeParse({ op: 'begin', suggestedName: '', filters }).success,
    ).toBe(false);
    expect(
      exportCsvRequestSchema.safeParse({ op: 'begin', suggestedName: 'x', filters: [] }).success,
    ).toBe(false);
  });

  it('accepts every successful reply shape and null for a cancelled dialog', () => {
    expect(
      exportCsvResponseSchema.safeParse({ op: 'begin', token: 'tok_1', path: 'C:/out.csv' })
        .success,
    ).toBe(true);
    expect(exportCsvResponseSchema.safeParse({ op: 'append', bytes: 10 }).success).toBe(true);
    expect(
      exportCsvResponseSchema.safeParse({
        op: 'finish',
        path: 'C:/out.csv',
        bytes: 10,
        rows: 1,
      }).success,
    ).toBe(true);
    expect(exportCsvResponseSchema.safeParse({ op: 'cancel', removed: true }).success).toBe(true);
    expect(exportCsvResponseSchema.safeParse(null).success).toBe(true);
  });

  it('rejects malformed replies', () => {
    expect(exportCsvResponseSchema.safeParse({ op: 'begin', token: 't' }).success).toBe(false);
    expect(exportCsvResponseSchema.safeParse({ op: 'append', bytes: -1 }).success).toBe(false);
    expect(
      exportCsvResponseSchema.safeParse({ op: 'finish', path: 'C:/out.csv', bytes: 1 }).success,
    ).toBe(false);
    expect(exportCsvResponseSchema.safeParse({ op: 'cancel', removed: 'yes' }).success).toBe(false);
  });
});

describe('file:exportText contract', () => {
  const filters = [{ name: 'PNG image', extensions: ['png'] }];

  it('accepts text without encoding and base64 with the T4.5 extension', () => {
    expect(
      exportTextRequestSchema.safeParse({
        suggestedName: 'chart.curvestyle.json',
        content: '{}',
        filters,
      }).success,
    ).toBe(true);
    expect(
      exportTextRequestSchema.safeParse({
        suggestedName: 'chart.png',
        content: 'iVBORw0KGgo=',
        encoding: 'base64',
        filters,
      }).success,
    ).toBe(true);
    expect(
      exportTextRequestSchema.safeParse({
        suggestedName: 'chart.png',
        content: 'x',
        encoding: 'utf8',
        filters,
      }).success,
    ).toBe(true);
  });

  it('rejects unknown encodings and extra fields', () => {
    expect(
      exportTextRequestSchema.safeParse({
        suggestedName: 'chart.png',
        content: 'x',
        encoding: 'binary',
        filters,
      }).success,
    ).toBe(false);
    expect(
      exportTextRequestSchema.safeParse({
        suggestedName: 'chart.png',
        content: 'x',
        filters,
        path: 'C:/anywhere.png',
      }).success,
    ).toBe(false);
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

  it('accepts the T5.3 recovery choice and rejects unknown fields', () => {
    expect(
      workspaceOpenRequestSchema.safeParse({
        dir: 'C:/tmp/Demo.cstudio',
        recovery: { acceptStaleLock: true, manifestBackup: 'backups/manifest.x.json.bak' },
      }).success,
    ).toBe(true);
    expect(
      workspaceOpenRequestSchema.safeParse({ dir: 'C:/tmp/Demo.cstudio', recovery: {} }).success,
    ).toBe(true);
    expect(
      workspaceOpenRequestSchema.safeParse({
        dir: 'C:/tmp/Demo.cstudio',
        recovery: { manifestBackup: '' },
      }).success,
    ).toBe(false);
    expect(
      workspaceOpenRequestSchema.safeParse({
        dir: 'C:/tmp/Demo.cstudio',
        recovery: { restoreEverything: true },
      }).success,
    ).toBe(false);
  });

  it('accepts the workspace inspection reply and rejects malformed ones', () => {
    const inspection = {
      dir: 'C:/tmp/Demo.cstudio',
      name: 'Demo',
      lock: 'stale',
      manifest: 'ok',
      backups: [
        {
          path: 'backups/manifest.20260101T000000000Z.json.bak',
          createdAt: '2026-01-01T00:00:00.000Z',
          bytes: 42,
        },
      ],
    };
    expect(workspaceInspectRequestSchema.safeParse({ dir: 'C:/tmp/Demo.cstudio' }).success).toBe(
      true,
    );
    expect(workspaceInspectRequestSchema.safeParse({ dir: '' }).success).toBe(false);
    expect(workspaceInspectResponseSchema.safeParse(inspection).success).toBe(true);
    expect(
      workspaceInspectResponseSchema.safeParse({ ...inspection, manifest: 'broken' }).success,
    ).toBe(false);
    expect(
      workspaceInspectResponseSchema.safeParse({ ...inspection, name: undefined }).success,
    ).toBe(false);
  });

  it('validates the recent-list mutations and the quit handshake', () => {
    expect(workspaceRecentRemoveRequestSchema.safeParse({ path: 'C:/Demo.cstudio' }).success).toBe(
      true,
    );
    expect(workspaceRecentRemoveRequestSchema.safeParse({ path: '' }).success).toBe(false);
    expect(workspaceRecentRemoveRequestSchema.safeParse({ path: 'x', extra: 1 }).success).toBe(
      false,
    );
    expect(workspaceRecentClearRequestSchema.safeParse(undefined).success).toBe(true);
    expect(workspaceRecentClearRequestSchema.safeParse({}).success).toBe(true);
    expect(workspaceRecentClearRequestSchema.safeParse({ path: 'x' }).success).toBe(false);

    expect(quitRequestSchema.safeParse({ reason: 'window-close' }).success).toBe(true);
    expect(quitRequestSchema.safeParse({ reason: 'app-quit' }).success).toBe(true);
    expect(quitRequestSchema.safeParse({ reason: 'crash' }).success).toBe(false);
    expect(quitResponseRequestSchema.safeParse({ action: 'quit', flushed: false }).success).toBe(
      true,
    );
    expect(quitResponseRequestSchema.safeParse({ action: 'maybe', flushed: false }).success).toBe(
      false,
    );
    expect(quitResponseResponseSchema.safeParse({ ok: true }).success).toBe(true);
  });
});
