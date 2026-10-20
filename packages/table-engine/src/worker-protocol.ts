/**
 * Message protocol between the renderer and `table.worker.ts` (TASKS T1.3).
 *
 * The request/response union is the contract both sides share. Guards are hand
 * written on purpose: they run for every message and the payloads are ours, so
 * pulling Zod into the Worker bundle buys nothing (ADR-007 keeps Zod for
 * user-owned input such as manifest and JSONL cells, which `decodeJsonl`
 * already validates).
 */

import { isAppError } from '@curve/domain';
import type { AppError, Row, TableMeta } from '@curve/domain';

import type { JsonlDecodeResult } from './jsonl';

export interface TableDecodePayload {
  jsonl: string;
  table: TableMeta;
}

export interface TableEncodePayload {
  rows: Row[];
}

export interface TableEncodeResult {
  jsonl: string;
  bytes: number;
}

export type TableWorkerRequest =
  | { id: number; type: 'decode'; payload: TableDecodePayload }
  | { id: number; type: 'encode'; payload: TableEncodePayload };

export type TableWorkerResponse =
  | { id: number; ok: true; type: 'decode'; result: JsonlDecodeResult }
  | { id: number; ok: true; type: 'encode'; result: TableEncodeResult }
  | { id: number; ok: false; type: 'decode' | 'encode'; error: AppError };

export type DecodeRequest = Extract<TableWorkerRequest, { type: 'decode' }>;
export type EncodeRequest = Extract<TableWorkerRequest, { type: 'encode' }>;

/** Result envelope the client resolves a pending call with. */
export type TableWorkerCallResult<T> = { ok: true; result: T } | { ok: false; error: AppError };

export function createDecodeRequest(id: number, jsonl: string, table: TableMeta): DecodeRequest {
  return { id, type: 'decode', payload: { jsonl, table } };
}

/** Rows are copied so the caller may keep mutating its array. */
export function createEncodeRequest(id: number, rows: readonly Row[]): EncodeRequest {
  return { id, type: 'encode', payload: { rows: [...rows] } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isTableShape(value: unknown): value is TableMeta {
  return isRecord(value) && typeof value['id'] === 'string' && Array.isArray(value['columns']);
}

function isRowArray(value: unknown): value is Row[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(
    (row) => isRecord(row) && typeof row['id'] === 'string' && Array.isArray(row['values']),
  );
}

function isDecodeResult(value: unknown): value is JsonlDecodeResult {
  if (!isRecord(value)) {
    return false;
  }
  const stats = value['stats'];
  return (
    isRowArray(value['rows']) &&
    Array.isArray(value['issues']) &&
    isRecord(stats) &&
    typeof stats['total'] === 'number' &&
    typeof stats['accepted'] === 'number' &&
    typeof stats['skipped'] === 'number'
  );
}

function isEncodeResult(value: unknown): value is TableEncodeResult {
  return (
    isRecord(value) &&
    typeof value['jsonl'] === 'string' &&
    typeof value['bytes'] === 'number' &&
    Number.isFinite(value['bytes'])
  );
}

export function isTableWorkerRequest(value: unknown): value is TableWorkerRequest {
  if (!isRecord(value) || !isRequestId(value['id'])) {
    return false;
  }
  const payload = value['payload'];
  if (!isRecord(payload)) {
    return false;
  }
  switch (value['type']) {
    case 'decode':
      return typeof payload['jsonl'] === 'string' && isTableShape(payload['table']);
    case 'encode':
      return isRowArray(payload['rows']);
    default:
      return false;
  }
}

export function isTableWorkerResponse(value: unknown): value is TableWorkerResponse {
  if (!isRecord(value) || !isRequestId(value['id'])) {
    return false;
  }
  const type = value['type'];
  if (type !== 'decode' && type !== 'encode') {
    return false;
  }
  if (value['ok'] === true) {
    return type === 'decode' ? isDecodeResult(value['result']) : isEncodeResult(value['result']);
  }
  if (value['ok'] === false) {
    return isAppError(value['error']);
  }
  return false;
}
