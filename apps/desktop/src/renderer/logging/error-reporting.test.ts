import { describe, expect, it, vi } from 'vitest';

import {
  ERROR_REPORT_LIMIT,
  ERROR_REPORT_WINDOW_MS,
  installGlobalErrorReporting,
} from './error-reporting';

import type { ErrorReport } from './error-reporting';

interface FakeTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  dispatch(type: string, event: unknown): void;
  listeners: Map<string, Set<(event: unknown) => void>>;
}

function fakeTarget(): FakeTarget {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    listeners,
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
}

function errorEvent(error: unknown, message = 'boom'): Record<string, unknown> {
  return { error, message, filename: 'http://localhost/app.js', lineno: 10, colno: 4 };
}

function rejectionEvent(reason: unknown): Record<string, unknown> {
  return { reason };
}

function install(
  target: FakeTarget,
  write: (report: ErrorReport) => unknown,
  now: () => number = () => 1_000,
): () => void {
  return installGlobalErrorReporting({
    write,
    target: target as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>,
    now,
  });
}

describe('installGlobalErrorReporting', () => {
  it('forwards uncaught errors with the stack as detail', () => {
    const target = fakeTarget();
    const writes: ErrorReport[] = [];
    const uninstall = install(target, (report) => {
      writes.push(report);
    });

    target.dispatch('error', errorEvent(new Error('E2E boom')));

    expect(writes).toHaveLength(1);
    expect(writes[0]?.level).toBe('error');
    expect(writes[0]?.message).toContain('Uncaught error: E2E boom');
    expect(String(writes[0]?.detail)).toContain('E2E boom');
    uninstall();
  });

  it('falls back to the event message/location when no Error object is attached', () => {
    const target = fakeTarget();
    const writes: ErrorReport[] = [];
    const uninstall = install(target, (report) => {
      writes.push(report);
    });

    target.dispatch('error', {
      message: 'Script error.',
      filename: 'app.js',
      lineno: 3,
      colno: 9,
    });

    expect(writes[0]?.message).toBe('Uncaught error: Script error.');
    expect(String(writes[0]?.detail)).toContain('app.js:3:9');
    uninstall();
  });

  it('forwards unhandled promise rejections', () => {
    const target = fakeTarget();
    const writes: ErrorReport[] = [];
    const uninstall = install(target, (report) => {
      writes.push(report);
    });

    target.dispatch('unhandledrejection', rejectionEvent('plain rejection'));

    expect(writes[0]?.message).toBe('Unhandled rejection: plain rejection');
    uninstall();
  });

  it('caps reports at the limit per window and refills afterwards', () => {
    const target = fakeTarget();
    const writes: ErrorReport[] = [];
    let now = 1_000;
    const uninstall = install(
      target,
      (report) => {
        writes.push(report);
      },
      () => now,
    );

    for (let index = 0; index < ERROR_REPORT_LIMIT + 4; index += 1) {
      target.dispatch('error', errorEvent(new Error(`error-${String(index)}`)));
    }
    expect(writes).toHaveLength(ERROR_REPORT_LIMIT);

    now += ERROR_REPORT_WINDOW_MS + 1;
    target.dispatch('error', errorEvent(new Error('after window')));
    expect(writes).toHaveLength(ERROR_REPORT_LIMIT + 1);
    expect(writes.at(-1)?.message).toContain('after window');
    uninstall();
  });

  it('removes both listeners when uninstalled', () => {
    const target = fakeTarget();
    const uninstall = install(target, () => undefined);
    expect(target.listeners.get('error')?.size).toBe(1);
    expect(target.listeners.get('unhandledrejection')?.size).toBe(1);

    uninstall();
    expect(target.listeners.get('error')?.size).toBe(0);
    expect(target.listeners.get('unhandledrejection')?.size).toBe(0);
  });

  it('survives a missing or throwing bridge', () => {
    const target = fakeTarget();
    const uninstall = install(target, () => {
      throw new Error('bridge down');
    });
    expect(() => {
      target.dispatch('error', errorEvent(new Error('still alive')));
    }).not.toThrow();
    uninstall();

    const rejecting = fakeTarget();
    const uninstallRejecting = install(rejecting, () => Promise.reject(new Error('async down')));
    expect(() => {
      rejecting.dispatch('unhandledrejection', rejectionEvent(new Error('still alive')));
    }).not.toThrow();
    uninstallRejecting();
  });

  it('does nothing when no target is available', () => {
    const write = vi.fn();
    const uninstall = installGlobalErrorReporting({ write, target: undefined });
    expect(write).not.toHaveBeenCalled();
    uninstall();
  });
});
