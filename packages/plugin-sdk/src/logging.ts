/**
 * Logger plumbing for the plugin host (T6.1, ADR-052).
 *
 * The package has no Node/DOM types, so the default logger reaches `console`
 * through `globalThis` defensively: a host that injects its own logger never
 * depends on it.
 */

import type { PluginLogger } from './types';

type LogLevel = 'info' | 'warn' | 'error';

interface ConsoleLike {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

function resolveConsole(): ConsoleLike | undefined {
  return (globalThis as { console?: ConsoleLike }).console;
}

export function createConsolePluginLogger(): PluginLogger {
  const write =
    (level: LogLevel) =>
    (message: string, detail?: unknown): void => {
      const target = resolveConsole();
      if (target === undefined) {
        return;
      }
      if (detail === undefined) {
        target[level](message);
      } else {
        target[level](message, detail);
      }
    };

  return { info: write('info'), warn: write('warn'), error: write('error') };
}

export function prefixLogger(logger: PluginLogger, prefix: string): PluginLogger {
  return {
    info: (message: string, detail?: unknown): void => {
      logger.info(`${prefix} ${message}`, detail);
    },
    warn: (message: string, detail?: unknown): void => {
      logger.warn(`${prefix} ${message}`, detail);
    },
    error: (message: string, detail?: unknown): void => {
      logger.error(`${prefix} ${message}`, detail);
    },
  };
}
