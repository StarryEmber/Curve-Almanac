import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppError } from '@curve/domain';

import {
  PLUGIN_ERROR_DEDUPE_MS,
  clearPluginErrorDedupe,
  reportPluginError,
  subscribePluginErrors,
} from './errors';
import { clearPluginLog, listPluginLog } from './log';

import type { PluginErrorEvent } from './errors';

let events: PluginErrorEvent[] = [];
let unsubscribe: (() => void) | null = null;

beforeEach(() => {
  events = [];
  clearPluginErrorDedupe();
  clearPluginLog();
  unsubscribe = subscribePluginErrors((event) => {
    events.push(event);
  });
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
  vi.useRealTimers();
});

describe('plugin error bus', () => {
  it('publishes the error with its plugin attribution and logs it', () => {
    reportPluginError({
      pluginId: 'com.test.plugin',
      pluginName: 'Test plugin',
      error: createAppError('E_PLUGIN_ACTIVATE', 'boom'),
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      pluginId: 'com.test.plugin',
      pluginName: 'Test plugin',
      error: { code: 'E_PLUGIN_ACTIVATE', message: 'boom' },
    });
    expect(events[0]?.timestamp).toBeGreaterThan(0);
    expect(listPluginLog().map((entry) => entry.message)).toEqual([
      'Test plugin: E_PLUGIN_ACTIVATE boom',
    ]);
  });

  it('marks host-owned contributions with a null plugin id', () => {
    reportPluginError({ pluginId: null, pluginName: '', error: new Error('host failed') });

    expect(events).toHaveLength(1);
    expect(events[0]?.pluginId).toBeNull();
    expect(events[0]?.pluginName).toBe('');
    expect(events[0]?.error.code).toBe('E_UNKNOWN');
  });

  it('suppresses duplicates inside the dedupe window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const report = (): void => {
      reportPluginError({
        pluginId: 'com.test.plugin',
        pluginName: 'Test plugin',
        error: createAppError('E_PLUGIN_ACTIVATE', 'same'),
      });
    };

    report();
    vi.setSystemTime(1_000 + PLUGIN_ERROR_DEDUPE_MS - 1);
    report();
    expect(events).toHaveLength(1);

    vi.setSystemTime(1_000 + PLUGIN_ERROR_DEDUPE_MS + 1);
    report();
    expect(events).toHaveLength(2);
    expect(listPluginLog()).toHaveLength(2);
  });

  it('keeps reporting different failures', () => {
    reportPluginError({
      pluginId: 'com.test.plugin',
      pluginName: 'Test plugin',
      error: createAppError('E_PLUGIN_ACTIVATE', 'one'),
    });
    reportPluginError({
      pluginId: 'com.test.plugin',
      pluginName: 'Test plugin',
      error: createAppError('E_PLUGIN_ACTIVATE', 'two'),
    });

    expect(events.map((event) => event.error.message)).toEqual(['one', 'two']);
  });

  it('isolates a throwing subscriber', () => {
    const broken = subscribePluginErrors(() => {
      throw new Error('broken listener');
    });
    expect(() => {
      reportPluginError({ pluginId: null, pluginName: '', error: new Error('x') });
    }).not.toThrow();
    expect(events).toHaveLength(1);
    broken();
  });
});
