import { describe, expect, it } from 'vitest';

import type { ColumnDef } from '@curve/domain';
import { POINTS_IMPORTER_ID, RATING_FIELD_TYPE_ID, SAMPLE_PLUGIN_ID } from '@curve/plugin-sample';

import {
  activateRendererPlugins,
  fieldTypeLookup,
  findFieldType,
  findImporter,
  formatFieldCell,
  listFieldTypes,
  listImporters,
} from './index';

const RATING_COLUMN: ColumnDef = {
  id: 'col_rating',
  key: 'rating',
  label: 'Rating',
  type: 'number',
  role: 'none',
  fieldTypeId: RATING_FIELD_TYPE_ID,
};

describe('renderer plugin assembly point', () => {
  it('activates the compiled-in plugin once and exposes its contributions', async () => {
    const first = await activateRendererPlugins();
    const second = await activateRendererPlugins();

    // Same promise: activation is not repeated on later calls.
    expect(second).toBe(first);
    expect(first).toEqual([expect.objectContaining({ id: SAMPLE_PLUGIN_ID, status: 'active' })]);
    expect(listFieldTypes().map((entry) => entry.id)).toEqual([RATING_FIELD_TYPE_ID]);
    expect(listImporters().map((entry) => entry.id)).toEqual([POINTS_IMPORTER_ID]);
    expect(listFieldTypes()[0]?.source).toEqual({
      kind: 'plugin',
      pluginId: SAMPLE_PLUGIN_ID,
    });
    expect(findFieldType(RATING_FIELD_TYPE_ID)?.storageType).toBe('number');
    expect(fieldTypeLookup(RATING_FIELD_TYPE_ID)?.id).toBe(RATING_FIELD_TYPE_ID);
  });

  it('formats semantic cells and falls back when no field type applies', () => {
    expect(formatFieldCell(3, RATING_COLUMN, 'en-US')).toBe('★★★');
    expect(formatFieldCell(null, RATING_COLUMN, 'en-US')).toBe('');

    // No field type on the column, or an unregistered one: storage formatting.
    expect(formatFieldCell(3, { ...RATING_COLUMN, fieldTypeId: undefined }, 'en-US')).toBeNull();
    expect(formatFieldCell(3, { ...RATING_COLUMN, fieldTypeId: 'unknown' }, 'en-US')).toBeNull();
  });

  it('runs the registered importer through the async contract', async () => {
    const importer = findImporter(POINTS_IMPORTER_ID);
    if (importer === undefined) {
      throw new Error('the sample importer was not activated');
    }

    const result = await importer.parse(
      { fileName: 'points.json', text: '[{"x":1,"y":2}]', locale: 'en-US' },
      new AbortController().signal,
    );

    expect(result.rows).toEqual([[1, 2]]);
  });
});
