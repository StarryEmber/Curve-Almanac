import { describe, expect, it } from 'vitest';

import type { ColumnDef, TableMeta } from '@curve/domain';
import type { TableWorkerRequest } from '@curve/table-engine';

import { createTableIoClient } from './client';
import { handleTableWorkerRequest } from './handler';

import type { TableWorkerPort } from './client';

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

/**
 * Minimal `TableWorkerPort` double.
 *
 * With `respond`, every posted message is answered synchronously by the real
 * handler, which exercises the full request/response round trip without a
 * browser Worker (jsdom is not installed for these tests).
 */
class FakeWorker implements TableWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly posted: TableWorkerRequest[] = [];
  terminated = false;
  throwOnPost = false;

  constructor(private readonly respond?: (message: TableWorkerRequest) => unknown) {}

  postMessage(message: TableWorkerRequest): void {
    if (this.throwOnPost) {
      throw new Error('channel closed');
    }
    this.posted.push(message);
    const response = this.respond?.(message);
    if (response !== undefined) {
      this.emit(response);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }

  fail(): void {
    this.onerror?.(new Error('worker crashed'));
  }
}

function routingClient(): { client: ReturnType<typeof createTableIoClient>; fake: FakeWorker } {
  const fake = new FakeWorker((message) => handleTableWorkerRequest(message));
  return { client: createTableIoClient({ createWorker: () => fake }), fake };
}

describe('createTableIoClient', () => {
  it('decodes through the Worker and resolves the result', async () => {
    const { client, fake } = routingClient();

    const result = await client.decode('{"id":"row_1","v":["a"]}\n', TABLE);

    expect(result).toEqual({
      ok: true,
      result: {
        rows: [{ id: 'row_1', values: ['a'] }],
        issues: [],
        stats: { total: 1, accepted: 1, skipped: 0 },
      },
    });
    expect(fake.posted).toHaveLength(1);
    expect(fake.posted[0]).toMatchObject({ id: 1, type: 'decode' });
  });

  it('encodes through the Worker and reports bytes', async () => {
    const { client } = routingClient();
    const result = await client.encode([{ id: 'row_1', values: ['a'] }]);

    expect(result).toEqual({
      ok: true,
      result: { jsonl: '{"id":"row_1","v":["a"]}\n', bytes: 25 },
    });
  });

  it('correlates concurrent calls by request id', async () => {
    const { client } = routingClient();

    const [first, second, third] = await Promise.all([
      client.decode('{"id":"row_1","v":["a"]}\n', TABLE),
      client.encode([{ id: 'row_2', values: ['b'] }]),
      client.decode('', TABLE),
    ]);

    expect(first.ok && first.result.rows).toEqual([{ id: 'row_1', values: ['a'] }]);
    expect(second.ok && second.result.bytes).toBe(25);
    expect(third.ok && third.result.rows).toEqual([]);
    expect(client.pending).toBe(0);
  });

  it('turns the Worker error event into an envelope and forgets the worker', async () => {
    const fake = new FakeWorker();
    const client = createTableIoClient({ createWorker: () => fake });

    const pending = client.decode('', TABLE);
    expect(client.pending).toBe(1);
    fake.fail();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_UNKNOWN' },
    });
    expect(client.pending).toBe(0);
  });

  it('rejects a malformed Worker response instead of hanging', async () => {
    const fake = new FakeWorker();
    const client = createTableIoClient({ createWorker: () => fake });

    const pending = client.decode('', TABLE);
    fake.emit({ nonsense: true });

    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'E_UNKNOWN' } });
  });

  it('times out a Worker that never answers', async () => {
    const fake = new FakeWorker();
    const client = createTableIoClient({ createWorker: () => fake, timeoutMs: 5 });

    const result = await client.decode('', TABLE);

    expect(result).toMatchObject({ ok: false, error: { code: 'E_UNKNOWN' } });
    expect(result.ok ? '' : result.error.message).toContain('did not answer in time');
    expect(client.pending).toBe(0);
  });

  it('settles pending calls when terminated and refuses new ones', async () => {
    const fake = new FakeWorker();
    const client = createTableIoClient({ createWorker: () => fake });

    const pending = client.decode('', TABLE);
    client.terminate();
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'E_UNKNOWN' } });
    expect(fake.terminated).toBe(true);

    await expect(client.encode([])).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_UNKNOWN' },
    });
  });

  it('reports a postMessage failure without leaving a pending call', async () => {
    const fake = new FakeWorker();
    fake.throwOnPost = true;
    const client = createTableIoClient({ createWorker: () => fake });

    const result = await client.decode('', TABLE);

    expect(result).toMatchObject({ ok: false, error: { code: 'E_UNKNOWN' } });
    expect(result.ok ? '' : result.error.message).toContain('channel closed');
    expect(client.pending).toBe(0);
  });

  it('reports a worker that cannot be created', async () => {
    const client = createTableIoClient({
      createWorker: () => {
        throw new Error('no worker support');
      },
    });

    await expect(client.decode('', TABLE)).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_UNKNOWN' },
    });
  });
});
