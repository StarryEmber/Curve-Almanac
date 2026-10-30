import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_PLUGIN_LOG_ENTRIES,
  appendPluginLog,
  clearPluginLog,
  createPrefixedPluginLogger,
  createRingPluginLogger,
  listPluginLog,
  subscribePluginLog,
} from './log';

afterEach(() => {
  clearPluginLog();
  vi.restoreAllMocks();
});

describe('plugin log ring', () => {
  it('keeps the newest entries and drops the oldest', () => {
    for (let index = 0; index < MAX_PLUGIN_LOG_ENTRIES + 5; index += 1) {
      appendPluginLog('info', `line ${String(index)}`);
    }

    const entries = listPluginLog();
    expect(entries).toHaveLength(MAX_PLUGIN_LOG_ENTRIES);
    expect(entries[0]?.message).toBe('line 5');
    expect(entries[entries.length - 1]?.message).toBe(`line ${String(MAX_PLUGIN_LOG_ENTRIES + 4)}`);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePluginLog(listener);
    appendPluginLog('warn', 'first');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    appendPluginLog('error', 'second');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing subscriber', () => {
    const unsubscriber = subscribePluginLog(() => {
      throw new Error('broken listener');
    });
    expect(() => {
      appendPluginLog('info', 'safe');
    }).not.toThrow();
    unsubscriber();
  });
});

describe('createRingPluginLogger', () => {
  it('writes to the ring and the injected writer, including details', () => {
    const written: string[] = [];
    const logger = createRingPluginLogger((_level, message) => {
      written.push(message);
    });

    logger.info('hello');
    logger.warn('careful', { reason: 'x' });
    logger.error('broken', new Error('boom'));

    const messages = listPluginLog().map((entry) => entry.message);
    expect(messages).toEqual(['hello', 'careful — {"reason":"x"}', 'broken — boom']);
    expect(written).toEqual(messages);
    expect(listPluginLog().map((entry) => entry.level)).toEqual(['info', 'warn', 'error']);
  });

  it('prefixes plugin contribution logs with the plugin id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = createPrefixedPluginLogger('[plugin:com.test]');

    logger.warn('oops');

    expect(listPluginLog().map((entry) => entry.message)).toEqual(['[plugin:com.test] oops']);
    expect(warn).toHaveBeenCalledWith('[plugin:com.test] oops');
  });
});
