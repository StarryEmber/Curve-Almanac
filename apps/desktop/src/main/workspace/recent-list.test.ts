import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createRecentList, MAX_RECENT_ENTRIES, RECENT_FILE_NAME } from './recent-list';

const TEMP_DIRECTORIES: string[] = [];

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'curve-recent-'));
  TEMP_DIRECTORIES.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of TEMP_DIRECTORIES.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('recent workspace list', () => {
  it('starts empty, records entries newest first and deduplicates a path', async () => {
    const directory = await makeDirectory();
    let tick = Date.parse('2026-10-20T00:00:00.000Z');
    const list = createRecentList({
      userDataPath: directory,
      now: () => {
        const value = new Date(tick);
        tick += 1_000;
        return value;
      },
    });

    await expect(list.list()).resolves.toEqual([]);
    await list.add('C:\\ws\\Demo.cstudio', 'Demo');
    await list.add('C:\\ws\\Other.cstudio', 'Other');
    await list.add('C:\\ws\\Demo.cstudio', 'Demo renamed');

    const entries = await list.list();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ name: 'Demo renamed' });
    expect(entries[1]).toMatchObject({ name: 'Other' });

    const raw = JSON.parse(await readFile(join(directory, RECENT_FILE_NAME), 'utf8')) as unknown;
    expect(raw).toHaveLength(2);
  });

  it('degrades a corrupt file to an empty list and overwrites it on the next add', async () => {
    const directory = await makeDirectory();
    await writeFile(join(directory, RECENT_FILE_NAME), '{not json');
    const list = createRecentList({ userDataPath: directory });

    await expect(list.list()).resolves.toEqual([]);
    await list.add('C:\\ws\\Demo.cstudio', 'Demo');
    await expect(list.list()).resolves.toHaveLength(1);
  });

  it('caps the list at MAX_RECENT_ENTRIES', async () => {
    const directory = await makeDirectory();
    const list = createRecentList({ userDataPath: directory });

    for (let index = 0; index < MAX_RECENT_ENTRIES + 5; index += 1) {
      await list.add(`C:\\ws\\${index}.cstudio`, `Workspace ${index}`);
    }

    await expect(list.list()).resolves.toHaveLength(MAX_RECENT_ENTRIES);
  });

  it('removes one entry by path (case-insensitive on Windows) (T5.3)', async () => {
    const directory = await makeDirectory();
    const list = createRecentList({ userDataPath: directory });
    await list.add('C:\\ws\\Demo.cstudio', 'Demo');
    await list.add('C:\\ws\\Other.cstudio', 'Other');

    // `recentKey` lowercases only on Windows; Linux paths are case-sensitive.
    const removePath = process.platform === 'win32' ? 'c:\\ws\\demo.cstudio' : 'C:\\ws\\Demo.cstudio';
    await list.remove(removePath);
    await expect(list.list()).resolves.toMatchObject([{ name: 'Other' }]);

    await list.clear();
    await expect(list.list()).resolves.toEqual([]);
    const raw = JSON.parse(await readFile(join(directory, RECENT_FILE_NAME), 'utf8')) as unknown;
    expect(raw).toEqual([]);
  });

  it('creates the list when remove/clear is called before the first open', async () => {
    const directory = await makeDirectory();
    const list = createRecentList({ userDataPath: directory });

    await list.remove('C:\\ws\\Demo.cstudio');
    await list.clear();

    await expect(list.list()).resolves.toEqual([]);
    await expect(readFile(join(directory, RECENT_FILE_NAME), 'utf8')).resolves.toBe('[]\n');
  });

  it('surfaces a write failure as E_FS_WRITE', async () => {
    const directory = await makeDirectory();
    const list = createRecentList({
      userDataPath: directory,
      write: async () => {
        throw new Error('disk full');
      },
    });

    await expect(list.add('C:\\ws\\Demo.cstudio', 'Demo')).rejects.toMatchObject({
      code: 'E_FS_WRITE',
    });
  });
});
