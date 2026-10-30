/**
 * T6.6 main-process logger: console output plus the SPEC §16.5 file log.
 *
 * electron-log owns the file format/level policy and the actual writes; the
 * daily rotation lives in `./log-files` and runs before every line (a cheap
 * string comparison on the same day). The file transport is synchronous, so a
 * crash keeps every line already written and renaming between writes is safe.
 */

import { join } from 'node:path';

import log from 'electron-log/main';

import { createConsoleSink, createLogger } from '../logger';

import { createDailyLogRotator, CURRENT_LOG_FILE } from './log-files';

import type { LogLevel, Logger } from '../logger';

export interface MainLoggerOptions {
  /** `app.getPath('userData')`; the log directory is `<userData>/logs`. */
  userDataDir: string;
  isDev: boolean;
  /** Injectable clock for tests; production uses the wall clock. */
  now?: () => Date;
}

/** Attaches electron-log's file transport and returns the composite logger. */
export function createMainLogger(options: MainLoggerOptions): Logger {
  const dir = join(options.userDataDir, 'logs');
  const rotator = createDailyLogRotator(
    options.now === undefined ? { dir } : { dir, now: options.now },
  );
  const consoleSink = createConsoleSink();
  const minLevel = options.isDev ? 'debug' : 'info';

  // The app logger owns console output (same `[main]` prefix as before); avoid
  // electron-log writing every line to the console a second time.
  log.transports.console.level = false;
  const file = log.transports.file;
  file.resolvePathFn = () => join(dir, CURRENT_LOG_FILE);
  file.level = minLevel;
  file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  // Daily rotation bounds the file; size cropping would invalidate the archive
  // names and is unnecessary for a single session's log.
  file.maxSize = 0;

  const writeToFile = (level: LogLevel, line: string): void => {
    try {
      rotator.ensureCurrentDay();
      switch (level) {
        case 'debug':
          log.debug(line);
          break;
        case 'info':
          log.info(line);
          break;
        case 'warn':
          log.warn(line);
          break;
        case 'error':
          log.error(line);
          break;
      }
    } catch (error) {
      // Logging must never take the app down; keep the console copy visible.
      consoleSink('warn', `log file write failed: ${String(error)}`);
    }
  };

  return createLogger(
    (level, line) => {
      consoleSink(level, line);
      writeToFile(level, line);
    },
    { minLevel },
  );
}
