import { describe, expect, it } from 'vitest';

import {
  MAX_RECENT_COMMANDS,
  RECENT_COMMANDS_STORAGE_KEY,
  parseRecentCommandIds,
  readRecentCommandIds,
  updateRecentCommandIds,
  writeRecentCommandIds,
} from './recent-commands';

describe('parseRecentCommandIds', () => {
  it('returns an empty list for missing, malformed or non-array values', () => {
    expect(parseRecentCommandIds(null)).toEqual([]);
    expect(parseRecentCommandIds('not json')).toEqual([]);
    expect(parseRecentCommandIds('{"id":"history.undo"}')).toEqual([]);
    expect(parseRecentCommandIds('null')).toEqual([]);
  });

  it('keeps only non-empty strings, deduplicates and caps the list', () => {
    const raw = JSON.stringify([
      'history.undo',
      'history.undo',
      '',
      'layout.splitHorizontal',
      42,
      'app.save',
      'history.redo',
      'view.close',
      'app.help',
      'theme.dark',
      'chart.duplicate',
    ]);

    const parsed = parseRecentCommandIds(raw);
    expect(parsed).toEqual([
      'history.undo',
      'layout.splitHorizontal',
      'app.save',
      'history.redo',
      'view.close',
      'app.help',
      'theme.dark',
      'chart.duplicate',
    ]);
    expect(parsed).toHaveLength(MAX_RECENT_COMMANDS);
  });
});

describe('updateRecentCommandIds', () => {
  it('moves an executed command to the front without duplicates', () => {
    expect(updateRecentCommandIds(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(updateRecentCommandIds(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('caps the list and keeps the most recent entries', () => {
    const current = Array.from({ length: MAX_RECENT_COMMANDS }, (_, index) => `c${String(index)}`);
    const next = updateRecentCommandIds(current, 'new');

    expect(next).toHaveLength(MAX_RECENT_COMMANDS);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`c${String(MAX_RECENT_COMMANDS - 1)}`);
  });
});

describe('recent command storage', () => {
  function memoryStorage(initial?: string): {
    value: string | null;
    getItem(key: string): string | null;
    setItem(key: string, next: string): void;
  } {
    const storage = {
      value: initial ?? null,
      getItem(key: string): string | null {
        expect(key).toBe(RECENT_COMMANDS_STORAGE_KEY);
        return storage.value;
      },
      setItem(key: string, next: string): void {
        expect(key).toBe(RECENT_COMMANDS_STORAGE_KEY);
        storage.value = next;
      },
    };
    return storage;
  }

  it('reads and writes the JSON list', () => {
    const storage = memoryStorage(JSON.stringify(['history.undo']));
    expect(readRecentCommandIds(storage)).toEqual(['history.undo']);

    writeRecentCommandIds(storage, ['app.save', 'history.undo']);
    expect(storage.value).toBe(JSON.stringify(['app.save', 'history.undo']));
  });

  it('treats unavailable or throwing storage as empty and best-effort', () => {
    expect(readRecentCommandIds(undefined)).toEqual([]);
    expect(() => {
      writeRecentCommandIds(undefined, ['app.save']);
    }).not.toThrow();

    const throwing = {
      getItem(): string | null {
        throw new Error('blocked');
      },
      setItem(): void {
        throw new Error('blocked');
      },
    };
    expect(readRecentCommandIds(throwing)).toEqual([]);
    expect(() => {
      writeRecentCommandIds(throwing, ['app.save']);
    }).not.toThrow();
  });
});
