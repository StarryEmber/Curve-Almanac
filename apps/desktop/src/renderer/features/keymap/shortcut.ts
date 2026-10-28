/**
 * Keyboard shortcut parsing and formatting for the T5.4 command registry.
 *
 * Shortcuts are declared in a platform-neutral form (`Ctrl/Cmd+K`) and
 * normalized to a modifier set where Ctrl and Cmd/Meta collapse into one
 * "primary modifier". That is what lets the same definition work on Windows,
 * Linux and macOS without duplicating the command table.
 */

export interface ParsedShortcut {
  /** Normalized key name: single characters are lowercase; named keys are lowercase words. */
  key: string;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  ctrlOrMeta: boolean;
  shift: boolean;
  alt: boolean;
}

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const MODIFIER_TOKENS = new Set([
  'ctrl',
  'control',
  'cmd',
  'command',
  'meta',
  'shift',
  'alt',
  'option',
  'ctrl/cmd',
  'cmd/ctrl',
]);

const NAMED_KEYS: Record<string, string> = {
  esc: 'escape',
  escape: 'escape',
  enter: 'enter',
  return: 'enter',
  tab: 'tab',
  space: 'space',
  spacebar: 'space',
  backspace: 'backspace',
  delete: 'delete',
  del: 'delete',
  insert: 'insert',
  home: 'home',
  end: 'end',
  pageup: 'pageup',
  pagedown: 'pagedown',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  arrowup: 'arrowup',
  arrowdown: 'arrowdown',
  arrowleft: 'arrowleft',
  arrowright: 'arrowright',
};

const NAMED_KEY_LABELS: Record<string, string> = {
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  space: 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
};

function normalizeKey(token: string): string | null {
  const lower = token.toLowerCase();
  if (lower.length === 1) {
    return /[a-z0-9]/u.test(lower) ? lower : null;
  }
  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/u.test(lower)) {
    return lower;
  }
  return NAMED_KEYS[lower] ?? null;
}

/**
 * Parses a shortcut declaration. Returns `null` for malformed or unknown
 * shortcuts so the registry can fail fast with a useful command id.
 */
export function parseShortcut(value: string): ParsedShortcut | null {
  const tokens = value
    .split('+')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }

  let key: string | null = null;
  let ctrlOrMeta = false;
  let shift = false;
  let alt = false;

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (MODIFIER_TOKENS.has(lower)) {
      if (lower === 'shift') {
        shift = true;
      } else if (lower === 'alt' || lower === 'option') {
        alt = true;
      } else {
        ctrlOrMeta = true;
      }
      continue;
    }
    if (key !== null) {
      return null;
    }
    key = normalizeKey(token);
    if (key === null) {
      return null;
    }
  }

  if (key === null) {
    return null;
  }
  return { key, ctrlOrMeta, shift, alt };
}

/** True when the host looks like macOS, using the same heuristic as Electron apps. */
export function isMacPlatform(platform?: string): boolean {
  const resolved =
    platform ??
    (typeof navigator === 'undefined' ? '' : (navigator.platform ?? navigator.userAgent ?? ''));
  return /mac|iphone|ipad|ipod/i.test(resolved);
}

function formatKey(key: string): string {
  if (key.length === 1) {
    return key.toUpperCase();
  }
  if (/^f\d{1,2}$/u.test(key)) {
    return key.toUpperCase();
  }
  return NAMED_KEY_LABELS[key] ?? key;
}

/**
 * Formats a declaration for display: `Ctrl+K` on Windows/Linux, `Cmd+K` on
 * macOS. Invalid declarations are returned untouched so a typo stays visible.
 */
export function formatShortcut(value: string, platform?: string): string {
  const shortcut = parseShortcut(value);
  if (shortcut === null) {
    return value;
  }
  const parts: string[] = [];
  if (shortcut.ctrlOrMeta) {
    parts.push(isMacPlatform(platform) ? 'Cmd' : 'Ctrl');
  }
  if (shortcut.alt) {
    parts.push(isMacPlatform(platform) ? 'Option' : 'Alt');
  }
  if (shortcut.shift) {
    parts.push('Shift');
  }
  parts.push(formatKey(shortcut.key));
  return parts.join('+');
}

/** Compares a keydown event with a parsed shortcut, requiring the exact modifier set. */
export function matchesShortcut(event: ShortcutEvent, shortcut: ParsedShortcut): boolean {
  const eventKey = normalizeKey(event.key);
  if (eventKey === null || eventKey !== shortcut.key) {
    return false;
  }
  return (
    (event.ctrlKey || event.metaKey) === shortcut.ctrlOrMeta &&
    event.shiftKey === shortcut.shift &&
    event.altKey === shortcut.alt
  );
}

/** Canonical identity used by conflict detection (`Ctrl/K` and `Cmd/K` collide). */
export function shortcutSignature(shortcut: ParsedShortcut): string {
  return [
    shortcut.ctrlOrMeta ? 'primary' : 'none',
    shortcut.shift ? 'shift' : 'none',
    shortcut.alt ? 'alt' : 'none',
    shortcut.key,
  ].join('|');
}
