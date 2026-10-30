// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { FieldTypeDef } from '@curve/plugin-sdk';

import { appendPluginLog, clearPluginLog } from './log';
import { usePluginLog, usePluginSnapshot } from './use-plugin-snapshot';

import { activateRendererPlugins, pluginHost } from './index';

function fakeFieldType(id: string): FieldTypeDef {
  return {
    id,
    label: 'Hook',
    storageType: 'text',
    parseText: (raw: string) => ({ ok: true, value: raw }),
    format: () => '',
    validate: () => null,
    compare: () => 0,
    defaultWidth: 100,
  };
}

beforeAll(async () => {
  await activateRendererPlugins();
});

afterEach(() => {
  cleanup();
  clearPluginLog();
});

describe('usePluginSnapshot', () => {
  it('refreshes the registry snapshot while enabled', () => {
    const { result } = renderHook(() => usePluginSnapshot(true));
    const before = result.current.fields.length;

    let dispose: (() => void) | null = null;
    act(() => {
      dispose = pluginHost.fields.register('com.test.hook.enabled', fakeFieldType('com.test.hook'));
    });
    expect(result.current.fields.length).toBe(before + 1);

    act(() => {
      dispose?.();
    });
    expect(result.current.fields.length).toBe(before);
  });

  it('does not subscribe while disabled', () => {
    const { result } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePluginSnapshot(enabled),
      {
        initialProps: { enabled: false },
      },
    );
    const before = result.current.fields.length;

    let dispose: (() => void) | null = null;
    act(() => {
      dispose = pluginHost.fields.register(
        'com.test.hook.disabled',
        fakeFieldType('com.test.hook'),
      );
    });
    expect(result.current.fields.length).toBe(before);

    act(() => {
      dispose?.();
    });
  });
});

describe('usePluginLog', () => {
  it('reflects log entries while enabled', () => {
    const { result } = renderHook(() => usePluginLog(true));

    act(() => {
      appendPluginLog('info', 'hello');
    });

    expect(result.current.at(-1)?.message).toBe('hello');
  });

  it('stays frozen while disabled', () => {
    const { result } = renderHook(({ enabled }: { enabled: boolean }) => usePluginLog(enabled), {
      initialProps: { enabled: false },
    });

    act(() => {
      appendPluginLog('info', 'hidden');
    });

    expect(result.current).toHaveLength(0);
  });
});
