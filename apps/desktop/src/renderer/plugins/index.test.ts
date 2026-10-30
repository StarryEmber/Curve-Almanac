import { describe, expect, it } from 'vitest';

import { createAppError } from '@curve/domain';
import type { Cell, ColumnDef } from '@curve/domain';
import { POINTS_IMPORTER_ID, RATING_FIELD_TYPE_ID, SAMPLE_PLUGIN_ID } from '@curve/plugin-sample';
import type { CommandDef, FieldTypeDef, RegistryEntry } from '@curve/plugin-sdk';

import { clearPluginErrorDedupe, subscribePluginErrors } from './errors';

import {
  activateRendererPlugins,
  fieldTypeLookup,
  findChartKind,
  findFieldType,
  findImporter,
  findPluginCommand,
  formatFieldCell,
  getPluginStates,
  listChartKinds,
  listFieldTypes,
  listImporters,
  listPluginCommands,
  pluginHost,
  pluginNameFor,
  readPluginSnapshot,
  runPluginCommand,
  setPluginEnabled,
  subscribePluginChanges,
} from './index';

import type { PluginErrorEvent } from './errors';

const RATING_COLUMN: ColumnDef = {
  id: 'col_rating',
  key: 'rating',
  label: 'Rating',
  type: 'number',
  role: 'none',
  fieldTypeId: RATING_FIELD_TYPE_ID,
};

function fakeFieldType(overrides: Partial<FieldTypeDef> = {}): FieldTypeDef {
  return {
    id: 'com.test.extra',
    label: 'Extra',
    storageType: 'text',
    parseText: (raw: string) => ({ ok: true, value: raw }),
    format: (value: Cell) => String(value ?? ''),
    validate: () => null,
    compare: () => 0,
    defaultWidth: 100,
    ...overrides,
  };
}

function collectErrors(): { events: PluginErrorEvent[]; unsubscribe: () => void } {
  const events: PluginErrorEvent[] = [];
  const unsubscribe = subscribePluginErrors((event) => {
    events.push(event);
  });
  return { events, unsubscribe };
}

describe('renderer plugin assembly point', () => {
  it('registers the builtin contributions before activating the plugins', async () => {
    const first = await activateRendererPlugins();
    const second = await activateRendererPlugins();

    // Same promise: activation is not repeated on later calls.
    expect(second).toBe(first);
    expect(first).toEqual([expect.objectContaining({ id: SAMPLE_PLUGIN_ID, status: 'active' })]);

    // SPEC §14.4: five builtin field types, CSV/TSV + JSON importers, three
    // chart kinds — all registered through the host, builtin entries first.
    expect(listFieldTypes().map((entry) => entry.id)).toEqual([
      'text',
      'number',
      'date',
      'boolean',
      'enum',
      RATING_FIELD_TYPE_ID,
    ]);
    expect(listImporters().map((entry) => entry.id)).toEqual([
      'builtin.csv',
      'builtin.json',
      POINTS_IMPORTER_ID,
    ]);
    expect(listChartKinds().map((entry) => entry.id)).toEqual(['line', 'scatter', 'bar']);
    expect(
      listFieldTypes()
        .slice(0, 5)
        .every((entry) => entry.source.kind === 'builtin'),
    ).toBe(true);
    expect(listFieldTypes()[5]?.source).toEqual({ kind: 'plugin', pluginId: SAMPLE_PLUGIN_ID });

    expect(findFieldType(RATING_FIELD_TYPE_ID)?.storageType).toBe('number');
    expect(fieldTypeLookup(RATING_FIELD_TYPE_ID)?.id).toBe(RATING_FIELD_TYPE_ID);
    expect(findChartKind('bar')?.seriesType).toBe('bar');
    expect(pluginNameFor(SAMPLE_PLUGIN_ID)).toContain('Sample');
    expect(pluginNameFor('com.unknown.plugin')).toBe('com.unknown.plugin');
    expect(getPluginStates()).toEqual([
      expect.objectContaining({ id: SAMPLE_PLUGIN_ID, status: 'active' }),
    ]);
  });

  it('formats semantic cells and falls back when no field type applies', () => {
    expect(formatFieldCell(3, RATING_COLUMN, 'en-US')).toBe('★★★');
    expect(formatFieldCell(null, RATING_COLUMN, 'en-US')).toBe('');

    // No field type on the column, or an unregistered one: storage formatting.
    expect(formatFieldCell(3, { ...RATING_COLUMN, fieldTypeId: undefined }, 'en-US')).toBeNull();
    expect(formatFieldCell(3, { ...RATING_COLUMN, fieldTypeId: 'unknown' }, 'en-US')).toBeNull();
  });

  it('runs the registered importers through the async contract', async () => {
    const plugin = findImporter(POINTS_IMPORTER_ID);
    const csv = findImporter('builtin.csv');
    if (plugin === undefined || csv === undefined) {
      throw new Error('the importers were not registered');
    }

    const signal = new AbortController().signal;
    const points = await plugin.parse(
      { fileName: 'points.json', text: '[{"x":1,"y":2}]', locale: 'en-US' },
      signal,
    );
    expect(points.rows).toEqual([[1, 2]]);

    const parsed = await csv.parse(
      { fileName: 'data.csv', text: 'id,value\na,1\n', locale: 'en-US' },
      signal,
    );
    expect(parsed.headers).toEqual(['id', 'value']);
    // Raw CSV cells stay strings; type coercion happens in the import plan.
    expect(parsed.rows).toEqual([['a', '1']]);
  });
});

