/**
 * Plugin runtime error bus (T6.3, SPEC §14.1/§14.3).
 *
 * A contribution call (formatting a cell, running a plugin command, parsing an
 * import) is wrapped by the caller; when it throws, the error is normalised to
 * an `AppError`, tagged with the contributing plugin, appended to the plugin log
 * and published here. The shell turns the event into a toast that names the
 * plugin and can jump to the log. The document is never modified: the failed
 * contribution is invisible to other plugins and to builtin features.
 */

import { toAppError } from '@curve/domain';
import type { AppError } from '@curve/domain';

import { appendPluginLog } from './log';

export interface PluginErrorEvent {
  /** `null` for a host-owned (builtin) contribution. */
  readonly pluginId: string | null;
  readonly pluginName: string;
  readonly error: AppError;
  /** Epoch milliseconds. */
  readonly timestamp: number;
}

/**
 * Repeated failures of the same contribution (for example a formatter that
 * throws for every visible cell) must not flood the log or the toast stack.
 */
export const PLUGIN_ERROR_DEDUPE_MS = 2_000;

const MAX_DEDUPE_KEYS = 100;

const lastReportedAt = new Map<string, number>();
const listeners = new Set<(event: PluginErrorEvent) => void>();

function notifyErrorListeners(event: PluginErrorEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // A broken subscriber must not break error reporting.
    }
  }
}

function signatureOf(event: Omit<PluginErrorEvent, 'timestamp'>): string {
  return `${event.pluginId ?? 'builtin'}|${event.error.code}|${event.error.message}`;
}

function isDuplicate(signature: string, now: number): boolean {
  const previous = lastReportedAt.get(signature);
  if (previous !== undefined && now - previous < PLUGIN_ERROR_DEDUPE_MS) {
    return true;
  }
  return false;
}

function remember(signature: string, now: number): void {
  lastReportedAt.set(signature, now);
  if (lastReportedAt.size <= MAX_DEDUPE_KEYS) {
    return;
  }
  for (const [key, timestamp] of lastReportedAt) {
    if (now - timestamp >= PLUGIN_ERROR_DEDUPE_MS) {
      lastReportedAt.delete(key);
    }
  }
}

/** Reports one failed contribution call. Duplicates within 2s are ignored. */
export function reportPluginError(input: {
  readonly pluginId: string | null;
  readonly pluginName: string;
  readonly error: unknown;
}): void {
  const now = Date.now();
  const error: AppError = toAppError(input.error);
  const event: PluginErrorEvent = {
    pluginId: input.pluginId,
    pluginName: input.pluginName,
    error,
    timestamp: now,
  };
  const signature = signatureOf(event);
  if (isDuplicate(signature, now)) {
    return;
  }
  remember(signature, now);
  appendPluginLog('error', `${input.pluginName}: ${error.code} ${error.message}`);
  notifyErrorListeners(event);
}

export function subscribePluginErrors(listener: (event: PluginErrorEvent) => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

/** Test hook: forgets the dedupe window (listeners are kept). */
export function clearPluginErrorDedupe(): void {
  lastReportedAt.clear();
}
