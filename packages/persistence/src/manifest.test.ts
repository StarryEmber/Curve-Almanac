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

/** T6.2: a table whose value column carries a plugin semantic field type. */
const RATING_COLUMNS: TableMeta['columns'] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' },
  {
    id: 'col_value',
    key: 'value',
    label: 'Value',
    type: 'number',
    role: 'none',
    fieldTypeId: 'com.curvealmanac.rating',
  },
];

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

function manifestWithViews(): WorkspaceManifest {
  const manifest = manifestWithTable();
  manifest.views.push(
    {
      id: 'viw_1',
      kind: 'table',
      refId: 'tbl_1',
      title: 'One',
      tableView: {
        tableId: 'tbl_1',
        styleId: 'builtin.report-light',
        columnOrder: ['col_id'],
        widths: {},
        hiddenColumnIds: [],
        sort: [],
        frozenColumnCount: 0,
      },
    },
    {
      id: 'viw_2',
      kind: 'table',
      refId: 'tbl_1',
      title: 'Two',
      tableView: {
        tableId: 'tbl_1',
        styleId: 'builtin.report-light',
        columnOrder: ['col_id'],
        widths: {},
        hiddenColumnIds: [],
        sort: [],
        frozenColumnCount: 0,
      },
    },
  );
  manifest.layout = {
    type: 'pane',
    viewIds: ['viw_1', 'viw_2'],
    activeViewId: 'viw_1',
  };
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

  it('seeds the manifest with the application preferences (T5.5)', () => {
    const manifest = createEmptyManifest({
      name: 'Seed',
      appVersion: '0.1.0',
      now: NOW,
      uuid: () => 'seed',
      settings: {
        theme: 'dark',
        locale: 'en-US',
        autosave: false,
        defaultTableStyleId: 'builtin.finance',
      },
    });

    expect(manifest.settings).toEqual({
      theme: 'dark',
      locale: 'en-US',
      autosave: false,
      defaultTableStyleId: 'builtin.finance',
    });
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

  it('warns when a semantic field type cannot be resolved', () => {
    const manifest = manifestWithTable({ columns: RATING_COLUMNS });

    const validated = validateManifest(manifest);
    expect(validated.warnings.join('\n')).toContain('cannot verify field type');

    const resolved = validateManifest(manifest, {
      resolveFieldTypeStorage: (fieldTypeId) =>
        fieldTypeId === 'com.curvealmanac.rating' ? 'number' : undefined,
    });
    expect(resolved.warnings).toEqual([]);
  });

  it('rejects unknown or mismatched semantic field types when a resolver is passed', () => {
    const manifest = manifestWithTable({ columns: RATING_COLUMNS });

    expect(() => validateManifest(manifest, { resolveFieldTypeStorage: () => undefined })).toThrow(
      expect.objectContaining({ code: 'E_WS_INVALID_MANIFEST' }),
    );
    expect(() => validateManifest(manifest, { resolveFieldTypeStorage: () => 'text' })).toThrow(
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

  it('repairs a layout that references a missing view and keeps every tab', () => {
    const manifest = manifestWithViews();
    manifest.layout = {
      type: 'pane',
      viewIds: ['viw_1', 'viw_missing'],
      activeViewId: 'viw_1',
    };

    expect(() => validateManifest(manifest)).toThrow(
      expect.objectContaining({ code: 'E_WS_INVALID_MANIFEST' }),
    );
    const parsed = parseManifestDocument(serializeManifest(manifest));

    expect(parsed.manifest.layout).toEqual({
      type: 'pane',
      viewIds: ['viw_1', 'viw_2'],
      activeViewId: 'viw_1',
    });
    expect(parsed.warnings).toEqual([
      expect.stringContaining('layout was invalid; restored a single pane with 2 view(s)'),
    ]);
  });

  it('repairs a layout with an out-of-range split ratio', () => {
    const manifest = manifestWithViews();
    manifest.layout = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.1,
      first: { type: 'pane', viewIds: ['viw_1'], activeViewId: 'viw_1' },
      second: { type: 'pane', viewIds: ['viw_2'], activeViewId: 'viw_2' },
    };

    const parsed = parseManifestDocument(serializeManifest(manifest));

    expect(parsed.manifest.layout).toEqual({
      type: 'pane',
      viewIds: ['viw_1', 'viw_2'],
      activeViewId: 'viw_1',
    });
    expect(parsed.warnings[0]).toContain('layout was invalid');
  });

  it('still rejects a non-layout invariant failure when repairing the layout', () => {
    const manifest = manifestWithViews();
    manifest.tables[0] = table({ primaryKey: 'col_missing' });
    manifest.layout = { type: 'pane', viewIds: ['viw_missing'], activeViewId: null };

    expect(() => parseManifestDocument(serializeManifest(manifest))).toThrow(
      expect.objectContaining({ code: 'E_WS_INVALID_MANIFEST' }),
    );
  });
});
