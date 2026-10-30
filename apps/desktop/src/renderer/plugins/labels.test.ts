import { describe, expect, it } from 'vitest';

import type { PluginState, RegistryEntry } from '@curve/plugin-sdk';

import { createTranslator } from '../i18n';

import {
  builtinFieldTypeKey,
  chartKindOptionLabel,
  contributionLabel,
  fieldTypeOptionLabel,
  importerOptionLabel,
  isBuiltinFieldTypeId,
  pluginDisplayName,
  pluginNameOfSource,
} from './labels';

const zh = createTranslator('zh-CN');
const en = createTranslator('en-US');

const PLUGINS: readonly PluginState[] = [
  {
    id: 'com.curvealmanac.sample',
    name: 'Sample: Rating & Points',
    version: '1.0.0',
    apiVersion: '1.0',
    status: 'active',
  },
];

const BUILTIN_SOURCE = { kind: 'builtin' } as const;
const PLUGIN_SOURCE = { kind: 'plugin', pluginId: 'com.curvealmanac.sample' } as const;

function entry<T>(id: string, def: T, source: RegistryEntry<T>['source']): RegistryEntry<T> {
  return { id, def, source };
}

describe('contribution labels', () => {
  it('recognises the five builtin field type ids', () => {
    expect(isBuiltinFieldTypeId('number')).toBe(true);
    expect(isBuiltinFieldTypeId('com.curvealmanac.rating')).toBe(false);
    expect(builtinFieldTypeKey('enum')).toBe('columns.type.enum');
  });

  it('resolves plugin names and returns null for builtins', () => {
    expect(pluginNameOfSource(BUILTIN_SOURCE, PLUGINS)).toBeNull();
    expect(pluginNameOfSource(PLUGIN_SOURCE, PLUGINS)).toBe('Sample: Rating & Points');
    expect(pluginNameOfSource({ kind: 'plugin', pluginId: 'missing' }, PLUGINS)).toBe('missing');
  });

  it('appends a localised source suffix only to plugin labels', () => {
    expect(contributionLabel('Builtin', BUILTIN_SOURCE, PLUGINS, zh)).toBe('Builtin');
    expect(contributionLabel('Rating', PLUGIN_SOURCE, PLUGINS, zh)).toBe(
      'Rating（插件：Sample: Rating & Points）',
    );
    expect(contributionLabel('Rating', PLUGIN_SOURCE, PLUGINS, en)).toBe(
      'Rating (plugin: Sample: Rating & Points)',
    );
  });

  it('uses message-table copy for builtin field types and chart kinds', () => {
    const field = entry(
      'number',
      {
        id: 'number',
        label: 'Number',
        storageType: 'number' as const,
        parseText: () => ({ ok: true as const, value: null }),
        format: () => '',
        validate: () => null,
        compare: () => 0,
        defaultWidth: 120,
      },
      BUILTIN_SOURCE,
    );
    expect(fieldTypeOptionLabel(field, PLUGINS, zh)).toBe('数字');
    expect(fieldTypeOptionLabel(field, PLUGINS, en)).toBe('Number');

    const chartKind = entry(
      'line',
      { id: 'line', label: 'Line', seriesType: 'line' as const },
      BUILTIN_SOURCE,
    );
    expect(chartKindOptionLabel(chartKind, PLUGINS, zh)).toBe('折线图');

    const pluginKind = entry(
      'com.test.area',
      { id: 'com.test.area', label: 'Area', seriesType: 'line' as const },
      PLUGIN_SOURCE,
    );
    expect(chartKindOptionLabel(pluginKind, PLUGINS, zh)).toContain('Area');
    expect(chartKindOptionLabel(pluginKind, PLUGINS, zh)).toContain('Sample');
  });

  it('labels importers from the registry definition', () => {
    const importer = entry(
      'builtin.csv',
      {
        id: 'builtin.csv',
        label: 'CSV / TSV',
        extensions: ['.csv'],
        parse: async () => ({ headers: [], rows: [] }),
      },
      BUILTIN_SOURCE,
    );
    expect(importerOptionLabel(importer, PLUGINS, zh)).toBe('CSV / TSV');
  });

  it('names the source plugin for toasts, falling back to the builtin label', () => {
    expect(pluginDisplayName(null, PLUGINS, zh)).toBe('内置');
    expect(pluginDisplayName('com.curvealmanac.sample', PLUGINS, zh)).toBe(
      'Sample: Rating & Points',
    );
    expect(pluginDisplayName('gone', PLUGINS, zh)).toBe('gone');
  });
});
