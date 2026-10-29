import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_APP_SETTINGS } from '../../shared/contracts/settings';

import { SETTINGS_FILE_NAME, createAppSettingsStore } from './app-settings-store';

import type { AppSettings } from '../../shared/contracts/settings';
import type { AtomicWrite } from '../workspace/atomic-write';

const CUSTOM: AppSettings = {
  version: 1,
  theme: 'dark',
  locale: 'en-US',
  autosave: false,
  defaultTableStyleId: 'builtin.finance',
};

const directories: string[] = [];

async function scratch(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'curve-settings-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('application settings store', () => {
  it('starts from defaults when settings.json is missing', async () => {
    const directory = await scratch();
    const store = createAppSettingsStore({ userDataPath: directory });

    await expect(store.load()).resolves.toEqual(DEFAULT_APP_SETTINGS);
    expect(store.get()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('falls back to defaults for corrupt JSON and warns', async () => {
    const directory = await scratch();
    await writeFile(join(directory, SETTINGS_FILE_NAME), '{not json', 'utf8');
    const warn = vi.fn();
    const store = createAppSettingsStore({ userDataPath: directory, logger: { warn } });

    await expect(store.load()).resolves.toEqual(DEFAULT_APP_SETTINGS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
  });

  it('recovers valid fields from a partial/invalid document', async () => {
    const directory = await scratch();
    await writeFile(
      join(directory, SETTINGS_FILE_NAME),
      JSON.stringify({
        theme: 'dark',
        locale: 'fr-FR',
        autosave: 'yes',
        defaultTableStyleId: 'sty_not-builtin',
        extra: true,
      }),
      'utf8',
    );
    const store = createAppSettingsStore({ userDataPath: directory });

    await expect(store.load()).resolves.toEqual({
      ...DEFAULT_APP_SETTINGS,
      theme: 'dark',
    });
  });

  it('writes an atomic JSON document and reads it back', async () => {
    const directory = await scratch();
    const write = vi.fn<AtomicWrite>(async () => undefined);
    const store = createAppSettingsStore({ userDataPath: directory, write });

    await expect(store.update(CUSTOM)).resolves.toEqual(CUSTOM);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toBe(join(directory, SETTINGS_FILE_NAME));
    expect(JSON.parse(String(write.mock.calls[0]?.[1]))).toEqual(CUSTOM);

    const reopened = createAppSettingsStore({ userDataPath: directory, write });
    // The injected writer did not touch disk; seed the file to prove the reader.
    await writeFile(
      join(directory, SETTINGS_FILE_NAME),
      `${JSON.stringify(CUSTOM, null, 2)}\n`,
      'utf8',
    );
    await expect(reopened.load()).resolves.toEqual(CUSTOM);
    expect(await readFile(join(directory, SETTINGS_FILE_NAME), 'utf8')).toContain(
      '"theme": "dark"',
    );
  });

  it('serialises concurrent updates so the last one wins on disk', async () => {
    const directory = await scratch();
    const order: string[] = [];
    const write = vi.fn<AtomicWrite>(async (_file, data) => {
      const parsed = JSON.parse(data) as AppSettings;
      order.push(parsed.locale);
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const store = createAppSettingsStore({ userDataPath: directory, write });

    const first = store.update({ ...CUSTOM, locale: 'en-US' });
    const second = store.update({ ...CUSTOM, locale: 'zh-CN' });
    await Promise.all([first, second]);

    expect(order).toEqual(['en-US', 'zh-CN']);
    expect(store.get().locale).toBe('zh-CN');
  });

  it('does not write unchanged settings; a failed write keeps the session value', async () => {
    const directory = await scratch();
    const write = vi.fn<AtomicWrite>(async () => {
      throw new Error('EACCES');
    });
    const store = createAppSettingsStore({ userDataPath: directory, write });

    await store.load();
    await store.update({ ...DEFAULT_APP_SETTINGS });
    expect(write).not.toHaveBeenCalled();

    await expect(store.update(CUSTOM)).rejects.toMatchObject({ code: 'E_FS_WRITE' });
    // The session uses the chosen value; the error tells the user it will not
    // survive a restart because the file write failed.
    expect(store.get()).toEqual(CUSTOM);
  });
});
