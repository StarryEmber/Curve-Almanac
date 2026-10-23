import { describe, expect, it } from 'vitest';

import type { Row, TableMeta } from '@curve/domain';

import { QueryCache, handleQueryWorkerRequest } from './handler';

const table: TableMeta = {
  id: 'tbl_query',
  name: 'Query',
  file: 'tables/tbl_query.jsonl',
  schemaVersion: 1,
  columns: [
    { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
    { id: 'col_n', key: 'n', label: 'N', type: 'number', role: 'none' },
  ],
  primaryKey: 'col_id',
  rowCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const rows: Row[] = [
  { id: 'row_1', values: ['a', 10] },
  { id: 'row_2', values: ['b', 20] },
  { id: 'row_3', values: ['c', 30] },
];

function syncMessage(id: number, payload: Record<string, unknown>): unknown {
  return { id, type: 'sync', payload };
}

describe('QueryCache', () => {
  it('syncs a reset snapshot and incrementally appends/updates rows', () => {
    const cache = new QueryCache();
    const result = cache.sync({ tableId: table.id, table, reset: rows });
    expect(result).toEqual({ tableId: table.id, rowCount: 3 });
    expect(cache.size).toBe(1);

    cache.sync({
      tableId: table.id,
      table,
      append: [{ id: 'row_4', values: ['d', 40] }],
      update: [{ id: 'row_2', values: ['b', 99] }],
    });
    const query = cache.query({
      tableId: table.id,
      sort: [{ columnId: 'col_n', direction: 'desc' }],
      locale: 'en-US',
    });
    expect(query.rowIds).toEqual(['row_2', 'row_4', 'row_3', 'row_1']);
    expect(query.visibleRows).toBe(4);
    expect(query.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('upserts an update for an unknown row instead of losing it', () => {
    const cache = new QueryCache();
    cache.sync({ tableId: table.id, table, reset: [rows[0] as Row] });
    cache.sync({ tableId: table.id, table, update: [rows[1] as Row] });
    expect(cache.query({ tableId: table.id, sort: [], locale: 'en-US' }).rowIds).toEqual([
      'row_1',
      'row_2',
    ]);
  });

  it('rejects append/update before a reset', () => {
    const cache = new QueryCache();
    expect(() => cache.sync({ tableId: table.id, table, append: [rows[0] as Row] })).toThrow(
      /no snapshot/,
    );
  });

  it('evicts the oldest table beyond the cache limit', () => {
    const cache = new QueryCache();
    for (let index = 0; index < 5; index += 1) {
      cache.sync({
        tableId: `tbl_${String(index)}`,
        table: { ...table, id: `tbl_${String(index)}` },
        reset: [],
      });
    }
    expect(cache.size).toBe(4);
    expect(() => cache.query({ tableId: 'tbl_0', sort: [], locale: 'en-US' })).toThrow(
      /no snapshot/,
    );
  });

  it('clears every cached table', () => {
    const cache = new QueryCache();
    cache.sync({ tableId: table.id, table, reset: [] });
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('handleQueryWorkerRequest', () => {
  it('handles sync and query messages', () => {
    const cache = new QueryCache();
    const synced = handleQueryWorkerRequest(
      syncMessage(1, { tableId: table.id, table, reset: rows }),
      cache,
    );
    expect(synced).toEqual({
      id: 1,
      ok: true,
      type: 'sync',
      result: { tableId: table.id, rowCount: 3 },
    });

    const queried = handleQueryWorkerRequest(
      {
        id: 2,
        type: 'query',
        payload: {
          tableId: table.id,
          filter: { kind: 'compare', columnId: 'col_n', op: 'gte', value: 20 },
          sort: [{ columnId: 'col_id', direction: 'asc' }],
          locale: 'en-US',
        },
      },
      cache,
    );
    expect(queried.ok).toBe(true);
    if (queried.ok && queried.type === 'query') {
      expect(queried.result.rowIds).toEqual(['row_2', 'row_3']);
    }
  });

  it('returns structured errors for malformed and invalid messages', () => {
    const cache = new QueryCache();
    const malformed = handleQueryWorkerRequest({ id: 3, type: 'nope' }, cache);
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.error.code).toBe('E_IPC_INVALID_PAYLOAD');
    }

    handleQueryWorkerRequest(syncMessage(4, { tableId: table.id, table, reset: rows }), cache);
    const invalid = handleQueryWorkerRequest(
      {
        id: 5,
        type: 'query',
        payload: {
          tableId: table.id,
          filter: { kind: 'compare', columnId: 'col_id', op: 'gt', value: 'a' },
          sort: [],
          locale: 'en-US',
        },
      },
      cache,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe('E_VALIDATION');
    }

    const unknown = handleQueryWorkerRequest(
      { id: 6, type: 'query', payload: { tableId: 'tbl_missing', sort: [], locale: 'en-US' } },
      cache,
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error.code).toBe('E_UNKNOWN');
    }
  });
});
