// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createKeymap, findShortcutConflicts, isEditableTarget } from './keymap';

import type { CommandContext } from './command-context';
import type { CommandAvailability, KeymapCommand, KeymapEvent } from './keymap';

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

function event(overrides: Partial<KeymapEvent> = {}): KeymapEvent {
  return {
    key: 'k',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    target: null,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

function command(overrides: Partial<KeymapCommand> = {}): KeymapCommand {
  return {
    id: 'test.command',
    shortcuts: ['Ctrl/Cmd+K'],
    scopes: ['global'],
    isEnabled: (): CommandAvailability => ({ enabled: true }),
    run: vi.fn(),
    ...overrides,
  };
}

describe('findShortcutConflicts', () => {
  it('flags a global shortcut that overlaps any scope', () => {
    const conflicts = findShortcutConflicts([
      command({ id: 'a', scopes: ['global'] }),
      command({ id: 'b', scopes: ['grid'] }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.firstId).toBe('a');
    expect(conflicts[0]?.secondId).toBe('b');
    expect(conflicts[0]?.shortcut).toBe('Ctrl/Cmd+K');
  });

  it('flags workspace commands against grid and chart commands', () => {
    expect(
      findShortcutConflicts([
        command({ id: 'a', scopes: ['workspace'] }),
        command({ id: 'b', scopes: ['grid'], shortcuts: ['Ctrl/Cmd+K'] }),
      ]),
    ).toHaveLength(1);
    expect(
      findShortcutConflicts([
        command({ id: 'a', scopes: ['workspace'] }),
        command({ id: 'b', scopes: ['chart'], shortcuts: ['Ctrl/Cmd+K'] }),
      ]),
    ).toHaveLength(1);
  });

  it('allows the same shortcut in the disjoint grid and chart scopes', () => {
    expect(
      findShortcutConflicts([
        command({ id: 'a', scopes: ['grid'] }),
        command({ id: 'b', scopes: ['chart'] }),
      ]),
    ).toEqual([]);
  });

  it('ignores duplicate shortcuts inside the same command', () => {
    expect(
      findShortcutConflicts([command({ id: 'a', shortcuts: ['Ctrl/Cmd+K', 'Ctrl/Cmd+K'] })]),
    ).toEqual([]);
  });

  it('throws a KeymapConflictError from createKeymap', () => {
    expect(() => createKeymap([command({ id: 'a' }), command({ id: 'b' })])).toThrow(
      /Ctrl\/Cmd\+K/,
    );
  });
});

describe('createKeymap.handleKeyDown', () => {
  it('runs the matching command and prevents the browser default', () => {
    const run = vi.fn();
    const keymap = createKeymap([command({ run })]);
    const keyboardEvent = event();

    const result = keymap.handleKeyDown(keyboardEvent, context());

    expect(result).toEqual({ status: 'handled', commandId: 'test.command' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(keyboardEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('matches plain function keys', () => {
    const run = vi.fn();
    const keymap = createKeymap([command({ shortcuts: ['F1'], run })]);

    expect(keymap.handleKeyDown(event({ key: 'F1', ctrlKey: false }), context())).toEqual({
      status: 'handled',
      commandId: 'test.command',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('ignores editable targets so Ctrl/Cmd+C/V keeps native semantics', () => {
    const run = vi.fn();
    const keymap = createKeymap([command({ run })]);

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const innerButton = document.createElement('button');
    dialog.append(innerButton);

    for (const target of [input, textarea, select, editable, innerButton]) {
      expect(isEditableTarget(target)).toBe(true);
      expect(keymap.handleKeyDown(event({ target }), context())).toEqual({ status: 'ignored' });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('does not treat ordinary grid buttons as editable', () => {
    const button = document.createElement('button');
    expect(isEditableTarget(button)).toBe(false);
  });

  it('ignores events already consumed, repeated keys and IME composition', () => {
    const run = vi.fn();
    const keymap = createKeymap([command({ run })]);

    expect(keymap.handleKeyDown(event({ defaultPrevented: true }), context())).toEqual({
      status: 'ignored',
    });
    expect(keymap.handleKeyDown(event({ repeat: true }), context())).toEqual({ status: 'ignored' });
    expect(keymap.handleKeyDown(event({ isComposing: true }), context())).toEqual({
      status: 'ignored',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('respects scopes: a grid command is ignored on a chart view', () => {
    const run = vi.fn();
    const keymap = createKeymap([command({ scopes: ['grid'], run })]);

    expect(keymap.handleKeyDown(event(), context({ activeViewKind: 'chart' }))).toEqual({
      status: 'ignored',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('returns the disabled reason instead of running', () => {
    const run = vi.fn();
    const keymap = createKeymap([
      command({
        isEnabled: () => ({ enabled: false, reason: 'no-history' }),
        run,
      }),
    ]);
    const keyboardEvent = event();

    expect(keymap.handleKeyDown(keyboardEvent, context())).toEqual({
      status: 'disabled',
      commandId: 'test.command',
      reason: 'no-history',
    });
    expect(run).not.toHaveBeenCalled();
    expect(keyboardEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('returns ignored when no shortcut matches', () => {
    const keymap = createKeymap([command()]);

    expect(keymap.handleKeyDown(event({ key: 'j', shiftKey: true }), context())).toEqual({
      status: 'ignored',
    });
    expect(keymap.handleKeyDown(event({ key: 'j' }), context())).toEqual({ status: 'ignored' });
  });

  it('accepts Chromium/Electron metaKey for Cmd on macOS', () => {
    const run = vi.fn();
    const keymap = createKeymap([command({ run })]);

    expect(keymap.handleKeyDown(event({ metaKey: true, ctrlKey: false }), context())).toEqual({
      status: 'handled',
      commandId: 'test.command',
    });
  });
});
