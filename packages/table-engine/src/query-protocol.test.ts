import { describe, expect, it } from 'vitest';

import type { Row, TableMeta } from '@curve/domain';

import {
  createQueryRowsRequest,
  createQuerySyncRequest,
  isQueryWorkerRequest,
  isQueryWorkerResponse,
} from './query-protocol';

import type { QueryRowsPayload, QuerySyncPayload } from './query-protocol';

const table: TableMeta = {
  id: 'tbl_query',
  name: 'Query',
  file: 'tables/tbl_query.jsonl',
  schemaVersion: 1,
  columns: [{ id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' }],
  primaryKey: 'col_id',
  rowCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const row: Row = { id: 'row_1', values: ['row_1'] };

describe('query worker protocol', () => {
  it('round-trips sync requests', () => {
    const payload: QuerySyncPayload = { tableId: 'tbl_query', table, reset: [row] };
    const request = createQuerySyncRequest(7, payload);
    expect(request.type).toBe('sync');
    expect(isQueryWorkerRequest(request)).toBe(true);
    expect(isQueryWorkerRequest({ ...request, id: -1 })).toBe(false);
  });

  it('accepts append/update deltas and a table-only metadata sync', () => {
    const update = createQuerySyncRequest(1, {
      tableId: 'tbl_query',
      table,
      append: [row],
      update: [],
    });
    expect(isQueryWorkerRequest(update)).toBe(true);
    expect(
      isQueryWorkerRequest({
        id: 1,
        type: 'sync',
        payload: { tableId: 'tbl_query', table },
      }),
    ).toBe(true);
    expect(
      isQueryWorkerRequest({
        id: 1,
        type: 'sync',
        payload: { tableId: 'tbl_query', table, reset: 'nope' },
      }),
    ).toBe(false);
  });

  it('round-trips query requests and validates sort/locale/filter', () => {
    const payload: QueryRowsPayload = {
      tableId: 'tbl_query',
      sort: [{ columnId: 'col_id', direction: 'asc' }],
      locale: 'zh-CN',
      filter: { kind: 'compare', columnId: 'col_id', op: 'eq', value: 'row_1' },
    };
    const request = createQueryRowsRequest(2, payload);
    expect(request.type).toBe('query');
    expect(isQueryWorkerRequest(request)).toBe(true);
    expect(
      isQueryWorkerRequest({
        id: 2,
        type: 'query',
        payload: { tableId: 'tbl_query', sort: [], locale: 1 },
      }),
    ).toBe(false);
    expect(
      isQueryWorkerRequest({
        id: 2,
        type: 'query',
        payload: {
          tableId: 'tbl_query',
          sort: [{ columnId: 'col_id', direction: 'up' }],
          locale: 'en',
        },
      }),
    ).toBe(false);
  });

  it('accepts successful query responses and rejects malformed ones', () => {
    expect(
      isQueryWorkerResponse({
        id: 1,
        ok: true,
        type: 'query',
        result: { rowIds: ['row_1'], visibleRows: 1, durationMs: 0.5 },
      }),
    ).toBe(true);
    expect(
      isQueryWorkerResponse({
        id: 1,
        ok: true,
        type: 'query',
        result: { rowIds: [1], visibleRows: 1, durationMs: 0.5 },
      }),
    ).toBe(false);
    expect(
      isQueryWorkerResponse({
        id: 1,
        ok: true,
        type: 'sync',
        result: { tableId: 'tbl_query', rowCount: 1 },
      }),
    ).toBe(true);
    expect(
      isQueryWorkerResponse({
        id: 1,
        ok: false,
        type: 'query',
        error: { code: 'E_UNKNOWN', message: 'failed' },
      }),
    ).toBe(true);
    expect(
      isQueryWorkerResponse({ id: 1, ok: false, type: 'query', error: { code: 'NOPE' } }),
    ).toBe(false);
  });
});
