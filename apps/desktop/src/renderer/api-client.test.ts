import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './api-client';

import type { CurveApi, WorkspaceManifest } from '../shared/contracts/ipc';

const INFO = {
  version: '0.1.0',
  platform: 'win32',
  locale: 'en-US',
  documentsDir: 'C:\\Users\\test\\Documents',
};

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

function bridge(overrides: Partial<CurveApi> = {}): CurveApi {
  const base: CurveApi = {
    app: { info: async () => ({ ok: true, data: INFO }) },
    dialog: { pickDirectory: async () => ({ ok: true, data: null }) },
    log: { write: async () => ({ ok: true, data: { ok: true } }) },
    workspace: {
      create: async () => ({ ok: true, data: MANIFEST }),
      open: async () => ({ ok: true, data: { manifest: MANIFEST, warnings: [] } }),
      close: async () => ({ ok: true, data: { ok: true } }),
      recent: async () => ({ ok: true, data: [] }),
    },
    manifest: { write: async () => ({ ok: true, data: { ok: true } }) },
    table: {
      read: async () => ({ ok: true, data: { jsonl: '', bytes: 0 } }),
      write: async () => ({ ok: true, data: { bytes: 0 } }),
      trash: async () => ({ ok: true, data: { ok: true } }),
    },
    file: {
      importText: async () => ({ ok: true, data: null }),
      exportText: async () => ({ ok: true, data: null }),
      exportCsv: async () => ({ ok: true, data: null }),
      archiveImport: async () => ({
        ok: true,
        data: { copied: true, archivePath: 'imports/a.csv', sidecarPath: 'imports/a.json' },
      }),
    },
  };
  return { ...base, ...overrides };
}

