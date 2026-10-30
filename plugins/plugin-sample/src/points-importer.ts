/**
 * Points JSON importer (T6.2, SPEC §14.2).
 *
 * The plugin demonstrates the `ImporterDef` contract without touching the
 * builtin CSV/JSON pipeline: it accepts either `{ "points": [{ "x", "y" }] }`
 * (the documented shape) or a bare array of point objects, and returns the
 * shared `ImportResult` so the T2.5 wizard can plan and commit it.
 */

import { createAppError } from '@curve/domain';
import type { ImportCellValue, ImportResult, ImporterDef } from '@curve/plugin-sdk';

export const POINTS_IMPORTER_ID = 'com.curvealmanac.points';
export const POINTS_IMPORTER_LABEL = 'Points JSON';

export const POINTS_FORMAT_MESSAGE =
  'A points file must be {"points": [{ "x": number, "y": number }]} or an array of point objects.';

interface Point {
  readonly x: number;
  readonly y: number;
  readonly label: ImportCellValue | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string, detail?: string): never {
  throw createAppError('E_IMPORT_FORMAT', message, detail === undefined ? {} : { detail });
}

function readPointList(payload: unknown): readonly unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isRecord(payload)) {
    const points = payload['points'];
    if (Array.isArray(points)) {
      return points;
    }
  }
  return invalid(POINTS_FORMAT_MESSAGE);
}

function readCoordinate(candidate: Record<string, unknown>, key: 'x' | 'y', path: string): number {
  const value = candidate[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(POINTS_FORMAT_MESSAGE, `${path}.${key} must be a finite number`);
  }
  return value;
}

function readLabel(candidate: Record<string, unknown>, path: string): ImportCellValue | undefined {
  const value = candidate['label'];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return invalid(POINTS_FORMAT_MESSAGE, `${path}.label must be text, a number or a boolean`);
}

function readPoint(raw: unknown, index: number): Point {
  const path = `points[${String(index)}]`;
  if (!isRecord(raw)) {
    invalid(POINTS_FORMAT_MESSAGE, `${path} must be an object`);
  }
  return {
    x: readCoordinate(raw, 'x', path),
    y: readCoordinate(raw, 'y', path),
    label: readLabel(raw, path),
  };
}

/**
 * Parses points JSON into the shared import shape.
 *
 * Invalid input throws `E_IMPORT_FORMAT`; an empty list is a valid (empty)
 * dataset with a warning instead of an error, mirroring the CSV/JSON importers.
 */
export function parsePointsJson(text: string): ImportResult {
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return invalid(POINTS_FORMAT_MESSAGE, 'the file is not valid JSON');
  }

  const points = readPointList(payload).map((raw, index) => readPoint(raw, index));
  const hasLabel = points.some((point) => point.label !== undefined);
  const headers = hasLabel ? ['x', 'y', 'label'] : ['x', 'y'];
  const rows: ImportCellValue[][] = points.map((point) =>
    hasLabel ? [point.x, point.y, point.label ?? null] : [point.x, point.y],
  );

  const result: ImportResult = {
    headers,
    rows,
    columns: hasLabel
      ? [
          { name: 'x', type: 'number' },
          { name: 'y', type: 'number' },
          { name: 'label', type: 'text' },
        ]
      : [
          { name: 'x', type: 'number' },
          { name: 'y', type: 'number' },
        ],
  };
  if (rows.length === 0) {
    return { ...result, warnings: ['The file contains no points.'] };
  }
  return result;
}

function aborted(): never {
  throw createAppError('E_IMPORT_FORMAT', 'The points import was cancelled.');
}

export const pointsImporter: ImporterDef = {
  id: POINTS_IMPORTER_ID,
  label: POINTS_IMPORTER_LABEL,
  extensions: ['.json'],
  async parse(input, signal) {
    if (signal.aborted) {
      aborted();
    }
    const result = parsePointsJson(input.text);
    if (signal.aborted) {
      aborted();
    }
    return result;
  },
};
