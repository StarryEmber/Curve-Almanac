import type { AppError } from '@curve/domain';

/**
 * Logging port for app-core.
 *
 * The renderer/main can inject their existing logger; tests inject a spy. The
 * default only writes to the console so a missing injection cannot lose errors.
 */
export interface AppLogger {
  error(event: string, error: AppError): void;
  warn(event: string, detail: string): void;
}

interface ConsoleLike {
  error(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
}

function runtimeConsole(): ConsoleLike | undefined {
  return (globalThis as { console?: ConsoleLike }).console;
}

export const defaultAppLogger: AppLogger = {
  error(event: string, error: AppError): void {
    runtimeConsole()?.error(`[app-core] ${event}`, error);
  },
  warn(event: string, detail: string): void {
    runtimeConsole()?.warn(`[app-core] ${event}`, detail);
  },
};
