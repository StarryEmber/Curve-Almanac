/**
 * T6.6 — SPEC §16.5 file logging.
 *
 * Proves the real Electron app writes `userData/logs/main.log`, forwards
 * renderer errors/rejections through `log:write`, and rotates/prunes daily
 * archives at startup. Rotation across a live midnight is unit-tested
 * (`src/main/logging/log-files.test.ts`) because the E2E process cannot move the
 * system clock.
 */

import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { localDayKey } from '../src/shared/logging-day';

import { launchCurveApp, test } from './fixtures';

import type { LaunchedCurveApp } from './fixtures';

function logFile(userDataDir: string): string {
  return join(userDataDir, 'logs', 'main.log');
}

function readLog(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

async function launch(userDataDir: string): Promise<LaunchedCurveApp> {
  return launchCurveApp({
    userDataDir,
    importFile: join(userDataDir, 'unused.json'),
  });
}

test.describe('T6.6 file logging', () => {
  test('writes main and renderer lines to userData/logs/main.log', async ({
    userDataDir,
  }, testInfo) => {
    const app = await launch(userDataDir);
    try {
      await expect(app.page.getByTestId('welcome')).toBeVisible();
      const path = logFile(userDataDir);

      await expect.poll(() => existsSync(path), { timeout: 10_000 }).toBe(true);
      await expect.poll(() => readLog(path), { timeout: 10_000 }).toContain('window ready');

      // A real uncaught error in the renderer must reach the file through the
      // global listener + `log:write` (main prefixes `[renderer]`).
      await app.page.evaluate(() => {
        setTimeout(() => {
          throw new Error('E2E renderer boom');
        }, 0);
      });
      await expect.poll(() => readLog(path), { timeout: 10_000 }).toContain('E2E renderer boom');
      await expect.poll(() => readLog(path)).toContain('[renderer]');

      await app.page.evaluate(() => {
        void Promise.reject(new Error('E2E rejection boom'));
      });
      await expect.poll(() => readLog(path), { timeout: 10_000 }).toContain('E2E rejection boom');

      const sample = readLog(path)
        .replaceAll(userDataDir, '<userData>')
        .split('\n')
        .slice(0, 80)
        .join('\n');
      await testInfo.attach('main-log-sample', { body: sample, contentType: 'text/plain' });
    } finally {
      await app.electronApp.close().catch(() => undefined);
    }
  });

  test('rotates yesterday log, keeps seven days and prunes older archives', async ({
    userDataDir,
  }) => {
    const logs = join(userDataDir, 'logs');
    mkdirSync(logs, { recursive: true });
    const yesterday = daysAgo(1);
    const yesterdayKey = localDayKey(yesterday);
    const keepKey = localDayKey(daysAgo(2));
    const oldKey = localDayKey(daysAgo(8));
    const current = join(logs, 'main.log');
    writeFileSync(current, 'previous run\n', 'utf8');
    utimesSync(current, yesterday, yesterday);
    writeFileSync(join(logs, `main-${keepKey}.log`), 'keep\n', 'utf8');
    writeFileSync(join(logs, `main-${oldKey}.log`), 'old\n', 'utf8');

    const app = await launch(userDataDir);
    try {
      await expect(app.page.getByTestId('welcome')).toBeVisible();
      const archive = join(logs, `main-${yesterdayKey}.log`);
      await expect.poll(() => existsSync(archive), { timeout: 10_000 }).toBe(true);
      expect(readFileSync(archive, 'utf8')).toContain('previous run');
      await expect.poll(() => readLog(current), { timeout: 10_000 }).toContain('window ready');
      expect(existsSync(join(logs, `main-${oldKey}.log`))).toBe(false);
      expect(existsSync(join(logs, `main-${keepKey}.log`))).toBe(true);
    } finally {
      await app.electronApp.close().catch(() => undefined);
    }
  });
});
