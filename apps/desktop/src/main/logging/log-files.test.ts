import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDailyLogRotator, localDayKey, retentionCutoffDay } from './log-files';

const created: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'curve-log-'));
  created.push(dir);
  return dir;
}

function day(offset: number): Date {
  const date = new Date(2026, 9, 30, 12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function writeWithMtime(path: string, content: string, mtime: Date): void {
  writeFileSync(path, content, 'utf8');
  utimesSync(path, mtime, mtime);
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('localDayKey / retentionCutoffDay', () => {
  it('formats the local calendar day', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDayKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  it('keeps seven days including today', () => {
    expect(retentionCutoffDay(day(0), 7)).toBe('2026-10-24');
    expect(retentionCutoffDay(day(0), 1)).toBe('2026-10-30');
  });
});

describe('createDailyLogRotator', () => {
  it('creates the log directory and keeps a same-day main.log', () => {
    const dir = join(tempDir(), 'logs');
    expect(existsSync(dir)).toBe(false);

    const rotator = createDailyLogRotator({ dir, now: () => day(0) });
    expect(existsSync(dir)).toBe(true);
    expect(rotator.currentDay).toBe('2026-10-30');

    writeFileSync(join(dir, 'main.log'), 'today\n', 'utf8');
    expect(rotator.ensureCurrentDay()).toEqual({ rotatedTo: null, removed: [] });
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('today\n');
  });

  it('archives a stale main.log by its last-write day and prunes old archives', () => {
    const dir = tempDir();
    writeWithMtime(join(dir, 'main.log'), 'stale\n', day(-2));
    writeFileSync(join(dir, 'main-2026-10-22.log'), 'eight days old\n', 'utf8');
    writeFileSync(join(dir, 'main-2026-10-29.log'), 'yesterday\n', 'utf8');
    writeFileSync(join(dir, 'notes.txt'), 'not a log\n', 'utf8');

    const rotator = createDailyLogRotator({ dir, now: () => day(0) });

    expect(existsSync(join(dir, 'main.log'))).toBe(false);
    expect(readFileSync(join(dir, 'main-2026-10-28.log'), 'utf8')).toBe('stale\n');
    expect(existsSync(join(dir, 'main-2026-10-22.log'))).toBe(false);
    expect(readFileSync(join(dir, 'main-2026-10-29.log'), 'utf8')).toBe('yesterday\n');
    expect(readFileSync(join(dir, 'notes.txt'), 'utf8')).toBe('not a log\n');
    expect(rotator.currentDay).toBe('2026-10-30');
  });

  it('rolls over at the first write after local midnight', () => {
    const dir = tempDir();
    let now = day(0);
    const rotator = createDailyLogRotator({ dir, now: () => now });
    writeFileSync(join(dir, 'main.log'), 'day zero\n', 'utf8');

    now = day(1);
    const result = rotator.ensureCurrentDay();
    expect(result.rotatedTo).toBe(join(dir, 'main-2026-10-30.log'));
    expect(readFileSync(join(dir, 'main-2026-10-30.log'), 'utf8')).toBe('day zero\n');
    expect(existsSync(join(dir, 'main.log'))).toBe(false);
    expect(rotator.currentDay).toBe('2026-10-31');

    writeFileSync(join(dir, 'main.log'), 'day one\n', 'utf8');
    expect(rotator.ensureCurrentDay()).toEqual({ rotatedTo: null, removed: [] });
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('day one\n');
  });

  it('appends instead of overwriting an archive with the same day', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'main-2026-10-29.log'), 'first run\n', 'utf8');
    writeWithMtime(join(dir, 'main.log'), 'second run\n', day(-1));

    createDailyLogRotator({ dir, now: () => day(0) });

    expect(readFileSync(join(dir, 'main-2026-10-29.log'), 'utf8')).toBe('first run\nsecond run\n');
    expect(existsSync(join(dir, 'main.log'))).toBe(false);
  });

  it('prunes by the retention window on rollover', () => {
    const dir = tempDir();
    let now = day(0);
    const rotator = createDailyLogRotator({ dir, now: () => now, retentionDays: 2 });
    writeFileSync(join(dir, 'main-2026-10-27.log'), 'too old\n', 'utf8');
    writeFileSync(join(dir, 'main-2026-10-30.log'), 'kept\n', 'utf8');
    writeFileSync(join(dir, 'main.log'), 'today\n', 'utf8');

    now = day(1);
    const result = rotator.ensureCurrentDay();

    expect(result.removed).toContain(join(dir, 'main-2026-10-27.log'));
    expect(existsSync(join(dir, 'main-2026-10-30.log'))).toBe(true);
  });
});
