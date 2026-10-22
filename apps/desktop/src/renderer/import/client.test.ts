import { describe, expect, it, vi } from 'vitest';

import { createImportWorkerClient } from './client';

import type { ImportWorkerPort } from './client';
import type { ImportWorkerRequest } from './worker-protocol';

interface FakeWorker extends ImportWorkerPort {
  sent: Array<{ message: ImportWorkerRequest; transfer?: Transferable[] }>;
  respond(message: unknown): void;
  error(): void;
}

function createFakeWorker(): FakeWorker {
  const sent: FakeWorker['sent'] = [];
  let onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  let onerror: ((event: unknown) => void) | null = null;
  return {
    get onmessage() {
      return onmessage;
    },
    set onmessage(value) {
      onmessage = value;
    },
    get onerror() {
      return onerror;
    },
    set onerror(value) {
      onerror = value;
    },
    postMessage(message, transfer) {
      sent.push({ message, transfer });
    },
    terminate: vi.fn(),
    sent,
    respond(message) {
      onmessage?.({ data: message } as MessageEvent<unknown>);
    },
    error() {
      onerror?.(new Error('boom'));
    },
  };
}

const PREVIEW = {
  format: 'csv' as const,
  encoding: 'utf-8' as const,
  encodingMismatch: false,
  delimiter: ',' as const,
  hasHeader: true,
  headers: ['id'],
  columns: [{ index: 0, name: 'id', type: 'text' as const, confidence: 1, sampleSize: 1 }],
  previewRows: [['a']],
  totalRows: 1,
  warnings: [],
};

describe('createImportWorkerClient', () => {
  it('transfers bytes on open and correlates responses by id', async () => {
    const worker = createFakeWorker();
    const client = createImportWorkerClient({ createWorker: () => worker });
    const bytes = new Uint8Array([1, 2, 3]);

    const promise = client.open(bytes, 'data.csv');
    expect(worker.sent).toHaveLength(1);
    expect(worker.sent[0]?.transfer).toEqual([bytes.buffer]);
    worker.respond({ id: 1, ok: true, type: 'open', result: PREVIEW });

    await expect(promise).resolves.toEqual({ ok: true, result: PREVIEW });
    expect(client.pending).toBe(0);
  });

  it('sends configure and plan payloads and unwraps errors', async () => {
    const worker = createFakeWorker();
    const client = createImportWorkerClient({ createWorker: () => worker });

    const configure = client.configure({ encoding: 'gb18030' });
    worker.respond({ id: 1, ok: true, type: 'configure', result: PREVIEW });
    await expect(configure).resolves.toMatchObject({ ok: true });

    const plan = client.plan({
      table: {} as never,
      mode: 'append',
      mappings: [],
      skipInvalid: false,
      existingKeys: [],
      existingRowCount: 0,
    });
    worker.respond({
      id: 2,
      ok: false,
      type: 'plan',
      error: { code: 'E_IMPORT_FORMAT', message: 'bad' },
    });
    await expect(plan).resolves.toEqual({
      ok: false,
      error: { code: 'E_IMPORT_FORMAT', message: 'bad' },
    });
  });

  it('terminates pending calls and drops late responses', async () => {
    const worker = createFakeWorker();
    const client = createImportWorkerClient({ createWorker: () => worker });
    const promise = client.open(new Uint8Array([1]), 'a.csv');

    client.terminate();

    await expect(promise).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_IMPORT_FORMAT' },
    });
    expect(worker.terminate).toHaveBeenCalled();
    worker.respond({ id: 1, ok: true, type: 'open', result: PREVIEW });
    await expect(client.open(new Uint8Array([1]), 'a.csv')).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_IMPORT_FORMAT' },
    });
  });

  it('fails pending calls on a malformed response or worker error', async () => {
    const worker = createFakeWorker();
    const client = createImportWorkerClient({ createWorker: () => worker });
    const malformed = client.open(new Uint8Array([1]), 'a.csv');
    worker.respond({ nope: true });
    await expect(malformed).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_IMPORT_FORMAT' },
    });

    const failed = client.open(new Uint8Array([1]), 'a.csv');
    worker.error();
    await expect(failed).resolves.toMatchObject({
      ok: false,
      error: { code: 'E_IMPORT_FORMAT' },
    });
  });
});
