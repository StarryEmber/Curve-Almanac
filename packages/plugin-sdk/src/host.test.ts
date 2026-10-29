import { describe, expect, it } from 'vitest';

import { isAppError } from '@curve/domain';
import type { AppError, ErrorCode } from '@curve/domain';

import { createPluginHost, isCompatibleApiVersion, PLUGIN_API_VERSION } from './host';

import type {
  ChartKindDef,
  CommandDef,
  FieldTypeDef,
  ImporterDef,
  PluginDefinition,
  PluginLogger,
} from './types';

interface LogEntry {
  readonly level: 'info' | 'warn' | 'error';
  readonly message: string;
}

function captureLogger(): { logger: PluginLogger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const push =
    (level: LogEntry['level']) =>
    (message: string): void => {
      entries.push({ level, message });
    };
  return { logger: { info: push('info'), warn: push('warn'), error: push('error') }, entries };
}

function fieldType(id: string, overrides: Partial<FieldTypeDef> = {}): FieldTypeDef {
  return {
    id,
    label: id,
    storageType: 'number',
    parseText: (raw) => ({ ok: true, value: Number(raw) }),
    format: (value) => String(value),
    validate: () => null,
    compare: (a, b) => Number(a) - Number(b),
    defaultWidth: 80,
    ...overrides,
  };
}

function importer(id: string): ImporterDef {
  return {
    id,
    label: id,
    extensions: ['.json'],
    parse: async () => ({ headers: ['x'], rows: [[1]] }),
  };
}

function chartKind(id: string): ChartKindDef {
  return { id, label: id, seriesType: 'line' };
}

function command(id: string): CommandDef {
  return { id, label: id, run: async () => undefined };
}

function makePlugin(
  id: string,
  overrides: Partial<Omit<PluginDefinition, 'id'>> = {},
): PluginDefinition {
  return {
    id,
    name: id,
    version: '1.0.0',
    apiVersion: '1.0',
    activate: () => undefined,
    ...overrides,
  };
}

