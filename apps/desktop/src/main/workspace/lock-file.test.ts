import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  LOCK_MAX_AGE_MS,
  defaultIsProcessAlive,
  inspectLock,
  isLockStale,
  lockDocument,
  removeLockIfOwned,
  workspaceLockSchema,
  writeLock,
} from './lock-file';

import type { WorkspaceLock } from './lock-file';

const TEMP_DIRECTORIES: string[] = [];
const NOW = new Date('2026-10-20T00:00:00.000Z');

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'curve-lock-'));
  TEMP_DIRECTORIES.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of TEMP_DIRECTORIES.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

function lock(overrides: Partial<WorkspaceLock> = {}): WorkspaceLock {
  return {
    pid: 1234,
    startedAt: NOW.toISOString(),
    appVersion: '0.1.0',
    ...overrides,
  };
}

describe('workspace lock document', () => {
  it('writes and reads a valid lock', async () => {
    const directory = await makeDirectory();
    const path = join(directory, '.lock');
    const value = lockDocument(4242, NOW, '0.1.0');

    await writeLock(path, value);

    expect(workspaceLockSchema.parse(JSON.parse(await readFile(path, 'utf8')))).toEqual(value);
    await expect(inspectLock(path, { now: NOW, isProcessAlive: () => true })).resolves.toEqual({
      status: 'active',
      lock: value,
    });
  });

  it('reports a missing, corrupt or stale lock', async () => {
    const directory = await makeDirectory();
    const path = join(directory, '.lock');

    await expect(inspectLock(path, { now: NOW, isProcessAlive: () => true })).resolves.toEqual({
      status: 'none',
    });

    await writeFile(path, '{not json');
    await expect(inspectLock(path, { now: NOW, isProcessAlive: () => true })).resolves.toEqual({
      status: 'corrupt',
    });

    await writeFile(
      path,
      JSON.stringify(
        lock({ startedAt: new Date(NOW.getTime() - LOCK_MAX_AGE_MS - 1).toISOString() }),
      ),
    );
    await expect(
      inspectLock(path, { now: NOW, isProcessAlive: () => true }),
    ).resolves.toMatchObject({
      status: 'stale',
    });

    await writeFile(path, JSON.stringify(lock()));
    await expect(
      inspectLock(path, { now: NOW, isProcessAlive: () => false }),
    ).resolves.toMatchObject({
      status: 'stale',
    });
  });

  it('treats an old lock as stale even when the PID is alive', () => {
    const stale = lock({
      startedAt: new Date(NOW.getTime() - LOCK_MAX_AGE_MS - 1).toISOString(),
    });
    const fresh = lock();

    expect(isLockStale(stale, NOW, () => true)).toBe(true);
    expect(isLockStale(fresh, NOW, () => true)).toBe(false);
    expect(isLockStale(fresh, NOW, () => false)).toBe(true);
  });

  it('removes only a lock owned by the caller', async () => {
    const directory = await makeDirectory();
    const path = join(directory, '.lock');

    await writeLock(path, lock({ pid: 1 }));
    await removeLockIfOwned(path, 2);
    await expect(readFile(path, 'utf8')).resolves.toContain('"pid":1');

    await removeLockIfOwned(path, 1);
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('checks the current PID with the default probe', () => {
    expect(defaultIsProcessAlive(process.pid)).toBe(true);
  });
});
