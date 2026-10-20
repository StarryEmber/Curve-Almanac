import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  describeFsError,
  isEnoent,
  isPathInside,
  resolveInsideRoot,
  resolveWorkspaceRelativePath,
  toFsError,
} from './path-safety';

const TEMP_DIRECTORIES: string[] = [];

async function makeRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'curve-path-'));
  TEMP_DIRECTORIES.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of TEMP_DIRECTORIES.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('isPathInside', () => {
  it('accepts descendants and rejects the root, siblings and parent escapes', () => {
    const root = join(tmpdir(), 'curve-ws');

    expect(isPathInside(root, join(root, 'tables', 'tbl_1.jsonl'))).toBe(true);
    expect(isPathInside(root, root)).toBe(false);
    expect(isPathInside(root, join(root, '..', 'sibling'))).toBe(false);
    expect(isPathInside(root, join(tmpdir(), 'other'))).toBe(false);
  });
});

describe('resolveInsideRoot', () => {
  it('resolves an existing file and a not-yet-created file inside the root', async () => {
    const root = await makeRoot();
    await mkdir(join(root, 'tables'));
    await writeFile(join(root, 'tables', 'tbl_1.jsonl'), 'hello\n');

    await expect(
      resolveInsideRoot(root, join(root, 'tables', 'tbl_1.jsonl'), 'table'),
    ).resolves.toBe(join(root, 'tables', 'tbl_1.jsonl'));
    await expect(resolveInsideRoot(root, join(root, 'tables', 'new.jsonl'), 'table')).resolves.toBe(
      join(root, 'tables', 'new.jsonl'),
    );
  });

  it('rejects a lexical escape and an unresolvable parent', async () => {
    const root = await makeRoot();

    await expect(
      resolveInsideRoot(root, join(root, '..', 'outside.txt'), 'file'),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });
    await expect(
      resolveInsideRoot(root, join(root, 'missing', 'file.txt'), 'file'),
    ).rejects.toMatchObject({ code: 'E_FS_READ' });
  });
});

describe('resolveWorkspaceRelativePath', () => {
  it('resolves a safe relative path and rejects traversal', async () => {
    const root = await makeRoot();

    await expect(resolveWorkspaceRelativePath(root, 'manifest.json', 'manifest')).resolves.toBe(
      join(root, 'manifest.json'),
    );
    await expect(
      resolveWorkspaceRelativePath(root, '../manifest.json', 'manifest'),
    ).rejects.toMatchObject({ code: 'E_PATH_DENIED' });
  });
});

describe('fs error helpers', () => {
  it('detects ENOENT and renders a path-free detail', () => {
    const error = Object.assign(new Error('open failed'), { code: 'ENOENT' });

    expect(isEnoent(error)).toBe(true);
    expect(isEnoent(new Error('other'))).toBe(false);
    expect(describeFsError(error)).toBe('ENOENT');
    expect(toFsError('E_FS_READ', 'Cannot read.', error)).toMatchObject({
      code: 'E_FS_READ',
      detail: 'ENOENT',
      retryable: true,
    });
  });
});