async function expectRejectsCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  try {
    await promise;
  } catch (thrown) {
    expect(isAppError(thrown)).toBe(true);
    expect((thrown as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code} to be thrown`);
}

describe('plugin host (T6.1, ADR-052)', () => {
  it('activates plugins in definition order and records contribution sources', async () => {
    const { logger } = captureLogger();
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.a', {
          activate: (ctx) => {
            ctx.fields.register('rating', fieldType('rating'));
            ctx.commands.register('plugin.com.example.a.run', command('plugin.com.example.a.run'));
          },
        }),
        makePlugin('com.example.b', {
          activate: (ctx) => {
            ctx.importers.register('points', importer('points'));
            ctx.chartKinds.register('bubble', chartKind('bubble'));
          },
        }),
      ],
    });

    await host.activateAll();

    expect(host.getPlugins().map((plugin) => [plugin.id, plugin.status])).toEqual([
      ['com.example.a', 'active'],
      ['com.example.b', 'active'],
    ]);
    expect(host.fields.get('rating')?.label).toBe('rating');
    expect(host.fields.list()[0]?.source).toEqual({
      kind: 'plugin',
      pluginId: 'com.example.a',
    });
    expect(host.importers.get('points')?.extensions).toEqual(['.json']);
    expect(host.chartKinds.get('bubble')?.seriesType).toBe('line');
    expect(host.commands.get('plugin.com.example.a.run')?.label).toBe('plugin.com.example.a.run');
  });

  it('gives every plugin a context with the host API version and a prefixed logger', async () => {
    const { logger, entries } = captureLogger();
    let seenApiVersion: string | null = null;
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.a', {
          activate: (ctx) => {
            seenApiVersion = ctx.apiVersion;
            ctx.log.info('hello', { n: 1 });
          },
        }),
      ],
    });

    await host.activateAll();

    expect(PLUGIN_API_VERSION).toBe('1.0');
    expect(seenApiVersion).toBe('1.0');
    expect(entries).toContainEqual({ level: 'info', message: '[plugin:com.example.a] hello' });
  });

  it('disables a duplicate plugin id without stopping the first one', async () => {
    const { logger } = captureLogger();
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.dup', {
          activate: (ctx) => {
            ctx.fields.register('first', fieldType('first'));
          },
        }),
        makePlugin('com.example.dup', {
          activate: (ctx) => {
            ctx.fields.register('second', fieldType('second'));
          },
        }),
      ],
    });

    await host.activateAll();

    expect(host.getPlugins().map((plugin) => plugin.status)).toEqual(['active', 'disabled']);
    expect(host.fields.list().map((entry) => entry.id)).toEqual(['first']);
    expect(host.getDisabled()).toHaveLength(1);
    expect(host.getDisabled()[0]?.error?.code).toBe('E_PLUGIN_INVALID');
  });

  it('disables an incompatible apiVersion without calling activate', async () => {
    const { logger, entries } = captureLogger();
    let activated = false;
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.future', {
          apiVersion: '2.0',
          activate: () => {
            activated = true;
          },
        }),
      ],
    });

    await host.activateAll();

    expect(activated).toBe(false);
    expect(host.getPlugins()[0]?.status).toBe('disabled');
    expect(host.getDisabled()[0]?.error?.code).toBe('E_PLUGIN_INCOMPATIBLE');
    expect(entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('rolls back a failed activation and keeps watching the other plugins', async () => {
    const { logger } = captureLogger();
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.broken', {
          activate: (ctx) => {
            ctx.fields.register('partial', fieldType('partial'));
            throw new Error('boom');
          },
        }),
        makePlugin('com.example.ok', {
          activate: (ctx) => {
            ctx.fields.register('rating', fieldType('rating'));
          },
        }),
      ],
    });
    host.fields.register('number', fieldType('number'));

    await host.activateAll();

    expect(host.getPlugins().map((plugin) => [plugin.id, plugin.status])).toEqual([
      ['com.example.broken', 'disabled'],
      ['com.example.ok', 'active'],
    ]);
    expect(host.getDisabled()[0]?.error?.code).toBe('E_PLUGIN_ACTIVATE');
    expect(host.fields.get('partial')).toBeUndefined();
    expect(host.fields.get('number')).toBeDefined();
    expect(host.fields.get('rating')).toBeDefined();
  });

  it('treats an async activation rejection the same way', async () => {
    const { logger } = captureLogger();
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.async', {
          activate: async () => {
            await Promise.resolve();
            throw new Error('rejected');
          },
        }),
      ],
    });

    await host.activateAll();

    expect(host.getPlugins()[0]?.status).toBe('disabled');
    expect(host.getDisabled()[0]?.error?.code).toBe('E_PLUGIN_ACTIVATE');
  });

  it('disables invalid definitions and still activates the valid ones', async () => {
    const { logger } = captureLogger();
    const invalid = {
      id: '',
      name: '',
      version: '',
      apiVersion: '',
      activate: (): void => undefined,
    } as PluginDefinition;
    const host = createPluginHost({
      logger,
      plugins: [invalid, makePlugin('com.example.ok')],
    });

    await host.activateAll();

    expect(host.getPlugins().map((plugin) => plugin.status)).toEqual(['disabled', 'active']);
    expect(host.getDisabled()[0]?.error?.code).toBe('E_PLUGIN_INVALID');
  });

  it('lets a plugin replace its own contribution during activation', async () => {
    const { logger } = captureLogger();
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.a', {
          activate: (ctx) => {
            ctx.fields.register('rating', fieldType('rating'));
            ctx.fields.replace('rating', fieldType('rating', { label: 'Rating' }));
          },
        }),
      ],
    });

    await host.activateAll();

    expect(host.getPlugins()[0]?.status).toBe('active');
    expect(host.fields.get('rating')?.label).toBe('Rating');
  });

  it('does not let a plugin replace a builtin contribution', async () => {
    const { logger } = captureLogger();
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.a', {
          activate: (ctx) => {
            ctx.fields.replace('number', fieldType('number', { label: 'hijacked' }));
          },
        }),
      ],
    });
    host.fields.register('number', fieldType('number'));

    await host.activateAll();

    expect(host.getPlugins()[0]?.status).toBe('disabled');
    expect(host.getDisabled()[0]?.error?.code).toBe('E_PLUGIN_INVALID');
    expect(host.fields.get('number')?.label).toBe('number');
  });

  it('rejects an invalid field type at registration and rolls the plugin back', async () => {
    const { logger } = captureLogger();
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.bad', {
          activate: (ctx) => {
            ctx.fields.register('bad', {
              ...fieldType('bad'),
              storageType: 'json',
            } as unknown as FieldTypeDef);
          },
        }),
      ],
    });

    await host.activateAll();

    expect(host.getPlugins()[0]?.status).toBe('disabled');
    expect(host.getDisabled()[0]?.error?.code).toBe('E_PLUGIN_INVALID');
    expect(host.fields.list()).toEqual([]);
  });

  it('deactivates a plugin, calls its hook and removes every contribution', async () => {
    const { logger } = captureLogger();
    let deactivated = false;
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.a', {
          activate: (ctx) => {
            ctx.fields.register('rating', fieldType('rating'));
            ctx.importers.register('points', importer('points'));
          },
          deactivate: () => {
            deactivated = true;
          },
        }),
      ],
    });
    host.fields.register('number', fieldType('number'));
    await host.activateAll();

    const state = await host.deactivate('com.example.a');

    expect(deactivated).toBe(true);
    expect(state.status).toBe('inactive');
    expect(host.fields.list().map((entry) => entry.id)).toEqual(['number']);
    expect(host.importers.list()).toEqual([]);
    expect(host.getDisabled()).toEqual([]);
  });

  it('still removes contributions when deactivate throws', async () => {
    const { logger, entries } = captureLogger();
    const host = createPluginHost({
      logger,
      plugins: [
        makePlugin('com.example.a', {
          activate: (ctx) => {
            ctx.fields.register('rating', fieldType('rating'));
          },
          deactivate: () => {
            throw new Error('deactivate boom');
          },
        }),
      ],
    });
    await host.activateAll();

    const state = await host.deactivate('com.example.a');

    expect(state.status).toBe('inactive');
    expect(host.fields.list()).toEqual([]);
    expect(entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  it('is a no-op when deactivating a plugin that never activated', async () => {
    const { logger } = captureLogger();
    const host = createPluginHost({ logger, plugins: [makePlugin('com.example.a')] });

    const state = await host.deactivate('com.example.a');

    expect(state.status).toBe('pending');
  });

  it('rejects unknown plugin ids and use after dispose', async () => {
    const { logger } = captureLogger();
    const host = createPluginHost({ logger, plugins: [makePlugin('com.example.a')] });

    await expectRejectsCode(host.activate('missing'), 'E_PLUGIN_INVALID');
    await expectRejectsCode(host.deactivate('missing'), 'E_PLUGIN_INVALID');

    host.fields.register('number', fieldType('number'));
    await host.activateAll();
    host.dispose();

    expect(host.fields.list()).toEqual([]);
    expect(host.getPlugins().every((plugin) => plugin.status === 'inactive')).toBe(true);
    await expectRejectsCode(host.activate('com.example.a'), 'E_PLUGIN_INVALID');
    await expectRejectsCode(host.activateAll(), 'E_PLUGIN_INVALID');
  });
});

describe('isCompatibleApiVersion (T6.1, ADR-052)', () => {
  it('compares the major version only', () => {
    expect(isCompatibleApiVersion('1')).toBe(true);
    expect(isCompatibleApiVersion('1.0')).toBe(true);
    expect(isCompatibleApiVersion('1.3.2')).toBe(true);
    expect(isCompatibleApiVersion('2.0')).toBe(false);
    expect(isCompatibleApiVersion('0.9')).toBe(false);
    expect(isCompatibleApiVersion('')).toBe(false);
    expect(isCompatibleApiVersion('v1')).toBe(false);
  });
});
