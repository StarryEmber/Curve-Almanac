import { describe, expect, it, vi } from 'vitest';

import {
  PALETTE_ONLY_COMMAND_IDS,
  createAppCommands,
  listShortcutCommands,
  type CommandHandlers,
} from './commands';
import { findShortcutConflicts } from './keymap';
import { parseShortcut } from './shortcut';

import type { CommandContext } from './command-context';

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

function handlers(): CommandHandlers {
  return {
    openPalette: vi.fn(),
    saveWorkspace: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    closeView: vi.fn(),
    splitPane: vi.fn(),
    closePane: vi.fn(),
    moveViewToNextPane: vi.fn(),
    duplicateView: vi.fn(),
    duplicateChart: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleInspector: vi.fn(),
    openHelp: vi.fn(),
    openSettings: vi.fn(),
    setTheme: vi.fn(),
  };
}

function command(id: string, fake: CommandHandlers = handlers()): ReturnType<typeof define> {
  return define(id, createAppCommands(fake));
}

function define(id: string, commands: ReturnType<typeof createAppCommands>) {
  const found = commands.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`missing command ${id}`);
  }
  return found;
}

describe('APP_COMMANDS', () => {
  it('declares unique ids and valid shortcut strings', () => {
    const commands = createAppCommands(handlers());
    expect(new Set(commands.map((entry) => entry.id)).size).toBe(commands.length);

    for (const entry of commands) {
      for (const shortcut of entry.shortcuts) {
        expect(parseShortcut(shortcut), `${entry.id} ${shortcut}`).not.toBeNull();
      }
    }
  });

  it('has no shortcut conflicts', () => {
    expect(findShortcutConflicts(createAppCommands(handlers()))).toEqual([]);
  });

  it('gives every core command a shortcut and leaves only preference commands shortcutless', () => {
    const commands = createAppCommands(handlers());
    for (const entry of commands) {
      if ((PALETTE_ONLY_COMMAND_IDS as readonly string[]).includes(entry.id)) {
        expect(entry.shortcuts).toEqual([]);
      } else {
        expect(entry.shortcuts.length, entry.id).toBeGreaterThan(0);
      }
    }
  });

  it('locks the documented shortcut table', () => {
    const shortcuts = Object.fromEntries(
      createAppCommands(handlers()).map((entry) => [entry.id, entry.shortcuts]),
    );

    expect(shortcuts).toEqual({
      'palette.open': ['Ctrl/Cmd+K'],
      'app.help': ['F1'],
      'app.settings': [],
      'app.save': ['Ctrl/Cmd+S'],
      'app.toggleSidebar': ['Ctrl/Cmd+B'],
      'app.toggleInspector': ['Ctrl/Cmd+Alt+I'],
      'history.undo': ['Ctrl/Cmd+Z'],
      'history.redo': ['Ctrl/Cmd+Shift+Z', 'Ctrl/Cmd+Y'],
      'view.close': ['Ctrl/Cmd+W'],
      'view.duplicate': ['Ctrl/Cmd+Shift+D'],
      'chart.duplicate': ['Ctrl/Cmd+Shift+D'],
      'layout.splitHorizontal': ['Ctrl/Cmd+Alt+H'],
      'layout.splitVertical': ['Ctrl/Cmd+Alt+V'],
      'layout.closePane': ['Ctrl/Cmd+Alt+W'],
      'layout.moveViewToNextPane': ['Ctrl/Cmd+Alt+M'],
      'theme.light': [],
      'theme.dark': [],
      'theme.system': [],
    });
  });

  it('hides only the palette trigger from the palette list', () => {
    const commands = createAppCommands(handlers());
    expect(commands.filter((entry) => !entry.visibleInPalette).map((entry) => entry.id)).toEqual([
      'palette.open',
    ]);
  });

  it('lists shortcut help entries with labels and every binding', () => {
    const entries = listShortcutCommands();
    expect(entries.map((entry) => entry.id)).toContain('history.redo');
    const redo = entries.find((entry) => entry.id === 'history.redo');
    expect(redo?.shortcuts).toEqual(['Ctrl/Cmd+Shift+Z', 'Ctrl/Cmd+Y']);
    expect(entries.map((entry) => entry.id)).not.toContain('theme.light');
  });
});

