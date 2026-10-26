import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { exportTextFile, importFormatFromName, readImportSource } from './import-files';

const directories: string[] = [];

async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'curve-import-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('importFormatFromName', () => {
  it('accepts csv/tsv/json case-insensitively and rejects others', () => {
    expect(importFormatFromName('a.CSV')).toBe('csv');
    expect(importFormatFromName('a.tsv')).toBe('csv');
    expect(importFormatFromName('a.json')).toBe('json');
    expect(importFormatFromName('a.xlsx')).toBeNull();
  });
});

describe('readImportSource', () => {
  it('reads raw bytes and hashes them without decoding', async () => {
    const directory = await scratch();
    const path = join(directory, 'gbk.csv');
    const gbk = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0x0a]);
    await writeFile(path, gbk);

    const source = await readImportSource(path);

    expect(source.name).toBe('gbk.csv');
    expect(source.format).toBe('csv');
    expect(source.size).toBe(gbk.byteLength);
    expect([...source.bytes]).toEqual([...gbk]);
    expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects unsupported extensions and missing files', async () => {
    const directory = await scratch();
    await writeFile(join(directory, 'a.txt'), 'x');

    await expect(readImportSource(join(directory, 'a.txt'))).rejects.toMatchObject({
      code: 'E_IMPORT_FORMAT',
    });
    await expect(readImportSource(join(directory, 'missing.csv'))).rejects.toMatchObject({
      code: 'E_FS_READ',
    });
  });
});

describe('exportTextFile', () => {
  it('writes the text atomically to the chosen path', async () => {
    const directory = await scratch();
    const path = join(directory, 'errors.csv');

    await expect(exportTextFile(path, 'a,b\n1,2\n')).resolves.toEqual({ path });
    await expect(readFile(path, 'utf8')).resolves.toBe('a,b\n1,2\n');
  });

  it('decodes base64 and writes binary bytes for PNG export', async () => {
    const directory = await scratch();
    const path = join(directory, 'chart.png');
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(exportTextFile(path, bytes.toString('base64'), 'base64')).resolves.toEqual({
      path,
    });
    await expect(readFile(path)).resolves.toEqual(bytes);
  });

  it('rejects malformed base64 without writing a file', async () => {
    const directory = await scratch();
    const path = join(directory, 'chart.png');

    await expect(exportTextFile(path, 'not base64!', 'base64')).rejects.toMatchObject({
      code: 'E_VALIDATION',
    });
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps UTF-8 as the default when encoding is omitted', async () => {
    const directory = await scratch();
    const path = join(directory, 'report.csv');

    await exportTextFile(path, 'é');
    await expect(readFile(path, 'utf8')).resolves.toBe('é');
  });
});
