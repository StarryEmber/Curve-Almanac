/**
 * Pure request handler behind `import.worker.ts` (T2.5).
 *
 * One handler instance corresponds to one wizard session. It keeps the decoded
 * text and parsed dataset in the Worker; only the 20-row preview and, at commit
 * time, the accepted rows cross back to the renderer.
 *
 * T6.3: the renderer may force the builtin parser (choosing the "CSV/TSV" or
 * "JSON" registry contribution); `auto` keeps the T2.5 extension sniffing.
 */

import { createAppError, toAppError } from '@curve/domain';
import { parseCsv, parseJson, planImport } from '@curve/table-engine';
import type { ParsedImportData } from '@curve/table-engine';

import { decodeImportBytes } from './encoding';

import type { ImportEncodingChoice } from './encoding';
import type {
  ImportConfigurePayload,
  ImportFormatHint,
  ImportOpenPayload,
  ImportPlanPayload,
  ImportPreview,
  ImportWorkerResponse,
} from './worker-protocol';

interface Session {
  bytes: Uint8Array;
  fileName: string;
  choice: ImportEncodingChoice;
  /** Parser forced by the selected builtin importer, or `auto` (T6.3). */
  format: ImportFormatHint;
  parsed: ParsedImportData;
  encoding: ImportPreview['encoding'];
  encodingMismatch: boolean;
}

export interface ImportWorkerHandler {
  handle(message: unknown): ImportWorkerResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requestId(value: unknown): number {
  if (isRecord(value) && typeof value['id'] === 'number' && Number.isSafeInteger(value['id'])) {
    return value['id'];
  }
  return 0;
}

function requestType(value: unknown): 'open' | 'configure' | 'plan' {
  if (isRecord(value) && (value['type'] === 'open' || value['type'] === 'configure')) {
    return value['type'];
  }
  return 'plan';
}

function formatForFile(fileName: string, hint: ImportFormatHint): 'csv' | 'json' {
  if (hint === 'csv' || hint === 'json') {
    return hint;
  }
  return fileName.toLowerCase().endsWith('.json') ? 'json' : 'csv';
}

function previewOf(session: Session): ImportPreview {
  const parsed = session.parsed;
  return {
    format: parsed.format,
    encoding: session.encoding,
    encodingMismatch: session.encodingMismatch,
    ...(parsed.delimiter === undefined ? {} : { delimiter: parsed.delimiter }),
    hasHeader: parsed.hasHeader,
    headers: [...parsed.headers],
    columns: parsed.columns.map((column) => ({ ...column })),
    previewRows: parsed.rows.slice(0, 20).map((row) => [...row]),
    totalRows: parsed.totalRows,
    warnings: [...parsed.warnings],
  };
}

function parseText(
  text: string,
  fileName: string,
  delimiter: ParsedImportData['delimiter'],
  hasHeader: boolean | undefined,
  format: ImportFormatHint,
): ParsedImportData {
  if (formatForFile(fileName, format) === 'json') {
    return parseJson(text);
  }
  return parseCsv(text, {
    ...(delimiter === undefined ? {} : { delimiter }),
    ...(hasHeader === undefined ? {} : { hasHeader }),
  });
}

export function createImportWorkerHandler(): ImportWorkerHandler {
  let session: Session | null = null;

  const open = (payload: ImportOpenPayload): ImportPreview => {
    const decoded = decodeImportBytes(payload.bytes, 'auto');
    const format = payload.format ?? 'auto';
    const parsed = parseText(decoded.text, payload.fileName, undefined, undefined, format);
    session = {
      bytes: payload.bytes,
      fileName: payload.fileName,
      choice: 'auto',
      format,
      parsed,
      encoding: decoded.encoding,
      encodingMismatch: decoded.mismatch,
    };
    return previewOf(session);
  };

  const configure = (payload: {
    encoding: ImportEncodingChoice;
    delimiter?: ParsedImportData['delimiter'];
    hasHeader?: boolean;
  }): ImportPreview => {
    if (session === null) {
      throw createAppError('E_IMPORT_FORMAT', 'No import file is open.');
    }
    const decoded = decodeImportBytes(session.bytes, payload.encoding);
    const parsed = parseText(
      decoded.text,
      session.fileName,
      payload.delimiter ?? session.parsed.delimiter,
      payload.hasHeader ?? session.parsed.hasHeader,
      session.format,
    );
    session = {
      ...session,
      choice: payload.encoding,
      parsed,
      encoding: decoded.encoding,
      encodingMismatch: decoded.mismatch,
    };
    return previewOf(session);
  };

  return {
    handle(message: unknown): ImportWorkerResponse {
      const id = requestId(message);
      const type = requestType(message);
      if (!isRecord(message) || !isRecord(message['payload'])) {
        return {
          id,
          ok: false,
          type,
          error: createAppError(
            'E_IMPORT_FORMAT',
            'The import worker received a malformed request.',
          ),
        };
      }

      try {
        if (message['type'] === 'open') {
          const payload = message['payload'] as unknown as ImportOpenPayload;
          if (!(payload.bytes instanceof Uint8Array) || typeof payload.fileName !== 'string') {
            throw createAppError('E_IMPORT_FORMAT', 'The import open request is invalid.');
          }
          return {
            id,
            ok: true,
            type: 'open',
            result: open({
              bytes: payload.bytes,
              fileName: payload.fileName,
              ...(payload.format === undefined ? {} : { format: payload.format }),
            }),
          };
        }
        if (message['type'] === 'configure') {
          const payload = message['payload'] as unknown as ImportConfigurePayload;
          const encoding = payload.encoding;
          if (encoding !== 'auto' && encoding !== 'utf-8' && encoding !== 'gb18030') {
            throw createAppError('E_IMPORT_FORMAT', 'The encoding override is invalid.');
          }
          return {
            id,
            ok: true,
            type: 'configure',
            result: configure({
              encoding,
              ...(payload.delimiter === undefined ? {} : { delimiter: payload.delimiter }),
              ...(payload.hasHeader === undefined ? {} : { hasHeader: payload.hasHeader }),
            }),
          };
        }
        if (message['type'] === 'plan') {
          if (session === null) {
            throw createAppError('E_IMPORT_FORMAT', 'No import file is open.');
          }
          const payload = message['payload'] as unknown as ImportPlanPayload;
          const plan = planImport({
            table: payload.table,
            rows: [],
            existingKeys: payload.existingKeys,
            existingRowCount: payload.existingRowCount,
            dataset: session.parsed,
            mappings: payload.mappings,
            ...(payload.newColumns === undefined ? {} : { newColumns: payload.newColumns }),
            mode: payload.mode,
            skipInvalid: payload.skipInvalid,
          });
          return { id, ok: true, type: 'plan', result: plan };
        }

        throw createAppError('E_IMPORT_FORMAT', 'Unknown import worker request.');
      } catch (thrown) {
        return { id, ok: false, type, error: toAppError(thrown) };
      }
    },
  } satisfies ImportWorkerHandler;
}
