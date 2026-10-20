/**
 * Pure request handler behind `table.worker.ts` (TASKS T1.3 step 3).
 *
 * Kept out of the Worker entry so it can be unit tested in Node: the Worker
 * file is wiring only and is covered by the E2E table scenario.
 */

import { createAppError, toAppError } from '@curve/domain';
import { decodeJsonl, encodeJsonlWithStats, isTableWorkerRequest } from '@curve/table-engine';
import type { TableWorkerResponse } from '@curve/table-engine';

function extractRequestId(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) {
      return id;
    }
  }
  return 0;
}

/**
 * Turns one Worker message into exactly one response.
 *
 * Never throws: a malformed message, a decoder bug and an unexpected exception
 * all become `{ ok: false, error }` so the client promise always settles.
 */
export function handleTableWorkerRequest(message: unknown): TableWorkerResponse {
  if (!isTableWorkerRequest(message)) {
    return {
      id: extractRequestId(message),
      ok: false,
      type: 'decode',
      error: createAppError('E_TABLE_PARSE', 'The table worker received a malformed request.'),
    };
  }

  try {
    switch (message.type) {
      case 'decode':
        return {
          id: message.id,
          ok: true,
          type: 'decode',
          result: decodeJsonl(message.payload.jsonl, message.payload.table),
        };
      case 'encode':
        return {
          id: message.id,
          ok: true,
          type: 'encode',
          result: encodeJsonlWithStats(message.payload.rows),
        };
    }
  } catch (error) {
    return { id: message.id, ok: false, type: message.type, error: toAppError(error) };
  }
}
