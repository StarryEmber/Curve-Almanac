/**
 * `userData/settings.json` (T5.5, ADR-050).
 *
 * Application preferences live next to `recent.json` and `window-state.json`,
 * never inside a workspace. The file is auxiliary: a missing, unreadable or
 * corrupt document degrades to defaults (field by field) so startup never fails
 * because of a preference. Writes are atomic and serialised so two quick
 * changes cannot interleave.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createAppError } from '@curve/domain';

import {
  DEFAULT_APP_SETTINGS,
  appSettingsEqual,
  normalizeAppSettings,
} from '../../shared/contracts/settings';
import { atomicWrite } from '../workspace/atomic-write';

import type { AppSettings } from '../../shared/contracts/settings';
import type { Logger } from '../logger';
import type { AtomicWrite } from '../workspace/atomic-write';

export const SETTINGS_FILE_NAME = 'settings.json';

export interface AppSettingsStoreOptions {
  /** Electron `app.getPath('userData')`. */
  userDataPath: string;
  logger?: Pick<Logger, 'warn'>;
  /** Injectable for the interrupted-write test; defaults to `write-file-atomic`. */
  write?: AtomicWrite;
}

export interface AppSettingsStore {
  /** Last loaded/written settings; always complete. */
  get(): AppSettings;
  /** Reads the file once at startup; never throws for missing/corrupt data. */
  load(): Promise<AppSettings>;
  /** Normalises, writes atomically and returns the persisted document. */
  update(next: AppSettings): Promise<AppSettings>;
}

function writeErrorDetail(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

export function createAppSettingsStore(options: AppSettingsStoreOptions): AppSettingsStore {
  const filePath = join(options.userDataPath, SETTINGS_FILE_NAME);
  const write = options.write ?? atomicWrite;
  /** Serialises writes; a rejected write must not break the next one. */
  let writeChain: Promise<void> = Promise.resolve();
  let current: AppSettings = DEFAULT_APP_SETTINGS;

  const persist = async (settings: AppSettings): Promise<void> => {
    try {
      await mkdir(options.userDataPath, { recursive: true });
      await write(filePath, `${JSON.stringify(settings, null, 2)}\n`);
    } catch (error) {
      throw createAppError('E_FS_WRITE', 'Cannot save the application settings.', {
        detail: writeErrorDetail(error),
        retryable: true,
      });
    }
  };

  return {
    get(): AppSettings {
      return current;
    },

    async load(): Promise<AppSettings> {
      let raw: string;
      try {
        raw = await readFile(filePath, 'utf8');
      } catch {
        // Missing file: first launch, or the user reset their preferences.
        current = DEFAULT_APP_SETTINGS;
        return current;
      }

      let value: unknown;
      try {
        value = JSON.parse(raw) as unknown;
      } catch {
        options.logger?.warn(`[settings] ${SETTINGS_FILE_NAME} is not valid JSON; using defaults`);
        current = DEFAULT_APP_SETTINGS;
        return current;
      }

      const normalized = normalizeAppSettings(value);
      if (!appSettingsEqual(normalized, value as AppSettings)) {
        options.logger?.warn(
          `[settings] ${SETTINGS_FILE_NAME} had invalid fields; defaults applied`,
        );
      }
      current = normalized;
      return current;
    },

    update(next: AppSettings): Promise<AppSettings> {
      const normalized = normalizeAppSettings(next);
      if (appSettingsEqual(normalized, current)) {
        return Promise.resolve(current);
      }
      const task = writeChain.then(async () => {
        // Apply in memory first: if the disk write fails the session still uses
        // the value the user picked, and the renderer shows the persistence
        // error. A restart falls back to the last successfully written file.
        current = normalized;
        await persist(normalized);
      });
      // Keep the chain alive even when a write fails; the caller still sees the
      // rejection through `task`.
      writeChain = task.catch(() => undefined);
      return task.then(() => current);
    },
  };
}