describe('createApiClient', () => {
  it('forwards a valid app:info response', async () => {
    const client = createApiClient(bridge());

    await expect(client.app.info()).resolves.toEqual({ ok: true, data: INFO });
  });

  it('rejects a response whose data does not match the contract', async () => {
    const client = createApiClient(
      bridge({
        app: {
          info: async () => ({ ok: true, data: { version: 1 } }),
        } as unknown as CurveApi['app'],
      }),
    );

    await expect(client.app.info()).resolves.toEqual({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'The main process returned a malformed response.' },
    });
  });

  it('passes an error envelope through', async () => {
    const envelope = {
      ok: false as const,
      error: { code: 'E_WS_LOCKED' as const, message: 'locked' },
    };
    const client = createApiClient(bridge({ app: { info: async () => envelope } }));

    await expect(client.app.info()).resolves.toEqual(envelope);
  });

  it('reports a rejected bridge without leaking the thrown message', async () => {
    const client = createApiClient(
      bridge({
        app: {
          info: async () => {
            throw new Error('SECRET stack details');
          },
        },
      }),
    );

    await expect(client.app.info()).resolves.toEqual({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'The main process did not answer.' },
    });
  });

  it('rejects an invalid log request and never calls the bridge', async () => {
    const write = vi.fn(async () => ({ ok: true as const, data: { ok: true as const } }));
    const client = createApiClient(bridge({ log: { write } }));

    const result = await client.log.write({ level: '', message: 'hello' });

    expect(result).toEqual({
      ok: false,
      error: { code: 'E_VALIDATION', message: 'The request payload is invalid.' },
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('forwards workspace:create and validates the returned manifest', async () => {
    const create = vi.fn(async () => ({ ok: true as const, data: MANIFEST }));
    const client = createApiClient(bridge({ workspace: { ...bridge().workspace, create } }));

    await expect(client.workspace.create({ dir: 'C:/tmp', name: 'Demo' })).resolves.toEqual({
      ok: true,
      data: MANIFEST,
    });
    expect(create).toHaveBeenCalledWith({ dir: 'C:/tmp', name: 'Demo' });
  });

  it('rejects an invalid workspace:create request without calling the bridge', async () => {
    const create = vi.fn(async () => ({ ok: true as const, data: MANIFEST }));
    const client = createApiClient(bridge({ workspace: { ...bridge().workspace, create } }));

    const result = await client.workspace.create({ dir: '', name: 'Demo' });

    expect(result).toMatchObject({ ok: false, error: { code: 'E_VALIDATION' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('forwards workspace:open/close/recent and manifest:write', async () => {
    const open = vi.fn(async () => ({
      ok: true as const,
      data: { manifest: MANIFEST, warnings: [] },
    }));
    const close = vi.fn(async () => ({ ok: true as const, data: { ok: true as const } }));
    const recent = vi.fn(async () => ({ ok: true as const, data: [] }));
    const write = vi.fn(async () => ({ ok: true as const, data: { ok: true as const } }));
    const client = createApiClient(
      bridge({
        workspace: { create: bridge().workspace.create, open, close, recent },
        manifest: { write },
      }),
    );

    await expect(client.workspace.open({ dir: 'C:/tmp/Demo.cstudio' })).resolves.toMatchObject({
      ok: true,
    });
    await expect(client.workspace.close({ workspaceId: 'ws_1' })).resolves.toEqual({
      ok: true,
      data: { ok: true },
    });
    await expect(client.workspace.recent()).resolves.toEqual({ ok: true, data: [] });
    await expect(
      client.manifest.write({ workspaceId: 'ws_1', manifest: MANIFEST }),
    ).resolves.toEqual({ ok: true, data: { ok: true } });

    expect(open).toHaveBeenCalledWith({ dir: 'C:/tmp/Demo.cstudio' });
    expect(close).toHaveBeenCalledWith({ workspaceId: 'ws_1' });
    expect(recent).toHaveBeenCalledWith();
    expect(write).toHaveBeenCalledWith({ workspaceId: 'ws_1', manifest: MANIFEST });
  });

  it('rejects an invalid workspace id before calling the bridge', async () => {
    const close = vi.fn(async () => ({ ok: true as const, data: { ok: true as const } }));
    const client = createApiClient(bridge({ workspace: { ...bridge().workspace, close } }));

    const result = await client.workspace.close({ workspaceId: '../wrong' });

    expect(result).toMatchObject({ ok: false, error: { code: 'E_VALIDATION' } });
    expect(close).not.toHaveBeenCalled();
  });

  it('forwards table:read/write/trash and validates their payloads', async () => {
    const read = vi.fn(async () => ({ ok: true as const, data: { jsonl: 'x\n', bytes: 2 } }));
    const write = vi.fn(async () => ({ ok: true as const, data: { bytes: 2 } }));
    const trash = vi.fn(async () => ({ ok: true as const, data: { ok: true as const } }));
    const client = createApiClient(bridge({ table: { read, write, trash } }));

    await expect(client.table.read({ workspaceId: 'ws_1', tableId: 'tbl_1' })).resolves.toEqual({
      ok: true,
      data: { jsonl: 'x\n', bytes: 2 },
    });
    await expect(
      client.table.write({ workspaceId: 'ws_1', tableId: 'tbl_1', jsonl: 'x\n' }),
    ).resolves.toEqual({ ok: true, data: { bytes: 2 } });
    await expect(client.table.trash({ workspaceId: 'ws_1', tableId: 'tbl_1' })).resolves.toEqual({
      ok: true,
      data: { ok: true },
    });

    expect(read).toHaveBeenCalledWith({ workspaceId: 'ws_1', tableId: 'tbl_1' });
    expect(write).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      tableId: 'tbl_1',
      jsonl: 'x\n',
    });
    expect(trash).toHaveBeenCalledWith({ workspaceId: 'ws_1', tableId: 'tbl_1' });
  });

  it('rejects an invalid table id before calling the bridge', async () => {
    const read = vi.fn(async () => ({ ok: true as const, data: { jsonl: '', bytes: 0 } }));
    const client = createApiClient(bridge({ table: { ...bridge().table, read } }));

    const result = await client.table.read({ workspaceId: 'ws_1', tableId: '../escape' });

    expect(result).toMatchObject({ ok: false, error: { code: 'E_VALIDATION' } });
    expect(read).not.toHaveBeenCalled();
  });

  it('reports an unavailable preload bridge for every namespace', async () => {
    const client = createApiClient(undefined);

    await expect(client.app.info()).resolves.toMatchObject({ ok: false });
    await expect(client.log.write({ level: 'info', message: 'hello' })).resolves.toMatchObject({
      ok: false,
    });
    await expect(client.workspace.create({ dir: 'C:/tmp', name: 'Demo' })).resolves.toMatchObject({
      ok: false,
    });
    await expect(client.workspace.open({ dir: 'C:/tmp' })).resolves.toMatchObject({ ok: false });
    await expect(client.workspace.close({ workspaceId: 'ws_1' })).resolves.toMatchObject({
      ok: false,
    });
    await expect(client.workspace.recent()).resolves.toMatchObject({ ok: false });
    await expect(
      client.manifest.write({ workspaceId: 'ws_1', manifest: MANIFEST }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      client.table.read({ workspaceId: 'ws_1', tableId: 'tbl_1' }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      client.table.write({ workspaceId: 'ws_1', tableId: 'tbl_1', jsonl: '' }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      client.table.trash({ workspaceId: 'ws_1', tableId: 'tbl_1' }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      client.file.importText({ filters: [{ name: 'Data', extensions: ['csv'] }] }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      client.file.exportText({
        suggestedName: 'errors.csv',
        content: 'a\n',
        filters: [{ name: 'Data', extensions: ['csv'] }],
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      client.file.exportCsv({ op: 'append', token: 'tok_1', chunk: 'a,b\r\n' }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      client.file.exportCsv({ op: 'append', token: '', chunk: 'a' }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      client.file.archiveImport({
        workspaceId: 'ws_1',
        token: 'tok_1',
        tableId: 'tbl_1',
        mode: 'append',
        name: 'a.csv',
        sha256: 'a'.repeat(64),
        size: 1,
        encoding: 'utf-8',
        format: 'csv',
      }),
    ).resolves.toMatchObject({ ok: false });
  });

  it('exposes no generic invoke/send escape hatch', () => {
    const client = createApiClient(bridge());

    expect(Object.keys(client)).toEqual([
      'app',
      'dialog',
      'log',
      'workspace',
      'manifest',
      'table',
      'file',
    ]);
    expect(client).not.toHaveProperty('invoke');
    expect(client).not.toHaveProperty('send');
  });
});