describe('command availability', () => {
  it('explains missing workspaces before anything else', () => {
    const empty = context({
      workspaceOpen: false,
      activeViewId: null,
      activeViewKind: null,
      activeViewRefId: null,
      canUndo: false,
      canRedo: false,
    });

    expect(command('app.save').isEnabled(empty)).toEqual({
      enabled: false,
      reason: 'no-workspace',
    });
    expect(command('history.undo').isEnabled(empty)).toEqual({
      enabled: false,
      reason: 'no-workspace',
    });
    expect(command('view.close').isEnabled(empty)).toEqual({
      enabled: false,
      reason: 'no-workspace',
    });
    expect(command('layout.splitHorizontal').isEnabled(empty)).toEqual({
      enabled: false,
      reason: 'no-workspace',
    });
    expect(command('view.duplicate').isEnabled(empty)).toEqual({
      enabled: false,
      reason: 'no-workspace',
    });
    expect(command('app.help').isEnabled(empty)).toEqual({ enabled: true });
    expect(command('palette.open').isEnabled(empty)).toEqual({ enabled: true });
  });

  it('reports view, history and pane reasons', () => {
    expect(command('history.undo').isEnabled(context({ canUndo: false }))).toEqual({
      enabled: false,
      reason: 'no-history',
    });
    expect(command('history.redo').isEnabled(context())).toEqual({
      enabled: false,
      reason: 'no-redo',
    });
    expect(command('view.close').isEnabled(context({ activeViewId: null }))).toEqual({
      enabled: false,
      reason: 'no-view',
    });
    expect(command('layout.closePane').isEnabled(context({ paneCount: 1 }))).toEqual({
      enabled: false,
      reason: 'single-pane',
    });
    expect(
      command('layout.closePane').isEnabled(context({ paneCount: 2, focusedPaneViewCount: 1 })),
    ).toEqual({ enabled: false, reason: 'pane-not-empty' });
    expect(
      command('layout.closePane').isEnabled(context({ paneCount: 2, focusedPaneViewCount: null })),
    ).toEqual({ enabled: false, reason: 'no-pane' });
    expect(command('layout.moveViewToNextPane').isEnabled(context())).toEqual({
      enabled: false,
      reason: 'no-second-pane',
    });
    expect(
      command('layout.moveViewToNextPane').isEnabled(context({ paneCount: 2, activeViewId: null })),
    ).toEqual({ enabled: false, reason: 'no-view' });
    expect(command('layout.splitHorizontal').isEnabled(context({ paneCount: 4 }))).toEqual({
      enabled: false,
      reason: 'max-panes',
    });
  });

  it('distinguishes table and chart scopes', () => {
    expect(command('view.duplicate').isEnabled(context())).toEqual({ enabled: true });
    expect(command('view.duplicate').isEnabled(context({ activeViewKind: 'chart' }))).toEqual({
      enabled: false,
      reason: 'no-table-view',
    });
    expect(command('chart.duplicate').isEnabled(context())).toEqual({
      enabled: false,
      reason: 'no-chart-view',
    });
    expect(command('chart.duplicate').isEnabled(context({ activeViewKind: 'chart' }))).toEqual({
      enabled: true,
    });
  });

  it('disables the current theme and enables the other two', () => {
    expect(command('theme.light').isEnabled(context({ themeMode: 'light' }))).toEqual({
      enabled: false,
      reason: 'theme-active',
    });
    expect(command('theme.dark').isEnabled(context({ themeMode: 'light' }))).toEqual({
      enabled: true,
    });
    expect(command('theme.system').isEnabled(context({ themeMode: 'light' }))).toEqual({
      enabled: true,
    });
  });
});

describe('command run', () => {
  it('dispatches each handler with the active ids', () => {
    const fake = handlers();
    const commands = createAppCommands(fake);
    const ctx = context({ paneCount: 2, activeViewKind: 'chart', activeViewRefId: 'cht_1' });

    for (const id of [
      'app.help',
      'app.save',
      'app.toggleSidebar',
      'app.toggleInspector',
      'history.undo',
      'history.redo',
      'view.close',
      'view.duplicate',
      'chart.duplicate',
      'layout.closePane',
      'layout.moveViewToNextPane',
      'theme.light',
      'theme.dark',
      'theme.system',
      'palette.open',
    ]) {
      const entry = commands.find((candidate) => candidate.id === id);
      expect(entry, id).toBeDefined();
      entry?.run(ctx);
    }
    commands.find((entry) => entry.id === 'layout.splitHorizontal')?.run(ctx);
    commands.find((entry) => entry.id === 'layout.splitVertical')?.run(ctx);

    expect(fake.openPalette).toHaveBeenCalledTimes(1);
    expect(fake.openHelp).toHaveBeenCalledTimes(1);
    expect(fake.saveWorkspace).toHaveBeenCalledTimes(1);
    expect(fake.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(fake.toggleInspector).toHaveBeenCalledTimes(1);
    expect(fake.undo).toHaveBeenCalledTimes(1);
    expect(fake.redo).toHaveBeenCalledTimes(1);
    expect(fake.closeView).toHaveBeenCalledWith('viw_1');
    expect(fake.duplicateView).not.toHaveBeenCalled();
    expect(fake.duplicateChart).toHaveBeenCalledWith('cht_1');
    expect(fake.splitPane).toHaveBeenCalledWith('horizontal');
    expect(fake.splitPane).toHaveBeenCalledWith('vertical');
    expect(fake.closePane).toHaveBeenCalledTimes(1);
    expect(fake.moveViewToNextPane).toHaveBeenCalledWith('viw_1');
    expect(fake.setTheme).toHaveBeenCalledWith('light');
    expect(fake.setTheme).toHaveBeenCalledWith('dark');
    expect(fake.setTheme).toHaveBeenCalledWith('system');
  });
});
