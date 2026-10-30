/**
 * Plugin importer bridge for the T2.5 wizard (T6.2, SPEC §14.2).
 *
 * Plugins are renderer modules, so a plugin importer cannot run inside the
 * import Worker: the renderer decodes the file text, calls
 * `ImporterDef.parse(input, signal)` and converts the shared `ImportResult`
 * into the same `ParsedImportData` the Worker produces for CSV/JSON. Planning
 * then runs in the renderer for this session only; the builtin path keeps using
 * the Worker unchanged.
 */

import { toAppError } from '@curve/domain';
import type { ImportResult, ImporterDef } from '@curve/plugin-sdk';
import { buildImportColumns } from '@curve/table-engine';
import type { ImportedColumn, ParsedImportData } from '@curve/table-engine';

import { decodeImportBytes } from '../../import/encoding';

import type { ImportPreview } from '../../import/worker-protocol';

export interface PluginImportSession {
  readonly importerId: string;
  readonly importerLabel: string;
  readonly dataset: ParsedImportData;
  readonly preview: ImportPreview;
}

export interface PluginImportRequest {
  readonly importer: ImporterDef;
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly locale: 'zh-CN' | 'en-US';
  readonly signal: AbortSignal;
}

export type PluginImportOutcome =
  | { readonly ok: true; readonly session: PluginImportSession }
  | { readonly ok: false; readonly error: ReturnType<typeof toAppError> };

const PREVIEW_ROWS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rejects a malformed plugin result instead of letting it crash the wizard. */
function isValidResult(value: unknown): value is ImportResult {
  if (!isRecord(value) || !Array.isArray(value['headers']) || !Array.isArray(value['rows'])) {
    return false;
  }
  const headers = value['headers'];
  if (!headers.every((header) => typeof header === 'string')) {
    return false;
  }
  const rows = value['rows'];
  return rows.every(
    (row) =>
      Array.isArray(row) &&
      row.every(
        (cell) =>
          cell === null ||
          typeof cell === 'string' ||
          typeof cell === 'number' ||
          typeof cell === 'boolean',
      ),
  );
}

function columnsOf(
  result: ImportResult,
  headers: readonly string[],
  rows: readonly (readonly (string | number | boolean | null)[])[],
): readonly ImportedColumn[] {
  if (result.columns !== undefined && result.columns.length === headers.length) {
    return result.columns.map((column, index) => ({
      index,
      name: column.name,
      type: column.type,
      confidence: 1,
      sampleSize: rows.length,
    }));
  }
  return buildImportColumns(
    headers,
    rows.map((row) => [...row]),
  );
}

/**
 * Decodes the file, runs the plugin importer and builds the wizard preview.
 * Aborts and importer failures resolve to an `AppError`, never a rejection.
 */
export async function runPluginImport(request: PluginImportRequest): Promise<PluginImportOutcome> {
  try {
    const decoded = decodeImportBytes(request.bytes, 'auto');
    const result: unknown = await request.importer.parse(
      { fileName: request.fileName, text: decoded.text, locale: request.locale },
      request.signal,
    );
    if (!isValidResult(result)) {
      return {
        ok: false,
        error: toAppError(new Error('The plugin importer returned an invalid dataset.')),
      };
    }

    const headers = [...result.headers];
    const rows = result.rows.map((row) => [...row]);
    const dataset: ParsedImportData = {
      // Plugin datasets are JSON-shaped; `format` only drives the CSV-only
      // controls of the wizard, and the importer label is shown instead.
      format: 'json',
      hasHeader: true,
      headers,
      rows,
      totalRows: rows.length,
      warnings: result.warnings === undefined ? [] : [...result.warnings],
      columns: [...columnsOf(result, headers, rows)],
    };
    const preview: ImportPreview = {
      format: dataset.format,
      encoding: decoded.encoding,
      encodingMismatch: decoded.mismatch,
      hasHeader: true,
      headers: [...dataset.headers],
      columns: dataset.columns.map((column) => ({ ...column })),
      previewRows: dataset.rows.slice(0, PREVIEW_ROWS).map((row) => [...row]),
      totalRows: dataset.totalRows,
      warnings: [...dataset.warnings],
      importerLabel: request.importer.label,
    };

    return {
      ok: true,
      session: {
        importerId: request.importer.id,
        importerLabel: request.importer.label,
        dataset,
        preview,
      },
    };
  } catch (thrown) {
    return { ok: false, error: toAppError(thrown) };
  }
}
