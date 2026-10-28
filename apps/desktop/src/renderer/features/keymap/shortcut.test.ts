import { describe, expect, it } from 'vitest';

import {
  formatShortcut,
  isMacPlatform,
  matchesShortcut,
  parseShortcut,
  shortcutSignature,
} from './shortcut';

describe('parseShortcut', () => {
  it('normalizes Ctrl/Cmd, Shift and Alt and lowercases letters', () => {
    expect(parseShortcut('Ctrl/Cmd+K')).toEqual({
      key: 'k',
      ctrlOrMeta: true,
      shift: false,
      alt: false,
    });
    expect(parseShortcut('Ctrl/Cmd+Shift+Z')).toEqual({
      key: 'z',
      ctrlOrMeta: true,
      shift: true,
      alt: false,
    });
    expect(parseShortcut('Ctrl+Alt+H')).toEqual({
      key: 'h',
      ctrlOrMeta: true,
      shift: false,
      alt: true,
    });
  });

  it('accepts modifier order and aliases (Cmd, Meta, Option)', () => {
    expect(parseShortcut('Shift+Ctrl+Z')).toEqual(parseShortcut('Ctrl+Shift+z'));
    expect(parseShortcut('Cmd+K')).toEqual(parseShortcut('Ctrl+K'));
    expect(parseShortcut('Meta+K')).toEqual(parseShortcut('Ctrl+K'));
    expect(parseShortcut('Ctrl+Option+H')).toEqual(parseShortcut('Ctrl+Alt+H'));
  });

  it('supports function keys and Escape without modifiers', () => {
    expect(parseShortcut('F1')).toEqual({
      key: 'f1',
      ctrlOrMeta: false,
      shift: false,
      alt: false,
    });
    expect(parseShortcut('Esc')).toEqual({
      key: 'escape',
      ctrlOrMeta: false,
      shift: false,
      alt: false,
    });
  });

  it('rejects empty, modifier-only and unknown keys', () => {
    expect(parseShortcut('')).toBeNull();
    expect(parseShortcut('Ctrl+')).toBeNull();
    expect(parseShortcut('Ctrl+Shift')).toBeNull();
    expect(parseShortcut('Ctrl+Foobar')).toBeNull();
    expect(parseShortcut('Ctrl+K+J')).toBeNull();
  });
});

describe('formatShortcut', () => {
  it('renders Ctrl on Windows/Linux and Cmd on macOS', () => {
    expect(formatShortcut('Ctrl/Cmd+K', 'Win32')).toBe('Ctrl+K');
    expect(formatShortcut('Ctrl/Cmd+K', 'MacIntel')).toBe('Cmd+K');
    expect(formatShortcut('Ctrl/Cmd+Alt+H', 'Win32')).toBe('Ctrl+Alt+H');
    expect(formatShortcut('Ctrl/Cmd+Shift+Z', 'Win32')).toBe('Ctrl+Shift+Z');
    expect(formatShortcut('F1', 'Win32')).toBe('F1');
  });

  it('falls back to the raw string for an invalid shortcut', () => {
    expect(formatShortcut('Ctrl+Foobar', 'Win32')).toBe('Ctrl+Foobar');
  });

  it('detects macOS platforms case-insensitively', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('iPhone')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
    expect(isMacPlatform('Linux x86_64')).toBe(false);
  });
});

describe('matchesShortcut', () => {
  it('requires the exact modifier set', () => {
    const shortcut = parseShortcut('Ctrl/Cmd+Shift+Z');
    expect(shortcut).not.toBeNull();
    if (shortcut === null) {
      return;
    }

    expect(
      matchesShortcut(
        { key: 'Z', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
        shortcut,
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { key: 'z', ctrlKey: false, metaKey: true, shiftKey: true, altKey: false },
        shortcut,
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        shortcut,
      ),
    ).toBe(false);
    expect(
      matchesShortcut(
        { key: 'y', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
        shortcut,
      ),
    ).toBe(false);
  });

  it('does not treat an extra Alt as the same shortcut', () => {
    const shortcut = parseShortcut('Ctrl+K');
    expect(shortcut).not.toBeNull();
    if (shortcut === null) {
      return;
    }
    expect(
      matchesShortcut(
        { key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: true },
        shortcut,
      ),
    ).toBe(false);
  });
});

describe('shortcutSignature', () => {
  it('treats Ctrl and Cmd as the same signature', () => {
    expect(
      shortcutSignature(
        parseShortcut('Ctrl+K') ?? { key: '', ctrlOrMeta: false, shift: false, alt: false },
      ),
    ).toBe(
      shortcutSignature(
        parseShortcut('Cmd+K') ?? { key: '', ctrlOrMeta: false, shift: false, alt: false },
      ),
    );
  });
});
