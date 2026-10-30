/**
 * Worker protocol for the T2.5 import pipeline.
 *
 * The client creates one dedicated Worker per wizard session. The Worker keeps
 * the decoded text and parsed dataset; the renderer only receives a 20-row
 * preview until the user commits, when `plan` returns the accepted rows.
 */

import type { AppError, Cell, ColumnDef, TableMeta } from '@curve/domain';
import type {
  ImportCellValue,
  ImportColumnMapping,
  ImportDelimiter,
  ImportFormat,
  ImportedColumn,
  ImportPlan,
} from '@curve/table-engine';

import type { ImportEncoding, ImportEncodingChoice } from './encoding';

export interface ImportPreview {
  format: ImportFormat;
  encoding: ImportEncoding;
  /** True when the decoded text contains replacement characters. */
  encodingMismatch: boolean;
  /** Only for CSV; JSON has no delimiter control. */
  delimiter?: ImportDelimiter;
  hasHeader: boolean;
  headers: string[];
  columns: ImportedColumn[];
  /** First 20 data rows, excluding the header. */
  previewRows: ImportCellValue[][];
  totalRows: number;
  warnings: string[];
  /** T6.2: set when a plugin importer produced this preview (renderer only). */
  importerLabel?: string;
}

export interface ImportOpenPayload {
  bytes: Uint8Array;
  fileName: string;
}

export interface ImportConfigurePayload {
  encoding: ImportEncodingChoice;
  delimiter?: ImportDelimiter;
  hasHeader?: boolean;
}

export interface ImportPlanPayload {
  table: TableMeta;
  mode: 'append' | 'replace';
  mappings: ImportColumnMapping[];
  newColumns?: ColumnDef[];
  skipInvalid: boolean;
  /** Compact snapshots so the Worker does not receive the whole table. */
  existingKeys: Cell[];
  existingRowCount: number;
}

export type ImportWorkerRequest =
  | { id: number; type: 'open'; payload: ImportOpenPayload }
  | { id: number; type: 'configure'; payload: ImportConfigurePayload }
  | { id: number; type: 'plan'; payload: ImportPlanPayload };

export type ImportWorkerResponse =
  | { id: number; ok: true; type: 'open' | 'configure'; result: ImportPreview }
  | { id: number; ok: true; type: 'plan'; result: ImportPlan }
  | { id: number; ok: false; type: 'open' | 'configure' | 'plan'; error: AppError };

export type ImportWorkerCallResult<T> = { ok: true; result: T } | { ok: false; error: AppError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isImportWorkerRequest(value: unknown): value is ImportWorkerRequest {
  if (!isRecord(value) || !isRequestId(value['id'])) {
    return false;
  }
  if (!isRecord(value['payload'])) {
    return false;
  }
  const payload = value['payload'];
  switch (value['type']) {
    case 'open':
      return (
        payload['bytes'] instanceof Uint8Array &&
        typeof payload['fileName'] === 'string' &&
        payload['fileName'].length > 0
      );
    case 'configure':
      return (
        (payload['encoding'] === 'auto' ||
          payload['encoding'] === 'utf-8' ||
          payload['encoding'] === 'gb18030') &&
        (payload['delimiter'] === undefined ||
          payload['delimiter'] === ',' ||
          payload['delimiter'] === ';' ||
          payload['delimiter'] === '\t' ||
          payload['delimiter'] === '|') &&
        (payload['hasHeader'] === undefined || typeof payload['hasHeader'] === 'boolean')
      );
    case 'plan':
      return (
        isRecord(payload['table']) &&
        (payload['mode'] === 'append' || payload['mode'] === 'replace') &&
        Array.isArray(payload['mappings']) &&
        (payload['newColumns'] === undefined || Array.isArray(payload['newColumns'])) &&
        typeof payload['skipInvalid'] === 'boolean' &&
        Array.isArray(payload['existingKeys']) &&
        typeof payload['existingRowCount'] === 'number'
      );
    default:
      return false;
  }
}

export function isImportWorkerResponse(value: unknown): value is ImportWorkerResponse {
  if (!isRecord(value) || !isRequestId(value['id'])) {
    return false;
  }
  const type = value['type'];
  if (type !== 'open' && type !== 'configure' && type !== 'plan') {
    return false;
  }
  if (value['ok'] === true) {
    return isRecord(value['result']);
  }
  if (value['ok'] === false) {
    return isRecord(value['error']) && typeof value['error']['code'] === 'string';
  }
  return false;
}
