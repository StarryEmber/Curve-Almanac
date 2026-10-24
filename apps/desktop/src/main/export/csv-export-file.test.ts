import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createCsvExportWriter } from './csv-export-file';

const createdDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'curve-csv-export-'));
  createdDirs.push(dir);
  return dir;
}

function counterUuid(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `id-${String(next)}`;
  };
}

function createWriter(path: string | null, uuid = counterUuid()) {
  const calls: { suggestedName: string; extensions: string[] }[] = [];
  const writer = createCsvExportWriter({
    chooseSavePath: async (suggestedName, filters) => {
      calls.push({
        suggestedName,
        extensions: filters.flatMap((filter) => filter.extensions),
      });
      return path;
    },
    uuid,
  });
  return { writer, calls };
}

afterEach(() => {
  for (const dir of createdDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  createdDirs.length = 0;
});

describe('createCsvExportWriter', () => {
  it('returns null when the save dialog is cancelled and creates no file', async () => {
    const dir = tempDir();
    const { writer, calls } = createWriter(null);

    await expect(
      writer.handle({
        op: 'begin',
        suggestedName: 'Data-20261024-1605.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      }),
    ).resolves.toBeNull();

    expect(calls).toEqual([{ suggestedName: 'Data-20261024-1605.csv', extensions: ['csv'] }]);
    expect(readdirSync(dir)).toEqual([]);
    expect(writer.activeCount()).toBe(0);
  });

  it('streams chunks into the chosen path and renames on finish', async () => {
    const dir = tempDir();
    const target = join(dir, 'out.csv');
    const { writer } = createWriter(target);

    const begin = await writer.handle({
      op: 'begin',
      suggestedName: 'out.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    expect(begin).toMatchObject({ op: 'begin', path: target });
    if (begin === null || begin.op !== 'begin') {
      throw new Error('expected begin');
    }

    await expect(
      writer.handle({ op: 'append', token: begin.token, chunk: '\uFEFFname,value\r\n' }),
    ).resolves.toEqual({ op: 'append', bytes: 15 });
    await expect(
      writer.handle({ op: 'append', token: begin.token, chunk: 'alpha,1\r\n' }),
    ).resolves.toEqual({ op: 'append', bytes: 24 });
    await expect(writer.handle({ op: 'finish', token: begin.token, rows: 1 })).resolves.toEqual({
      op: 'finish',
      path: target,
      bytes: 24,
      rows: 1,
    });

    expect(readFileSync(target, 'utf8')).toBe('\uFEFFname,value\r\nalpha,1\r\n');
    expect(readdirSync(dir)).toEqual(['out.csv']);
    expect(writer.activeCount()).toBe(0);
  });

  it('reports UTF-8 byte counts, not character counts', async () => {
    const dir = tempDir();
    const target = join(dir, 'cjk.csv');
    const { writer } = createWriter(target);
    const begin = await writer.handle({
      op: 'begin',
      suggestedName: 'cjk.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (begin === null || begin.op !== 'begin') {
      throw new Error('expected begin');
    }

    await expect(
      writer.handle({ op: 'append', token: begin.token, chunk: '温度,1\r\n' }),
    ).resolves.toEqual({ op: 'append', bytes: 10 });
    await writer.handle({ op: 'finish', token: begin.token, rows: 1 });
    expect(readFileSync(target, 'utf8')).toBe('温度,1\r\n');
  });

  it('cancels an active export, removes the temporary file and is idempotent', async () => {
    const dir = tempDir();
    const target = join(dir, 'cancelled.csv');
    const { writer } = createWriter(target);
    const begin = await writer.handle({
      op: 'begin',
      suggestedName: 'cancelled.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (begin === null || begin.op !== 'begin') {
      throw new Error('expected begin');
    }

    await writer.handle({ op: 'append', token: begin.token, chunk: 'partial' });
    await expect(writer.handle({ op: 'cancel', token: begin.token })).resolves.toEqual({
      op: 'cancel',
      removed: true,
    });
    expect(readdirSync(dir)).toEqual([]);
    await expect(writer.handle({ op: 'cancel', token: begin.token })).resolves.toEqual({
      op: 'cancel',
      removed: false,
    });
  });

  it('rejects append/finish for an unknown or finished token', async () => {
    const dir = tempDir();
    const target = join(dir, 'once.csv');
    const { writer } = createWriter(target);
    const begin = await writer.handle({
      op: 'begin',
      suggestedName: 'once.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (begin === null || begin.op !== 'begin') {
      throw new Error('expected begin');
    }

    await writer.handle({ op: 'finish', token: begin.token, rows: 0 });
    await expect(
      writer.handle({ op: 'append', token: begin.token, chunk: 'late' }),
    ).rejects.toMatchObject({ code: 'E_EXPORT_FAILED' });
    await expect(
      writer.handle({ op: 'finish', token: begin.token, rows: 0 }),
    ).rejects.toMatchObject({ code: 'E_EXPORT_FAILED' });
    await expect(
      writer.handle({ op: 'append', token: 'missing', chunk: 'x' }),
    ).rejects.toMatchObject({ code: 'E_EXPORT_FAILED' });
  });

  it('fails begin when the destination directory does not exist', async () => {
    const dir = tempDir();
    const target = join(dir, 'missing', 'out.csv');
    const { writer } = createWriter(target);

    await expect(
      writer.handle({
        op: 'begin',
        suggestedName: 'out.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      }),
    ).rejects.toMatchObject({ code: 'E_EXPORT_FAILED' });
    expect(readdirSync(dir)).toEqual([]);
    expect(writer.activeCount()).toBe(0);
  });

  it('removes the temporary file when the final rename fails', async () => {
    const dir = tempDir();
    const target = join(dir, 'target.csv');
    mkdirSync(target);
    const { writer } = createWriter(target);
    const begin = await writer.handle({
      op: 'begin',
      suggestedName: 'target.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (begin === null || begin.op !== 'begin') {
      throw new Error('expected begin');
    }
    await writer.handle({ op: 'append', token: begin.token, chunk: 'a,b\r\n' });

    await expect(
      writer.handle({ op: 'finish', token: begin.token, rows: 1 }),
    ).rejects.toMatchObject({ code: 'E_EXPORT_FAILED' });
    expect(readdirSync(dir)).toEqual(['target.csv']);
    expect(writer.activeCount()).toBe(0);
  });

  it('rejects a chunk that exceeds the byte limit', async () => {
    const dir = tempDir();
    const target = join(dir, 'big.csv');
    const { writer } = createWriter(target);
    const begin = await writer.handle({
      op: 'begin',
      suggestedName: 'big.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (begin === null || begin.op !== 'begin') {
      throw new Error('expected begin');
    }

    await expect(
      writer.handle({ op: 'append', token: begin.token, chunk: 'x'.repeat(8 * 1024 * 1024 + 1) }),
    ).rejects.toMatchObject({ code: 'E_PAYLOAD_TOO_LARGE' });
    await writer.handle({ op: 'cancel', token: begin.token });
  });

  it('dispose removes every unfinished temporary file', async () => {
    const dir = tempDir();
    const first = join(dir, 'first.csv');
    const second = join(dir, 'second.csv');
    const writer = createCsvExportWriter({
      chooseSavePath: async (suggestedName) => (suggestedName === 'first.csv' ? first : second),
      uuid: counterUuid(),
    });

    const beginFirst = await writer.handle({
      op: 'begin',
      suggestedName: 'first.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    const beginSecond = await writer.handle({
      op: 'begin',
      suggestedName: 'second.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (beginFirst === null || beginFirst.op !== 'begin') {
      throw new Error('expected begin');
    }
    if (beginSecond === null || beginSecond.op !== 'begin') {
      throw new Error('expected begin');
    }
    await writer.handle({ op: 'append', token: beginFirst.token, chunk: 'one' });
    await writer.handle({ op: 'append', token: beginSecond.token, chunk: 'two' });

    expect(writer.activeCount()).toBe(2);
    writer.dispose();
    expect(writer.activeCount()).toBe(0);
    expect(readdirSync(dir)).toEqual([]);
  });
});
