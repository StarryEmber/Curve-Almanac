import { describe, expect, it } from 'vitest';

import type { ColumnDef, Row, TableMeta } from '@curve/domain';

import {
  createDecodeRequest,
  createEncodeRequest,
  isTableWorkerRequest,
  isTableWorkerResponse,
} from './worker-protocol';

import type { TableWorkerResponse } from './worker-protocol';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

const TABLE: TableMeta = {
  id: 'tbl_test',
  name: 'Test',
  file: 'tables/tbl_test.jsonl',
  schemaVersion: 1,
  columns: [column({ id: 'col_id', key: 'id', type: 'text' })],
  primaryKey: 'col_id',
  rowCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ROWS: Row[] = [{ id: 'row_1', values: ['a'] }];

describe('worker requests', () => {
  it('builds a decode request', () => {
    expect(createDecodeRequest(7, '{"id":"row_1","v":["a"]}\n', TABLE)).toEqual({
      id: 7,
      type: 'decode',
      payload: { jsonl: '{"id":"row_1","v":["a"]}\n', table: TABLE },
    });
  });

  it('builds an encode request with copied rows', () => {
    const request = createEncodeRequest(8, ROWS);

    expect(request).toEqual({ id: 8, type: 'encode', payload: { rows: ROWS } });
    expect(request.payload.rows).not.toBe(ROWS);
  });

  it('accepts well-formed requests', () => {
    expect(isTableWorkerRequest(createDecodeRequest(1, '', TABLE))).toBe(true);
    expect(isTableWorkerRequest(createEncodeRequest(2, ROWS))).toBe(true);
  });

  it('rejects malformed requests', () => {
    const invalid: unknown[] = [
      null,
      undefined,
      'decode',
      42,
      {},
      { id: 1 },
      { id: 'one', type: 'decode', payload: { jsonl: '', table: TABLE } },
      { id: 1, type: 'unknown', payload: {} },
      { id: 1, type: 'decode', payload: { jsonl: 1, table: TABLE } },
      { id: 1, type: 'decode', payload: { jsonl: '', table: null } },
      { id: 1, type: 'decode', payload: { jsonl: '' } },
      { id: 1, type: 'encode', payload: { rows: 'nope' } },
      { id: 1, type: 'encode', payload: { rows: [{ id: 'row_1' }] } },
    ];

    for (const value of invalid) {
      expect(isTableWorkerRequest(value)).toBe(false);
    }
  });
});

describe('worker responses', () => {
  it('accepts a decode success response', () => {
    const response: TableWorkerResponse = {
      id: 1,
      ok: true,
      type: 'decode',
      result: {
        rows: ROWS,
        issues: [{ line: 2, code: 'E_TABLE_PARSE', message: 'line 2: truncated JSON' }],
        stats: { total: 2, accepted: 1, skipped: 1 },
      },
    };
    expect(isTableWorkerResponse(response)).toBe(true);
  });

  it('accepts an encode success response and a failure response', () => {
    expect(
      isTableWorkerResponse({
        id: 2,
        ok: true,
        type: 'encode',
        result: { jsonl: '{"id":"row_1","v":["a"]}\n', bytes: 29 },
      }),
    ).toBe(true);
    expect(
      isTableWorkerResponse({
        id: 3,
        ok: false,
        type: 'decode',
        error: { code: 'E_TABLE_PARSE', message: 'bad line', detail: 'line 2' },
      }),
    ).toBe(true);
  });

  it('rejects malformed responses', () => {
    const invalid: unknown[] = [
      null,
      {},
      { id: 1, ok: true },
      { id: 1, ok: true, type: 'decode' },
      { id: 1, ok: true, type: 'decode', result: { rows: 'nope' } },
      { id: 1, ok: true, type: 'encode', result: { jsonl: '', bytes: 'many' } },
      { id: 1, ok: false, type: 'decode', error: { message: 'no code' } },
      { id: 1, ok: false, type: 'decode', error: { code: 'E_NOT_A_CODE', message: 'x' } },
    ];

    for (const value of invalid) {
      expect(isTableWorkerResponse(value)).toBe(false);
    }
  });
});
