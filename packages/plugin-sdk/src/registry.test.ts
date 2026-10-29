import { describe, expect, it } from 'vitest';

import { createAppError, isAppError } from '@curve/domain';
import type { AppError, ErrorCode } from '@curve/domain';

import { createRegistry, createRegistryState } from './registry';

import type { ContributionSource, Registry } from './types';

const BUILTIN: ContributionSource = { kind: 'builtin' };

function pluginSource(pluginId: string): ContributionSource {
  return { kind: 'plugin', pluginId };
}

function expectCode(run: () => unknown, code: ErrorCode): void {
  try {
    run();
  } catch (thrown) {
    expect(isAppError(thrown)).toBe(true);
    expect((thrown as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code} to be thrown`);
}

interface Item {
  readonly value: number;
}

function setup(validate?: (id: string, def: Item) => void): {
  builtin: Registry<Item>;
  plugin: (id: string) => Registry<Item>;
} {
  const state = createRegistryState<Item>(validate === undefined ? {} : { validate });
  return {
    builtin: createRegistry(state, BUILTIN),
    plugin: (id: string): Registry<Item> => createRegistry(state, pluginSource(id)),
  };
}

describe('contribution registry (T6.1, ADR-052)', () => {
  it('registers, reads back and lists entries with their source', () => {
    const { plugin } = setup();
    const a = plugin('com.example.a');

    const remove = a.register('rating', { value: 1 });

    expect(a.get('rating')).toEqual({ value: 1 });
    expect(a.list()).toEqual([
      { id: 'rating', def: { value: 1 }, source: { kind: 'plugin', pluginId: 'com.example.a' } },
    ]);

    remove();
    expect(a.get('rating')).toBeUndefined();
    expect(a.list()).toEqual([]);
  });

  it('rejects a duplicate id, including the caller’s own', () => {
    const { builtin, plugin } = setup();
    builtin.register('number', { value: 0 });
    plugin('com.example.a').register('rating', { value: 1 });

    expectCode(() => builtin.register('number', { value: 2 }), 'E_PLUGIN_INVALID');
    expectCode(() => plugin('com.example.a').register('rating', { value: 2 }), 'E_PLUGIN_INVALID');
  });

  it('replaces only the caller’s own contribution', () => {
    const { builtin, plugin } = setup();
    const a = plugin('com.example.a');
    const b = plugin('com.example.b');
    builtin.register('number', { value: 0 });
    a.register('rating', { value: 1 });
    b.register('other', { value: 2 });

    a.replace('rating', { value: 10 });
    expect(a.get('rating')).toEqual({ value: 10 });

    expectCode(() => a.replace('number', { value: 10 }), 'E_PLUGIN_INVALID');
    expectCode(() => a.replace('other', { value: 10 }), 'E_PLUGIN_INVALID');
    expectCode(() => a.replace('missing', { value: 10 }), 'E_PLUGIN_INVALID');
    expect(builtin.get('number')).toEqual({ value: 0 });
    expect(b.get('other')).toEqual({ value: 2 });
  });

  it('lets the host replace its own builtin contribution', () => {
    const { builtin } = setup();
    builtin.register('number', { value: 0 });

    builtin.replace('number', { value: 1 });

    expect(builtin.get('number')).toEqual({ value: 1 });
  });

  it('keeps builtins first and registration order stable across replace', () => {
    const { builtin, plugin } = setup();
    const a = plugin('com.example.a');
    a.register('first', { value: 1 });
    builtin.register('builtin', { value: 0 });
    a.register('second', { value: 2 });

    expect(a.list().map((entry) => entry.id)).toEqual(['builtin', 'first', 'second']);

    a.replace('first', { value: 10 });
    expect(a.list().map((entry) => entry.id)).toEqual(['builtin', 'first', 'second']);
  });

  it('notifies subscribers with a snapshot and stops after unsubscribe', () => {
    const { plugin } = setup();
    const a = plugin('com.example.a');
    const snapshots: string[][] = [];

    const unsubscribe = a.subscribe((entries) => {
      snapshots.push(entries.map((entry) => entry.id));
    });
    a.register('one', { value: 1 });
    a.replace('one', { value: 2 });
    a.register('two', { value: 3 });

    expect(snapshots).toEqual([['one'], ['one'], ['one', 'two']]);

    unsubscribe();
    unsubscribe();
    a.register('three', { value: 4 });
    expect(snapshots).toHaveLength(3);
  });

  it('isolates a throwing subscriber', () => {
    const { plugin } = setup();
    const a = plugin('com.example.a');
    const calls: string[] = [];

    a.subscribe(() => {
      calls.push('bad');
      throw new Error('subscriber boom');
    });
    a.subscribe(() => {
      calls.push('good');
    });

    a.register('one', { value: 1 });

    expect(calls).toEqual(['bad', 'good']);
    expect(a.get('one')).toEqual({ value: 1 });
  });

  it('validates ids and calls the optional validator on register and replace', () => {
    const { plugin } = setup((_id, def) => {
      if (def.value < 0) {
        throw createAppError('E_PLUGIN_INVALID', 'negative values are not allowed');
      }
    });
    const a = plugin('com.example.a');

    expectCode(() => a.register('', { value: 1 }), 'E_PLUGIN_INVALID');
    expectCode(() => a.register('bad', { value: -1 }), 'E_PLUGIN_INVALID');
    expect(a.get('bad')).toBeUndefined();

    a.register('good', { value: 1 });
    expectCode(() => a.replace('good', { value: -1 }), 'E_PLUGIN_INVALID');
    expect(a.get('good')).toEqual({ value: 1 });
  });

  it('disposes the whole registry from the host view', () => {
    const { builtin, plugin } = setup();
    builtin.register('builtin', { value: 0 });
    const a = plugin('com.example.a');
    a.register('rating', { value: 1 });

    builtin.dispose();

    expect(builtin.list()).toEqual([]);
    expect(a.list()).toEqual([]);
    expectCode(() => builtin.register('later', { value: 2 }), 'E_PLUGIN_INVALID');
    expectCode(() => a.register('later', { value: 2 }), 'E_PLUGIN_INVALID');
  });

  it('removes only the plugin’s own contributions when the plugin view disposes', () => {
    const { builtin, plugin } = setup();
    builtin.register('builtin', { value: 0 });
    const a = plugin('com.example.a');
    a.register('rating', { value: 1 });

    a.dispose();

    expect(a.list().map((entry) => entry.id)).toEqual(['builtin']);
    expect(builtin.get('builtin')).toEqual({ value: 0 });
    builtin.register('later', { value: 2 });
    expect(builtin.get('later')).toEqual({ value: 2 });
  });
});
