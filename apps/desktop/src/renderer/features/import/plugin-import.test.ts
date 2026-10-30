import { describe, expect, it } from 'vitest';

import { POINTS_IMPORTER_ID, pointsImporter } from '@curve/plugin-sample';
import type { ImporterDef } from '@curve/plugin-sdk';

import { runPluginImport } from './plugin-import';

const encoder = new TextEncoder();

function request(overrides: Partial<Parameters<typeof runPluginImport>[0]> = {}) {
  return {
    importer: pointsImporter,
    bytes: encoder.encode('{"points":[{"x":1,"y":2,"label":"a"},{"x":2,"y":4}]}'),
    fileName: 'points.json',
    locale: 'en-US' as const,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe('runPluginImport', () => {
  it('decodes the bytes, runs the importer and builds the wizard preview', async () => {
    const outcome = await runPluginImport(request());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.session.importerId).toBe(POINTS_IMPORTER_ID);
    expect(outcome.session.importerLabel).toBe('Points JSON');
    expect(outcome.session.preview).toMatchObject({
      format: 'json',
      importerLabel: 'Points JSON',
      headers: ['x', 'y', 'label'],
      hasHeader: true,
      totalRows: 2,
    });
    expect(outcome.session.preview.previewRows).toEqual([
      [1, 2, 'a'],
      [2, 4, null],
    ]);
    expect(outcome.session.dataset.columns.map((column) => column.type)).toEqual([
      'number',
      'number',
      'text',
    ]);
    expect(outcome.session.preview.encoding).toBe('utf-8');
  });

  it('falls back to inferred column types when the importer supplies none', async () => {
    const outcome = await runPluginImport(
      request({
        importer: {
          ...pointsImporter,
          parse: async () => ({
            headers: ['name', 'value'],
            rows: [
              ['a', '1'],
              ['b', '2'],
            ],
          }),
        },
      }),
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.session.dataset.columns.map((column) => column.type)).toEqual([
        'text',
        'number',
      ]);
    }
  });

  it('turns a malformed plugin dataset into an AppError result', async () => {
    const outcome = await runPluginImport(
      request({
        importer: {
          ...pointsImporter,
          // A non-string header must be rejected instead of crashing the wizard.
          parse: async () => ({ headers: [1], rows: [] }) as never,
        },
      }),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_UNKNOWN');
      expect(outcome.error.message).toContain('invalid dataset');
    }
  });

  it('reports importer failures as AppErrors instead of rejecting', async () => {
    const failing: ImporterDef = {
      ...pointsImporter,
      parse: async () => {
        throw new Error('boom');
      },
    };

    const outcome = await runPluginImport(request({ importer: failing }));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.message).toBe('boom');
    }
  });
});
