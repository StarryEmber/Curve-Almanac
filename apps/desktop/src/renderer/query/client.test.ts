import { describe, expect, it } from 'vitest';

import type { Row, TableMeta } from '@curve/domain';
import type { QueryWorkerRequest, QueryWorkerResponse } from '@curve/table-engine';

import { createQueryClient } from './client';

import type { QueryWorkerPort } from './client';

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
  rowCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const rows: Row[] = [
  { id: 'row_1', values: ['a', 10] },
  { id: 'row_2', values: ['b', 20] },
];

class FakeWorker implements QueryWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly messages: QueryWorkerRequest[] = [];
  handler: (message: QueryWorkerRequest) => QueryWorkerResponse | null = (message) => {
    if (message.type === 'sync') {
      return {
        id: message.id,
        ok: true,
        type: 'sync',
        result: { tableId: message.payload.tableId, rowCount: 0 },
      };
    }
    return {
      id: message.id,
      ok: true,
      type: 'query',
      result: { rowIds: [], visibleRows: 0, durationMs: 1 },
    };
  };

  postMessage(message: QueryWorkerRequest): void {
    this.messages.push(message);
    const response = this.handler(message);
    if (response !== null) {
      this.onmessage?.({ data: response } as MessageEvent<unknown>);
    }
  }

  terminate(): void {}
}

function setup(): { worker: FakeWorker; client: ReturnType<typeof createQueryClient> } {
  const worker = new FakeWorker();
  const client = createQueryClient({ createWorker: () => worker });
  return { worker, client };
}

describe('query client', () => {
  it('clones the rows once, then sends only changed and appended rows', async () => {
    const { worker, client } = setup();

    const first = await client.syncTable(table, rows);
    expect(first.ok).toBe(true);
    expect(worker.messages).toHaveLength(1);
    const firstPayload = worker.messages[0]?.type === 'sync' ? worker.messages[0].payload : null;
    expect(firstPayload?.reset).toHaveLength(2);
    expect(client.trackedTables).toBe(1);

    const noop = await client.syncTable(table, rows);
    expect(noop.ok).toBe(true);
    expect(worker.messages).toHaveLength(1);

    const edited: Row[] = [rows[0] as Row, { id: 'row_2', values: ['b', 99] }];
    await client.syncTable(table, edited);
    expect(worker.messages).toHaveLength(2);
    const editPayload = worker.messages[1]?.type === 'sync' ? worker.messages[1].payload : null;
    expect(editPayload?.update).toEqual([edited[1]]);

    const appended: Row[] = [...edited, { id: 'row_3', values: ['c', 30] }];
    await client.syncTable(table, appended);
    const appendPayload = worker.messages[2]?.type === 'sync' ? worker.messages[2].payload : null;
    expect(appendPayload?.append).toEqual([appended[2]]);

    const shrunk = [appended[0] as Row];
    await client.syncTable(table, shrunk);
    const resetPayload = worker.messages[3]?.type === 'sync' ? worker.messages[3].payload : null;
    expect(resetPayload?.reset).toEqual(shrunk);
  });

  it('resets when the row order or schema changes and updates metadata-only changes', async () => {
    const { worker, client } = setup();
    await client.syncTable(table, rows);

    await client.syncTable(table, [rows[1] as Row, rows[0] as Row]);
    const reorderPayload = worker.messages[1]?.type === 'sync' ? worker.messages[1].payload : null;
    expect(reorderPayload?.reset).toHaveLength(2);

    const renamed = { ...table, name: 'Renamed' };
    await client.syncTable(renamed, [rows[1] as Row, rows[0] as Row]);
    const renamePayload = worker.messages[2]?.type === 'sync' ? worker.messages[2].payload : null;
    expect(renamePayload?.table.name).toBe('Renamed');
    expect(renamePayload?.reset).toBeUndefined();

    const widened = {
      ...renamed,
      columns: [
        ...renamed.columns,
        {
          id: 'col_extra',
          key: 'extra',
          label: 'Extra',
          type: 'text' as const,
          role: 'none' as const,
        },
      ],
    };
    await client.syncTable(widened, [rows[1] as Row, rows[0] as Row]);
    const schemaPayload = worker.messages[3]?.type === 'sync' ? worker.messages[3].payload : null;
    expect(schemaPayload?.reset).toHaveLength(2);
  });

  it('sends typed queries and returns the worker result', async () => {
    const { worker, client } = setup();
    await client.syncTable(table, rows);
    worker.handler = (message) => {
      if (message.type === 'query') {
        return {
          id: message.id,
          ok: true,
          type: 'query',
          result: { rowIds: ['row_2'], visibleRows: 1, durationMs: 3.5 },
        };
      }
      return null;
    };
    const result = await client.query({
      tableId: table.id,
      filter: { kind: 'compare', columnId: 'col_n', op: 'gt', value: 10 },
      sort: [],
      locale: 'zh-CN',
    });
    expect(result).toEqual({
      ok: true,
      result: { rowIds: ['row_2'], visibleRows: 1, durationMs: 3.5 },
    });
    const queryMessage = worker.messages.at(-1);
    expect(queryMessage?.type).toBe('query');
  });

  it('fails pending calls on malformed responses and terminate', async () => {
    const { worker, client } = setup();
    worker.handler = () => null;
    const pending = client.syncTable(table, rows);
    worker.onmessage?.({ data: { id: 999, nonsense: true } } as MessageEvent<unknown>);
    const failed = await pending;
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error.code).toBe('E_UNKNOWN');
    }
    expect(client.pending).toBe(0);

    const second = client.syncTable(table, rows);
    client.terminate();
    const terminated = await second;
    expect(terminated.ok).toBe(false);
    expect(client.trackedTables).toBe(0);
  });

  it('returns an error when the worker cannot be created', async () => {
    const client = createQueryClient({
      createWorker: () => {
        throw new Error('no worker');
      },
    });
    const result = await client.syncTable(table, rows);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('could not be created');
    }
  });
});
