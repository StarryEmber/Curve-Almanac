/**
 * T6.6 renderer-side global error forwarding (SPEC §16.5).
 *
 * `main.tsx` installs this before the first paint. Uncaught `error` events and
 * unhandled promise rejections are truncated/stringified and forwarded to main
 * through `log:write`, which prefixes them with `[renderer]` and appends them to
 * the same `userData/logs/main.log` file. A token bucket caps the traffic at
 * 10 reports per minute so a render loop cannot flood the log; dropped reports
 * are silent (the console still shows them).
 */

import type { LogWriteRequest } from '../../shared/contracts/ipc';

export const ERROR_REPORT_LIMIT = 10;
export const ERROR_REPORT_WINDOW_MS = 60_000;

export interface ErrorReport extends LogWriteRequest {
  level: 'error';
}

export interface InstallErrorReportingOptions {
  write: (report: ErrorReport) => unknown;
  /** Injectable for tests; defaults to `window`. */
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  now?: () => number;
  limit?: number;
  windowMs?: number;
}

interface DescribedError {
  message: string;
  detail?: string;
}

function describeValue(value: unknown): DescribedError {
  if (value instanceof Error) {
    return {
      message: value.message.length > 0 ? value.message : value.name,
      detail: value.stack ?? `${value.name}: ${value.message}`,
    };
  }
  if (typeof value === 'string') {
    return { message: value };
  }
  if (value === undefined || value === null) {
    return { message: String(value) };
  }
  try {
    return { message: JSON.stringify(value) };
  } catch {
    return { message: String(value) };
  }
}

function describeErrorEvent(event: ErrorEvent): DescribedError {
  const described =
    event.error === undefined ? { message: event.message } : describeValue(event.error);
  const location =
    event.filename === undefined || event.filename.length === 0
      ? ''
      : ` (${event.filename}:${String(event.lineno)}:${String(event.colno)})`;
  return {
    message: described.message.length > 0 ? described.message : 'Unknown error',
    ...(described.detail === undefined
      ? location.length === 0
        ? {}
        : { detail: location.trim() }
      : { detail: `${described.detail}${location}` }),
  };
}

function describeRejectionEvent(event: PromiseRejectionEvent): DescribedError {
  return describeValue(event.reason);
}

/** Installs the listeners and returns an idempotent uninstall function. */
export function installGlobalErrorReporting(options: InstallErrorReportingOptions): () => void {
  const target = options.target ?? (typeof window === 'undefined' ? undefined : (window as Window));
  if (target === undefined) {
    return () => undefined;
  }
  const now = options.now ?? ((): number => Date.now());
  const limit = options.limit ?? ERROR_REPORT_LIMIT;
  const windowMs = options.windowMs ?? ERROR_REPORT_WINDOW_MS;
  let sent: number[] = [];

  const report = (prefix: string, described: DescribedError): void => {
    const timestamp = now();
    sent = sent.filter((entry) => timestamp - entry < windowMs);
    if (sent.length >= limit) {
      return;
    }
    sent.push(timestamp);
    const payload: ErrorReport = {
      level: 'error',
      message: `${prefix}: ${described.message}`,
      ...(described.detail === undefined ? {} : { detail: described.detail }),
    };
    try {
      void Promise.resolve(options.write(payload)).catch(() => undefined);
    } catch {
      // The bridge is unavailable or threw synchronously; never break the app.
    }
  };

  const onError = (event: ErrorEvent): void => {
    report('Uncaught error', describeErrorEvent(event));
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    report('Unhandled rejection', describeRejectionEvent(event));
  };

  target.addEventListener('error', onError as EventListener);
  target.addEventListener('unhandledrejection', onRejection as EventListener);

  return () => {
    target.removeEventListener('error', onError as EventListener);
    target.removeEventListener('unhandledrejection', onRejection as EventListener);
  };
}
