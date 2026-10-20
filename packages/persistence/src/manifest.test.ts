import { describe, expect, it } from 'vitest';

import type { TableMeta, WorkspaceManifest } from '@curve/domain';

import {
  createEmptyManifest,
  formatValidationIssues,
  parseManifestDocument,
  serializeManifest,
  validateManifest,
} from './manifest';

const NOW = new Date('2026-10-20T00:00:00.000Z');

function table(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Table',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [{ id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' }],
    primaryKey: 'col_id',
    rowCount: 0,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}

function manifestWithTable(tableOverrides: Partial<TableMeta> = {}): WorkspaceManifest {
  const manifest = createEmptyManifest({ name: 'Demo', appVersion: '0.1.0', now: NOW });
  manifest.tables.push(table(tableOverrides));
  return manifest;
}

describe('createEmptyManifest', () => {
  it('creates a valid empty manifest matching the SPEC §6.5 shape', () => {
    const manifest = createEmptyManifest({
      name: '  Demo  ',
      appVersion: '0.1.0',
      now: NOW,
      uuid: () => 'fixed',
    });

    expect(manifest).toEqual({
      formatVersion: 1,
      id: 'ws_fixed',
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
    });
  });

  it('rejects an empty name and an empty app version', () => {
    expect(() => createEmptyManifest({ name: '   ', appVersion: '0.1.0' })).toThrow(
      expect.objectContaining({ code: 'E_VALIDATION' }),
    );
    expect(() => createEmptyManifest({ name: 'Demo', appVersion: ' ' })).toThrow(
      expect.objectContaining({ code: 'E_VALIDATION' }),
    );
  });
});

describe('validateManifest', () => {
  it('accepts a manifest with a table whose file matches its id', () => {
    const validated = validateManifest(manifestWithTable());

    expect(validated.manifest.tables).toHaveLength(1);
    expect(validated.warnings).toEqual([]);
  });

  it('rejects unknown fields instead of silently dropping them', () => {
    const manifest = manifestWithTable();
    const candidate = { ...manifest, extra: true };

    expect(() => validateManifest(candidate)).toThrow(
      expect.objectContaining({ code: 'E_WS_INVALID_MANIFEST' }),
    );
  });

  it('rejects a table file path that does not match the table id', () => {
    expect(() => validateManifest(manifestWithTable({ file: 'tables/other.jsonl' }))).toThrow(
      expect.objectContaining({ code: 'E_WS_INVALID_MANIFEST' }),
    );
  });

  it('rejects a broken cross-object invariant', () => {
    expect(() => validateManifest(manifestWithTable({ primaryKey: 'col_missing' }))).toThrow(
      expect.objectContaining({ code: 'E_WS_INVALID_MANIFEST' }),
    );
  });

  it('rejects a manifest id that does not match the open workspace', () => {
    expect(() => validateManifest(manifestWithTable(), { workspaceId: 'ws_other' })).toThrow(
      expect.objectContaining({ code: 'E_WS_INVALID_MANIFEST' }),
    );
  });

  it('formats only paths and issue codes, never values', () => {
    expect(
      formatValidationIssues([
        { path: 'tables[0].name', code: 'E_REQUIRED', message: 'secret value' },
      ]),
    ).toBe('tables[0].name: E_REQUIRED');
  });
});

describe('parseManifestDocument', () => {
  it('round-trips a serialized manifest', () => {
    const manifest = manifestWithTable();
    const raw = serializeManifest(manifest);

    expect(raw.endsWith('\n')).toBe(true);
    expect(parseManifestDocument(raw).manifest).toEqual(manifest);
  });

  it('rejects malformed JSON without throwing a raw SyntaxError', () => {
    expect(() => parseManifestDocument('{not json')).toThrow(
      expect.objectContaining({ code: 'E_WS_INVALID_MANIFEST' }),
    );
  });

  it('reports a future formatVersion before schema validation', () => {
    const raw = serializeManifest(manifestWithTable()).replace(
      '"formatVersion": 1',
      '"formatVersion": 2',
    );

    expect(() => parseManifestDocument(raw)).toThrow(
      expect.objectContaining({ code: 'E_WS_VERSION_UNSUPPORTED' }),
    );
  });

  it('rejects a non-numeric version as an invalid manifest', () => {
    const raw = serializeManifest(manifestWithTable()).replace(
      '"formatVersion": 1',
      '"formatVersion": "2"',
    );

    expect(() => parseManifestDocument(raw)).toThrow(
      expect.objectContaining({ code: 'E_WS_INVALID_MANIFEST' }),
    );
  });
});
