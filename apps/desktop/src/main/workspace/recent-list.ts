/**
 * `userData/recent.json` (SPEC §15.1 `workspace:recent`).
 *
 * The list is auxiliary: a missing or corrupt file degrades to "no recents"
 * rather than blocking startup. It stores only path/name/lastOpenedAt and never
 * grants access; opening a recent entry still goes through `workspace:open`.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { createAppError } from '@curve/domain';

import { workspaceRecentResponseSchema } from '../../shared/contracts/ipc';

import { atomicWrite } from './atomic-write';
import { isEnoent, toFsError } from './path-safety';

import type { AtomicWrite } from './atomic-write';
import type { RecentEntry } from '../../shared/contracts/ipc';

export const RECENT_FILE_NAME = 'recent.json';
export const MAX_RECENT_ENTRIES = 20;

export interface RecentListStore {
  list(): Promise<RecentEntry[]>;
  add(path: string, name: string): Promise<void>;
}

export interface RecentListOptions {
  userDataPath: string;
  now?: () => Date;
  write?: AtomicWrite;
}

function recentKey(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
}

function sortEntries(entries: readonly RecentEntry[]): RecentEntry[] {
  return [...entries].sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
}

export function createRecentList(options: RecentListOptions): RecentListStore {
  const filePath = join(options.userDataPath, RECENT_FILE_NAME);
  const now = options.now ?? (() => new Date());
  const write = options.write ?? atomicWrite;

  return {
    async list(): Promise<RecentEntry[]> {
      let raw: string;
      try {
        raw = await readFile(filePath, 'utf8');
      } catch {
        return [];
      }

      let value: unknown;
      try {
        value = JSON.parse(raw) as unknown;
      } catch {
        return [];
      }
      const parsed = workspaceRecentResponseSchema.safeParse(value);
      if (!parsed.success) {
        return [];
      }
      return sortEntries(parsed.data).slice(0, MAX_RECENT_ENTRIES);
    },

    async add(path: string, name: string): Promise<void> {
      const entries = await this.list();
      const key = recentKey(path);
      const next: RecentEntry[] = [
        { path, name, lastOpenedAt: now().toISOString() },
        ...entries.filter((entry) => recentKey(entry.path) !== key),
      ].slice(0, MAX_RECENT_ENTRIES);

      try {
        await mkdir(dirname(filePath), { recursive: true });
        await write(filePath, `${JSON.stringify(next, null, 2)}\n`);
      } catch (error) {
        if (isEnoent(error)) {
          throw toFsError('E_FS_WRITE', 'Cannot create the recent-workspaces list.', error);
        }
        throw createAppError('E_FS_WRITE', 'Cannot save the recent-workspaces list.', {
          detail: error instanceof Error ? error.name : 'unknown error',
          retryable: true,
        });
      }
    },
  };
}
