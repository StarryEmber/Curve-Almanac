/**
 * Daily file-log rotation for the main process (T6.6, SPEC §16.5).
 *
 * electron-log writes the current day to `userData/logs/main.log`; this module
 * owns the date boundary:
 *
 * - on startup, a `main.log` left over from an earlier day is renamed to
 *   `main-YYYY-MM-DD.log` (using its last-write time, so a multi-day gap is
 *   recorded truthfully);
 * - when the process crosses local midnight, the first later write performs the
 *   same rename (electron-log closes the file after every synchronous write, so
 *   renaming on Windows is safe);
 * - archives older than the retention window are deleted.
 *
 * Retention counts days including today: with the default 7 days it keeps
 * `main-<today-6>.log` … `main-<today-1>.log` plus the current `main.log`.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { localDayKey } from '../../shared/logging-day';

export { localDayKey };

export const CURRENT_LOG_FILE = 'main.log';
export const LOG_RETENTION_DAYS = 7;

const ARCHIVE_PATTERN = /^main-(\d{4}-\d{2}-\d{2})\.log$/u;

/** Oldest archive day that is still kept (inclusive), for `retentionDays`. */
export function retentionCutoffDay(now: Date, retentionDays = LOG_RETENTION_DAYS): string {
  const cutoff = new Date(now.getTime());
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (retentionDays - 1));
  return localDayKey(cutoff);
}

export interface LogRotationResult {
  /** Archive created by a rollover, if `main.log` existed. */
  rotatedTo: string | null;
  /** Archive paths deleted by retention. */
  removed: readonly string[];
}

export interface DailyLogRotator {
  readonly dir: string;
  /** The day currently considered "today"; updated by `ensureCurrentDay`. */
  readonly currentDay: string;
  /** Rotates when the local date changed; cheap (string compare) on the same day. */
  ensureCurrentDay(): LogRotationResult;
}

export interface DailyLogRotatorOptions {
  dir: string;
  now?: () => Date;
  retentionDays?: number;
}

/** Appends `main.log` into an existing archive so restarts never lose lines. */
function archiveCurrentLog(dir: string, day: string): string | null {
  const currentPath = join(dir, CURRENT_LOG_FILE);
  if (!existsSync(currentPath)) {
    return null;
  }
  const archivePath = join(dir, `main-${day}.log`);
  if (existsSync(archivePath)) {
    appendFileSync(archivePath, readFileSync(currentPath));
    rmSync(currentPath, { force: true });
    return archivePath;
  }
  renameSync(currentPath, archivePath);
  return archivePath;
}

function pruneArchives(dir: string, today: Date, retentionDays: number): string[] {
  const cutoff = retentionCutoffDay(today, retentionDays);
  const removed: string[] = [];
  for (const entry of readdirSync(dir)) {
    const match = ARCHIVE_PATTERN.exec(entry);
    const day = match?.[1];
    if (day === undefined || day >= cutoff) {
      continue;
    }
    const path = join(dir, entry);
    rmSync(path, { force: true });
    removed.push(path);
  }
  return removed;
}

/**
 * Creates the rotator and performs the startup reconciliation immediately, so
 * the first `main.log` line of a new day never lands in yesterday's archive.
 */
export function createDailyLogRotator(options: DailyLogRotatorOptions): DailyLogRotator {
  const { dir } = options;
  const now = options.now ?? ((): Date => new Date());
  const retentionDays = options.retentionDays ?? LOG_RETENTION_DAYS;
  mkdirSync(dir, { recursive: true });

  let currentDay = localDayKey(now());
  const currentPath = join(dir, CURRENT_LOG_FILE);
  if (existsSync(currentPath)) {
    const lastWriteDay = localDayKey(new Date(statSync(currentPath).mtimeMs));
    if (lastWriteDay !== currentDay) {
      archiveCurrentLog(dir, lastWriteDay);
    }
  }
  pruneArchives(dir, now(), retentionDays);

  return {
    dir,
    get currentDay(): string {
      return currentDay;
    },
    ensureCurrentDay(): LogRotationResult {
      const today = now();
      const todayKey = localDayKey(today);
      if (todayKey === currentDay) {
        return { rotatedTo: null, removed: [] };
      }
      const rotatedTo = archiveCurrentLog(dir, currentDay);
      const removed = pruneArchives(dir, today, retentionDays);
      currentDay = todayKey;
      return { rotatedTo, removed };
    },
  };
}
