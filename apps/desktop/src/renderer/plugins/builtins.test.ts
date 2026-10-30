import { describe, expect, it } from 'vitest';

import { createPluginHost } from '@curve/plugin-sdk';

import {
  BUILTIN_CHART_KINDS,
  BUILTIN_COLUMN_TYPES,
  BUILTIN_CSV_IMPORTER_ID,
  BUILTIN_FIELD_TYPES,
  BUILTIN_JSON_IMPORTER_ID,
  builtinCsvImporter,
  builtinImporterFormat,
  builtinJsonImporter,
  registerBuiltinContributions,
} from './builtins';

import { activateRendererPlugins, findFieldType } from './index';

const EN = { locale: 'en-US' };
const abortSignal = new AbortController().signal;

function fieldType(id: string) {
  const found = BUILTIN_FIELD_TYPES.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`missing builtin field type ${id}`);
  }
  return found;
}

describe('builtin field types (SPEC §14.4)', () => {
  it('declares the five storage types in dialog order', () => {
    expect(BUILTIN_FIELD_TYPES.map((entry) => entry.id)).toEqual([
      'text',
      'number',
      'date',
      'boolean',
      'enum',
    ]);
    expect(BUILTIN_COLUMN_TYPES).toEqual(['text', 'number', 'date', 'boolean', 'enum']);
    for (const entry of BUILTIN_FIELD_TYPES) {
      expect(entry.storageType).toBe(entry.id);
      expect(entry.defaultWidth).toBeGreaterThan(0);
    }
  });

  it('parses text into the physical cell shape', () => {
    expect(fieldType('text').parseText('  hello  ')).toEqual({ ok: true, value: '  hello  ' });
    expect(fieldType('text').parseText('   ')).toEqual({ ok: true, value: '' });
    expect(fieldType('number').parseText('1,234.5')).toEqual({ ok: true, value: 1234.5 });
    expect(fieldType('number').parseText('')).toEqual({ ok: true, value: null });
    expect(fieldType('number').parseText('nope').ok).toBe(false);
    expect(fieldType('boolean').parseText('是')).toEqual({ ok: true, value: true });
    expect(fieldType('boolean').parseText('0')).toEqual({ ok: true, value: false });
    expect(fieldType('enum').parseText('  active ')).toEqual({ ok: true, value: 'active' });
    expect(fieldType('enum').parseText('  ')).toEqual({ ok: true, value: null });
    expect(fieldType('date').parseText('2026-01-01')).toEqual({
      ok: true,
      value: new Date(2026, 0, 1).getTime(),
    });
    expect(fieldType('date').parseText('2026-02-30').ok).toBe(false);
  });

  it('formats through the domain formatter and keeps nulls empty', () => {
    expect(fieldType('number').format(1234.5, EN)).toBe('1234.5');
    expect(fieldType('number').format(1234.5, { locale: 'en-US', precision: 2 })).toBe('1,234.50');
    expect(fieldType('number').format(null, EN)).toBe('');
    expect(fieldType('text').format('x', EN)).toBe('x');
    expect(fieldType('boolean').format(true, EN)).toBe('true');
    expect(fieldType('date').format(new Date(2026, 0, 1).getTime(), EN)).toBe('01/01/2026');
  });

  it('validates only the value domain and leaves emptiness to the storage rules', () => {
    const column = {
      id: 'col_1',
      key: 'value',
      label: 'Value',
      type: 'number' as const,
      role: 'none' as const,
    };
    expect(fieldType('number').validate(null, column)).toBeNull();
    expect(fieldType('number').validate(1, column)).toBeNull();
    expect(fieldType('number').validate(Number.POSITIVE_INFINITY, column)).toContain('finite');
    expect(fieldType('enum').validate(3, { ...column, type: 'enum' })).toContain('enum');
    expect(fieldType('date').validate(1.5, { ...column, type: 'date' })).toContain('epoch');
  });

  it('sorts nulls last and compares values by their storage type', () => {
    expect(fieldType('number').compare(2, 1)).toBeGreaterThan(0);
    expect(fieldType('number').compare(null, 1)).toBe(1);
    expect(fieldType('number').compare(1, null)).toBe(-1);
    expect(fieldType('number').compare(null, null)).toBe(0);
    expect(fieldType('text').compare('a', 'b')).toBeLessThan(0);
    expect(fieldType('boolean').compare(false, true)).toBeLessThan(0);
  });
});

