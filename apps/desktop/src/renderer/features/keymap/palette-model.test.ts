import { describe, expect, it } from 'vitest';

import { buildPaletteItems } from './palette-model';

import type { CommandContext } from './command-context';
import type { AppCommand } from './commands';

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    workspaceOpen: true,
    activeViewId: 'viw_1',
    activeViewKind: 'table',
    activeViewRefId: 'tbl_1',
    canUndo: true,
    canRedo: false,
    paneCount: 1,
    focusedPaneViewCount: 0,
    sidebarOpen: true,
    inspectorOpen: true,
    themeMode: 'light',
    ...overrides,
  };
}

function command(overrides: Partial<AppCommand> = {}): AppCommand {
  return {
    id: 'test.command',
    labelKey: 'command.app.help',
    shortcuts: ['Ctrl/Cmd+K'],
    scopes: ['global'],
    visibleInPalette: true,
    isEnabled: () => ({ enabled: true }),
    run: () => undefined,
    ...overrides,
  };
}

describe('buildPaletteItems', () => {
  it('lists only visible commands and keeps labels, bindings and enabled state', () => {
    const items = buildPaletteItems(
      [
        command({ id: 'a' }),
        command({ id: 'hidden', visibleInPalette: false }),
        command({
          id: 'b',
          shortcuts: [],
          isEnabled: () => ({ enabled: false, reason: 'no-workspace' }),
        }),
      ],
      context(),
      [],
    );

    expect(items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(items[0]).toEqual({
      id: 'a',
      labelKey: 'command.app.help',
      shortcuts: ['Ctrl/Cmd+K'],
      reason: null,
      recentRank: null,
      fromPlugin: false,
    });
    expect(items[1]?.reason).toBe('no-workspace');
  });

  it('appends plugin commands with a source badge and never shadows builtins (T6.3)', () => {
    const items = buildPaletteItems(
      [command({ id: 'a' }), command({ id: 'app.plugins' })],
      context(),
      ['plugin.com.test.run'],
      [
        { id: 'plugin.com.test.run', label: 'Run report', sourceLabel: 'plugin: Sample' },
        { id: 'a', label: 'Shadow', sourceLabel: 'plugin: Evil' },
      ],
    );

    expect(items.map((item) => item.id)).toEqual(['a', 'app.plugins', 'plugin.com.test.run']);
    const pluginItem = items.find((item) => item.id === 'plugin.com.test.run');
    expect(pluginItem).toEqual({
      id: 'plugin.com.test.run',
      label: 'Run report',
      sourceLabel: 'plugin: Sample',
      shortcuts: [],
      reason: null,
      recentRank: 0,
      fromPlugin: true,
    });
    // A plugin contribution cannot replace a builtin palette entry.
    expect(items.find((item) => item.id === 'a')?.label).toBeUndefined();
  });

  it('assigns recent ranks from the stored id order', () => {
    const items = buildPaletteItems(
      [command({ id: 'a' }), command({ id: 'b' }), command({ id: 'c' })],
      context(),
      ['c', 'a'],
    );

    expect(items.find((item) => item.id === 'c')?.recentRank).toBe(0);
    expect(items.find((item) => item.id === 'a')?.recentRank).toBe(1);
    expect(items.find((item) => item.id === 'b')?.recentRank).toBeNull();
  });
});