describe('plugin registry snapshot (T6.3)', () => {
  it('publishes a snapshot and notifies subscribers on contribution changes', () => {
    const snapshot = readPluginSnapshot();
    expect(snapshot.fields.length).toBeGreaterThan(5);
    expect(snapshot.plugins.length).toBeGreaterThan(0);

    let notifications = 0;
    const unsubscribe = subscribePluginChanges(() => {
      notifications += 1;
    });
    const dispose = pluginHost.fields.register('com.test.extra', fakeFieldType());
    expect(notifications).toBeGreaterThan(0);
    expect(readPluginSnapshot().fields.some((entry) => entry.id === 'com.test.extra')).toBe(true);

    dispose();
    expect(readPluginSnapshot().fields.some((entry) => entry.id === 'com.test.extra')).toBe(false);

    unsubscribe();
    const before = notifications;
    const disposeAgain = pluginHost.fields.register('com.test.extra', fakeFieldType());
    expect(notifications).toBe(before);
    disposeAgain();
  });

  it('disables and re-enables a plugin through the host (session only)', async () => {
    await activateRendererPlugins();

    const disabled = await setPluginEnabled(SAMPLE_PLUGIN_ID, false);
    expect(disabled.status).toBe('inactive');
    expect(listFieldTypes().map((entry) => entry.id)).not.toContain(RATING_FIELD_TYPE_ID);
    expect(listImporters().map((entry) => entry.id)).not.toContain(POINTS_IMPORTER_ID);

    const enabled = await setPluginEnabled(SAMPLE_PLUGIN_ID, true);
    expect(enabled.status).toBe('active');
    expect(listFieldTypes().map((entry) => entry.id)).toContain(RATING_FIELD_TYPE_ID);
    expect(listImporters().map((entry) => entry.id)).toContain(POINTS_IMPORTER_ID);
  });

  it('has no plugin commands in the sample plugin', () => {
    expect(listPluginCommands()).toEqual([]);
    expect(findPluginCommand('plugin.com.curvealmanac.sample.fail')).toBeUndefined();
  });
});

describe('plugin contribution isolation (T6.3)', () => {
  it('turns a throwing formatter into a reported error and a storage fallback', () => {
    const { events, unsubscribe } = collectErrors();
    clearPluginErrorDedupe();
    const dispose = pluginHost.fields.register(
      'com.test.throwing',
      fakeFieldType({
        id: 'com.test.throwing',
        storageType: 'number',
        format: () => {
          throw createAppError('E_PLUGIN_ACTIVATE', 'formatter exploded');
        },
      }),
    );

    const column: ColumnDef = {
      id: 'col_throwing',
      key: 'throwing',
      label: 'Throwing',
      type: 'number',
      role: 'none',
      fieldTypeId: 'com.test.throwing',
    };
    expect(formatFieldCell(1, column, 'en-US')).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]?.error.code).toBe('E_PLUGIN_ACTIVATE');

    dispose();
    unsubscribe();
  });

  it('runs a plugin command with an execute adapter and reports its failure', async () => {
    await activateRendererPlugins();
    const { events, unsubscribe } = collectErrors();
    clearPluginErrorDedupe();

    const executed: { commandId: string; payload: unknown }[] = [];
    const success: RegistryEntry<CommandDef> = {
      id: 'plugin.com.test.ok',
      def: {
        id: 'plugin.com.test.ok',
        label: 'Run',
        run: async (context) => {
          await context.execute('table.meta.update', { tableId: 'tbl_1' });
        },
      },
      source: { kind: 'plugin', pluginId: SAMPLE_PLUGIN_ID },
    };
    await runPluginCommand(success, async (commandId, payload) => {
      executed.push({ commandId, payload });
    });
    expect(executed).toEqual([{ commandId: 'table.meta.update', payload: { tableId: 'tbl_1' } }]);
    expect(events).toEqual([]);

    const failure: RegistryEntry<CommandDef> = {
      id: 'plugin.com.test.fail',
      def: {
        id: 'plugin.com.test.fail',
        label: 'Fail',
        run: async () => {
          throw createAppError('E_PLUGIN_ACTIVATE', 'command exploded');
        },
      },
      source: { kind: 'plugin', pluginId: SAMPLE_PLUGIN_ID },
    };
    await runPluginCommand(failure, async () => undefined);
    expect(events).toHaveLength(1);
    expect(events[0]?.pluginId).toBe(SAMPLE_PLUGIN_ID);
    expect(events[0]?.pluginName).toContain('Sample');
    expect(events[0]?.error.code).toBe('E_PLUGIN_ACTIVATE');

    unsubscribe();
  });
});
