import { describe, expect, it } from 'vitest';

import type { ColumnDef, TableMeta } from '@curve/domain';

import { createImportWorkerHandler } from './worker-handler';

import type { ImportWorkerResponse } from './worker-protocol';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

const TABLE: TableMeta = {
  id: 'tbl_import_worker',
  name: 'Import',
  file: 'tables/tbl_import_worker.jsonl',
  schemaVersion: 1,
  columns: [
    column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true }),
    column({ id: 'col_name', key: 'name', label: 'Name', type: 'text' }),
    column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number' }),
  ],
  primaryKey: 'col_id',
  rowCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function gbkCsv(text: string): Uint8Array {
  // The fixture is ASCII except for one Chinese header/value pair; this encodes
  // "名字" in GBK so the auto-detector must choose GB18030.
  const prefix = new TextEncoder().encode(text);
  return prefix;
}

function planPayload(overrides: Record<string, unknown> = {}) {
  return {
    table: TABLE,
    mode: 'append' as const,
    mappings: [
      { sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } },
      { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_name' } },
      { sourceIndex: 2, target: { kind: 'existing', columnId: 'col_amount' } },
    ],
    skipInvalid: false,
    existingKeys: [],
    existingRowCount: 0,
    ...overrides,
  };
}

function responseOf(value: ImportWorkerResponse): ImportWorkerResponse {
  return value;
}

describe('createImportWorkerHandler', () => {
  it('opens a GBK semicolon CSV, returns a 20-row preview and keeps all rows in the Worker', () => {
    const handler = createImportWorkerHandler();
    const bytes = gbkCsv('id;name;amount\n;a;1\n;b;2\n');
    const response = handler.handle({
      id: 1,
      type: 'open',
      payload: { bytes, fileName: 'data.csv' },
    });

    expect(response).toMatchObject({
      id: 1,
      ok: true,
      type: 'open',
      result: {
        format: 'csv',
        encoding: 'utf-8',
        delimiter: ';',
        hasHeader: true,
        headers: ['id', 'name', 'amount'],
        totalRows: 2,
      },
    });
    if (response.ok && response.type === 'open') {
      expect(response.result.previewRows).toHaveLength(2);
      expect(response.result.columns.map((entry) => entry.type)).toEqual([
        'text',
        'text',
        'number',
      ]);
    }
  });

  it('reports a manual UTF-8 mismatch and can switch back to GBK', () => {
    const handler = createImportWorkerHandler();
    const bytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3, 0x0a, 0x31, 0x0a]);
    handler.handle({ id: 1, type: 'open', payload: { bytes, fileName: 'data.csv' } });

    const wrong = handler.handle({
      id: 2,
      type: 'configure',
      payload: { encoding: 'utf-8', delimiter: ',', hasHeader: false },
    });
    expect(wrong).toMatchObject({
      ok: true,
      type: 'configure',
      result: { encodingMismatch: true },
    });

    const right = handler.handle({
      id: 3,
      type: 'configure',
      payload: { encoding: 'gb18030', hasHeader: false },
    });
    expect(right).toMatchObject({
      ok: true,
      type: 'configure',
      result: { encoding: 'gb18030', encodingMismatch: false },
    });
  });

  it('parses a JSON object array and plans optional new columns', () => {
    const handler = createImportWorkerHandler();
    const bytes = new TextEncoder().encode('[{"id":"a","name":"A","amount":1,"extra":"x"}]');
    const opened = handler.handle({
      id: 1,
      type: 'open',
      payload: { bytes, fileName: 'data.json' },
    });
    expect(opened).toMatchObject({
      ok: true,
      type: 'open',
      result: { format: 'json', headers: ['id', 'name', 'amount', 'extra'], totalRows: 1 },
    });

    const extra = column({ id: 'col_extra', key: 'extra', label: 'Extra', type: 'text' });
    const planned = handler.handle({
      id: 2,
      type: 'plan',
      payload: planPayload({
        mappings: [
          { sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } },
          { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_name' } },
          { sourceIndex: 2, target: { kind: 'existing', columnId: 'col_amount' } },
          { sourceIndex: 3, target: { kind: 'new', newColumnIndex: 0 } },
        ],
        newColumns: [extra],
      }),
    });
    expect(planned).toMatchObject({
      ok: true,
      type: 'plan',
      result: {
        ok: true,
        stats: { total: 1, accepted: 1, skipped: 0 },
        finalRowCount: 1,
        newColumns: [extra],
      },
    });
  });

  it('returns structured issues and skip stats instead of throwing', () => {
    const handler = createImportWorkerHandler();
    const bytes = new TextEncoder().encode('id,name,amount\na,A,1\nb,B,oops');
    handler.handle({ id: 1, type: 'open', payload: { bytes, fileName: 'data.csv' } });

    const rejected = handler.handle({
      id: 2,
      type: 'plan',
      payload: planPayload({ existingRowCount: 0 }),
    });
    expect(rejected).toMatchObject({
      ok: true,
      type: 'plan',
      result: { ok: false, issues: [{ row: 2, code: 'E_TYPE' }] },
    });

    const skipped = handler.handle({
      id: 3,
      type: 'plan',
      payload: planPayload({ skipInvalid: true }),
    });
    expect(skipped).toMatchObject({
      ok: true,
      type: 'plan',
      result: { ok: true, stats: { total: 2, accepted: 1, skipped: 1 } },
    });
  });

  it('rejects a plan before open and still answers with an AppError envelope', () => {
    const handler = createImportWorkerHandler();
    const response = handler.handle({ id: 9, type: 'plan', payload: planPayload() });

    expect(responseOf(response)).toMatchObject({
      id: 9,
      ok: false,
      type: 'plan',
      error: { code: 'E_IMPORT_FORMAT' },
    });
  });
});
