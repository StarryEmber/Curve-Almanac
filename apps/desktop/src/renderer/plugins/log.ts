/**
 * Plugin log buffer (T6.3).
 *
 * The host logger writes through here so the "plugin log" dialog can show what
 * happened without reading the developer console. Entries are an in-memory ring
 * with a fixed cap: the log is diagnostic UI state, never persisted and never
 * part of a workspace (ADR-054).
 */

import type { PluginLogger } from '@curve/plugin-sdk';

export type PluginLogLevel = 'info' | 'warn' | 'error';

export interface PluginLogEntry {
  readonly id: number;
  /** Epoch milliseconds. */
  readonly timestamp: number;
  readonly level: PluginLogLevel;
  /** Human-readable line; the host prefixes plugin lines with `[plugin:<id>]`. */
  readonly message: string;
}

/** Bounded so a misbehaving plugin cannot grow the renderer heap forever. */
export const MAX_PLUGIN_LOG_ENTRIES = 200;

let nextEntryId = 1;
let entries: readonly PluginLogEntry[] = [];
const listeners = new Set<() => void>();

function notifyLogListeners(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A broken subscriber must not break logging.
    }
  }
}

export function appendPluginLog(level: PluginLogLevel, message: string): void {
  const entry: PluginLogEntry = {
    id: nextEntryId,
    timestamp: Date.now(),
    level,
    message,
  };
  nextEntryId += 1;
  const next = [...entries, entry];
  entries =
    next.length > MAX_PLUGIN_LOG_ENTRIES ? next.slice(next.length - MAX_PLUGIN_LOG_ENTRIES) : next;
  notifyLogListeners();
}

/** Newest last, so the dialog can render top-to-bottom like a console. */
export function listPluginLog(): readonly PluginLogEntry[] {
  return entries;
}

export function subscribePluginLog(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

/** Test hook: clears the ring without touching the plugins themselves. */
export function clearPluginLog(): void {
  entries = [];
  notifyLogListeners();
}

function describeDetail(detail: unknown): string {
  if (detail === undefined) {
    return '';
  }
  if (typeof detail === 'string') {
    return detail;
  }
  if (detail instanceof Error) {
    return detail.message;
  }
  try {
    return JSON.stringify(detail) ?? '';
  } catch {
    return '';
  }
}

function consoleWrite(level: PluginLogLevel, message: string): void {
  if (level === 'error') {
    console.error(message);
    return;
  }
  if (level === 'warn') {
    console.warn(message);
    return;
  }
  console.info(message);
}

/**
 * `PluginLogger` implementation given to `createPluginHost`: every host event and
 * plugin log call lands in the ring (and in the developer console).
 */
export function createRingPluginLogger(
  write: (level: PluginLogLevel, message: string) => void = consoleWrite,
): PluginLogger {
  const log = (level: PluginLogLevel, message: string, detail?: unknown): void => {
    const extra = describeDetail(detail);
    const line = extra.length === 0 ? message : `${message} — ${extra}`;
    appendPluginLog(level, line);
    write(level, line);
  };
  return {
    info: (message: string, detail?: unknown) => {
      log('info', message, detail);
    },
    warn: (message: string, detail?: unknown) => {
      log('warn', message, detail);
    },
    error: (message: string, detail?: unknown) => {
      log('error', message, detail);
    },
  };
}

/**
 * Logger for a contribution call (`CommandDef.run`): the same ring, with the
 * host's `[plugin:<id>]` prefix so the log dialog can attribute the line.
 */
export function createPrefixedPluginLogger(prefix: string): PluginLogger {
  const base = createRingPluginLogger();
  return {
    info: (message: string, detail?: unknown) => {
      base.info(`${prefix} ${message}`, detail);
    },
    warn: (message: string, detail?: unknown) => {
      base.warn(`${prefix} ${message}`, detail);
    },
    error: (message: string, detail?: unknown) => {
      base.error(`${prefix} ${message}`, detail);
    },
  };
}
