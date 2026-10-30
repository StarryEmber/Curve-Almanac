import { afterEach, describe, expect, it } from 'vitest';

import { createPluginHost } from '@curve/plugin-sdk';
import type { PluginHost } from '@curve/plugin-sdk';

import {
  POINTS_IMPORTER_ID,
  RATING_FIELD_TYPE_ID,
  SAMPLE_PLUGIN_ID,
  SAMPLE_PLUGIN_NAME,
  SAMPLE_PLUGIN_VERSION,
  sampleFieldTypes,
  samplePlugin,
} from './index';

/**
 * These tests exercise the plugin through the real SDK host (no desktop code):
 * activation, contribution registration and rollback after deactivation.
 */
describe('sample plugin', () => {
  let host: PluginHost | null = null;

  afterEach(() => {
    host?.dispose();
    host = null;
  });

  it('declares a semver definition compatible with the v1 host API', () => {
    expect(samplePlugin.id).toBe(SAMPLE_PLUGIN_ID);
    expect(samplePlugin.name).toBe(SAMPLE_PLUGIN_NAME);
    expect(samplePlugin.version).toBe(SAMPLE_PLUGIN_VERSION);
    expect(samplePlugin.apiVersion).toBe('1.0');
    expect(samplePlugin.activate).toBeTypeOf('function');
  });

  it('registers the rating field type and the points importer when activated', async () => {
    host = createPluginHost({ plugins: [samplePlugin] });
    const states = await host.activateAll();

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ id: SAMPLE_PLUGIN_ID, status: 'active' });

    const field = host.fields.get(RATING_FIELD_TYPE_ID);
    expect(field?.storageType).toBe('number');
    expect(host.fields.list()).toEqual([
      {
        id: RATING_FIELD_TYPE_ID,
        def: field,
        source: { kind: 'plugin', pluginId: SAMPLE_PLUGIN_ID },
      },
    ]);

    const importer = host.importers.get(POINTS_IMPORTER_ID);
    expect(importer?.extensions).toEqual(['.json']);
  });

  it('removes every contribution after deactivation', async () => {
    host = createPluginHost({ plugins: [samplePlugin] });
    await host.activateAll();
    expect(host.fields.get(RATING_FIELD_TYPE_ID)).toBeDefined();

    const state = await host.deactivate(SAMPLE_PLUGIN_ID);

    expect(state.status).toBe('inactive');
    expect(host.fields.list()).toEqual([]);
    expect(host.importers.list()).toEqual([]);
  });

  it('exposes its field types for processes that only validate data', () => {
    expect(sampleFieldTypes.map((fieldType) => fieldType.id)).toEqual([RATING_FIELD_TYPE_ID]);
    expect(sampleFieldTypes[0]?.storageType).toBe('number');
  });

  it('does not keep contribution ids inside the builtin namespace', () => {
    for (const fieldType of sampleFieldTypes) {
      expect(fieldType.id).toContain('.');
      expect(['number', 'text', 'date', 'boolean', 'enum']).not.toContain(fieldType.id);
    }
  });
});
