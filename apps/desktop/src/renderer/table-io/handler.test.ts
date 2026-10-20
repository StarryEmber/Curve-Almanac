import { describe, expect, it } from 'vitest';

import type { ColumnDef, TableMeta } from '@curve/domain';
import { createEncodeRequest, createDecodeRequest } from '@curve/table-engine';

import { handleTableWorkerRequest } from './handler';

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

describe('handleTableWorkerRequest', () => {
  it('decodes JSONL into rows', () => {
    const response = handleTableWorkerRequest(
      createDecodeRequest(3, '{"id":"row_1","v":["a"]}\n', TABLE),
    );

    expect(response).toEqual({
      id: 3,
      ok: true,
      type: 'decode',
      result: {
        rows: [{ id: 'row_1', values: ['a'] }],
        issues: [],
        stats: { total: 1, accepted: 1, skipped: 0 },
      },
    });
  });

  it('encodes rows and reports the byte length', () => {
    const response = handleTableWorkerRequest(
      createEncodeRequest(4, [{ id: 'row_1', values: ['a'] }]),
    );

    expect(response).toEqual({
      id: 4,
      ok: true,
      type: 'encode',
      result: { jsonl: '{"id":"row_1","v":["a"]}\n', bytes: 25 },
    });
  });

  it('answers a malformed message with an error and the echoed id when available', () => {
    const response = handleTableWorkerRequest({ id: 9, type: 'decode' });

    expect(response).toMatchObject({
      id: 9,
      ok: false,
      type: 'decode',
      error: { code: 'E_TABLE_PARSE' },
    });
  });

  it('falls back to id 0 for a message that is not even an object', () => {
    expect(handleTableWorkerRequest(null)).toMatchObject({ id: 0, ok: false });
    expect(handleTableWorkerRequest('decode')).toMatchObject({ id: 0, ok: false });
  });

  it('returns decoder issues instead of throwing', () => {
    const response = handleTableWorkerRequest(createDecodeRequest(5, '{"id":', TABLE));

    expect(response.ok).toBe(true);
    if (response.ok && response.type === 'decode') {
      expect(response.result.issues[0]).toMatchObject({ line: 1, code: 'E_TABLE_PARSE' });
      expect(response.result.stats).toEqual({ total: 1, accepted: 0, skipped: 1 });
    }
  });
});
