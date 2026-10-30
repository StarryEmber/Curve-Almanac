import { describe, expect, it } from 'vitest';

import {
  POINTS_FORMAT_MESSAGE,
  POINTS_IMPORTER_ID,
  parsePointsJson,
  pointsImporter,
} from './points-importer';

function expectFormatError(action: () => unknown): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  expect(caught).toMatchObject({ code: 'E_IMPORT_FORMAT' });
}

describe('parsePointsJson', () => {
  it('parses the documented {"points": [...]} shape', () => {
    const result = parsePointsJson('{"points":[{"x":1,"y":2},{"x":2,"y":4}]}');

    expect(result.headers).toEqual(['x', 'y']);
    expect(result.rows).toEqual([
      [1, 2],
      [2, 4],
    ]);
    expect(result.columns).toEqual([
      { name: 'x', type: 'number' },
      { name: 'y', type: 'number' },
    ]);
    expect(result.warnings).toBeUndefined();
  });

  it('also accepts a bare array of points and keeps an optional label column', () => {
    const result = parsePointsJson('[{"x":1,"y":2,"label":"a"},{"x":2,"y":4,"label":"b"}]');

    expect(result.headers).toEqual(['x', 'y', 'label']);
    expect(result.rows).toEqual([
      [1, 2, 'a'],
      [2, 4, 'b'],
    ]);
    expect(result.columns?.[2]).toEqual({ name: 'label', type: 'text' });
  });

  it('fills the label column with null when only some points carry one', () => {
    const result = parsePointsJson('{"points":[{"x":1,"y":2,"label":"a"},{"x":2,"y":3}]}');

    expect(result.headers).toEqual(['x', 'y', 'label']);
    expect(result.rows).toEqual([
      [1, 2, 'a'],
      [2, 3, null],
    ]);
  });

  it('reports an empty point list as a warning, not an error', () => {
    const result = parsePointsJson('{"points":[]}');

    expect(result.rows).toEqual([]);
    expect(result.headers).toEqual(['x', 'y']);
    expect(result.warnings).toEqual(['The file contains no points.']);
  });

  it('rejects invalid JSON, unknown roots and non-numeric coordinates', () => {
    expectFormatError(() => parsePointsJson('{'));
    expectFormatError(() => parsePointsJson('{"rows":[]}'));
    expectFormatError(() => parsePointsJson('"points"'));
    expectFormatError(() => parsePointsJson('{"points":[{"x":"1","y":2}]}'));
    expectFormatError(() => parsePointsJson('{"points":[{"x":1}]}'));
    expectFormatError(() => parsePointsJson('{"points":[{"x":1,"y":2,"label":{"a":1}}]}'));
    expectFormatError(() => parsePointsJson('{"points":[42]}'));
  });

  it('points every format error at the shared contract message', () => {
    expect(() => parsePointsJson('{"points":[{}]}')).toThrow(POINTS_FORMAT_MESSAGE);
  });
});

describe('pointsImporter', () => {
  it('declares the plugin importer contract', () => {
    expect(pointsImporter.id).toBe(POINTS_IMPORTER_ID);
    expect(pointsImporter.label.length).toBeGreaterThan(0);
    expect(pointsImporter.extensions).toEqual(['.json']);
  });

  it('parses through the async contract', async () => {
    const result = await pointsImporter.parse(
      { fileName: 'points.json', text: '[{"x":1,"y":2}]', locale: 'en-US' },
      new AbortController().signal,
    );
    expect(result.rows).toEqual([[1, 2]]);
  });

  it('refuses to start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      pointsImporter.parse(
        { fileName: 'points.json', text: '[{"x":1,"y":2}]', locale: 'en-US' },
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'E_IMPORT_FORMAT' });
  });
});