describe('builtin importers', () => {
  it('maps importer ids to the Worker parser', () => {
    expect(builtinImporterFormat(BUILTIN_CSV_IMPORTER_ID)).toBe('csv');
    expect(builtinImporterFormat(BUILTIN_JSON_IMPORTER_ID)).toBe('json');
    expect(builtinImporterFormat('com.curvealmanac.points')).toBeUndefined();
  });

  it('parses CSV text into the shared ImportResult shape', async () => {
    const result = await builtinCsvImporter.parse(
      { fileName: 'data.csv', text: 'id;value\na;1\nb;2\n', locale: 'en-US' },
      abortSignal,
    );
    expect(result.headers).toEqual(['id', 'value']);
    expect(result.rows).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    expect(result.columns?.map((column) => column.type)).toEqual(['text', 'number']);
  });

  it('parses JSON objects and rejects aborted work', async () => {
    const result = await builtinJsonImporter.parse(
      { fileName: 'data.json', text: '[{"x":1,"y":2}]', locale: 'en-US' },
      abortSignal,
    );
    expect(result.headers).toEqual(['x', 'y']);
    expect(result.rows).toEqual([[1, 2]]);

    const controller = new AbortController();
    controller.abort();
    await expect(
      builtinCsvImporter.parse(
        { fileName: 'data.csv', text: 'a\n1\n', locale: 'en-US' },
        controller.signal,
      ),
    ).rejects.toThrow();
  });

  it('declares the extensions the file picker offers', () => {
    expect(builtinCsvImporter.extensions).toContain('.csv');
    expect(builtinCsvImporter.extensions).toContain('.tsv');
    expect(builtinJsonImporter.extensions).toEqual(['.json']);
  });
});

describe('registerBuiltinContributions', () => {
  it('registers the five field types, two importers and three chart kinds as builtins', () => {
    const host = createPluginHost({ plugins: [] });
    registerBuiltinContributions(host);

    expect(host.fields.list().map((entry) => entry.id)).toEqual([
      'text',
      'number',
      'date',
      'boolean',
      'enum',
    ]);
    expect(host.importers.list().map((entry) => entry.id)).toEqual([
      BUILTIN_CSV_IMPORTER_ID,
      BUILTIN_JSON_IMPORTER_ID,
    ]);
    expect(host.chartKinds.list().map((entry) => entry.id)).toEqual(['line', 'scatter', 'bar']);
    for (const registry of [host.fields, host.importers, host.chartKinds]) {
      expect(registry.list().every((entry) => entry.source.kind === 'builtin')).toBe(true);
    }
    expect(BUILTIN_CHART_KINDS.map((kind) => kind.seriesType)).toEqual(['line', 'scatter', 'bar']);
  });

  it('refuses a second registration (ids are unique per host)', () => {
    const host = createPluginHost({ plugins: [] });
    registerBuiltinContributions(host);
    expect(() => {
      registerBuiltinContributions(host);
    }).toThrow();
  });

  it('registers the same definitions the renderer assembly point exposes', async () => {
    await activateRendererPlugins();
    expect(findFieldType('number')?.storageType).toBe('number');
    expect(findFieldType('number')?.parseText('3').ok).toBe(true);
    expect(findFieldType('number')).toBe(fieldType('number'));
  });
});

describe('builtin field type guards', () => {
  it('rejects unknown storage values before they reach the registry', () => {
    const host = createPluginHost({ plugins: [] });
    expect(() => {
      host.fields.register('com.test.bad', {
        ...BUILTIN_FIELD_TYPES[0],
        storageType: 'money',
      } as never);
    }).toThrow();
  });
});
