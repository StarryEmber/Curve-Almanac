/**
 * Minimal structured logger for the main process.
 *
 * T0.3 only needs console output plus redaction-safe formatting; T1.x will add
 * file logging (SPEC §16.5) behind the same interface. Messages and details are
 * truncated so a single IPC log call cannot be used to bloat the log file.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Receives the already formatted line: `<message> <detail?>`. */
export type LogSink = (level: LogLevel, line: string) => void;

export interface Logger {
  debug(message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  maxMessageLength?: number;
  maxDetailLength?: number;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_MAX_DETAIL_LENGTH = 1000;
const TRUNCATION_SUFFIX = '...';
const UNSERIALISABLE_DETAIL = '[unserialisable detail]';

/** Unknown levels from the renderer degrade to `info` instead of failing. */
export function normalizeLogLevel(value: string): LogLevel {
  switch (value) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return value;
    default:
      return 'info';
  }
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}${TRUNCATION_SUFFIX}` : text;
}

function formatDetail(detail: unknown, limit: number): string | null {
  if (detail === undefined) {
    return null;
  }
  if (typeof detail === 'string') {
    return truncate(detail, limit);
  }
  if (detail instanceof Error) {
    return truncate(detail.stack ?? detail.message, limit);
  }
  try {
    return truncate(JSON.stringify(detail) ?? String(detail), limit);
  } catch {
    return UNSERIALISABLE_DETAIL;
  }
}

export function createLogger(sink: LogSink, options: LoggerOptions = {}): Logger {
  const minLevel = LEVEL_ORDER[options.minLevel ?? 'debug'];
  const maxMessageLength = options.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH;
  const maxDetailLength = options.maxDetailLength ?? DEFAULT_MAX_DETAIL_LENGTH;

  const write = (level: LogLevel, message: string, detail?: unknown): void => {
    if (LEVEL_ORDER[level] < minLevel) {
      return;
    }
    const detailText = formatDetail(detail, maxDetailLength);
    const line = truncate(message, maxMessageLength);
    sink(level, detailText === null ? line : `${line} ${detailText}`);
  };

  return {
    debug: (message, detail) => {
      write('debug', message, detail);
    },
    info: (message, detail) => {
      write('info', message, detail);
    },
    warn: (message, detail) => {
      write('warn', message, detail);
    },
    error: (message, detail) => {
      write('error', message, detail);
    },
  };
}

export function createConsoleLogger(options: LoggerOptions = {}): Logger {
  const writers: Record<LogLevel, (line: string) => void> = {
    debug: (line) => {
      console.debug(line);
    },
    info: (line) => {
      console.info(line);
    },
    warn: (line) => {
      console.warn(line);
    },
    error: (line) => {
      console.error(line);
    },
  };

  return createLogger((level, line) => {
    writers[level](`[main] ${line}`);
  }, options);
}
