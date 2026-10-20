/**
 * Theme contract shared by the design tokens and the renderer's theme provider.
 *
 * `tokens.css` keys off `[data-theme='dark']`; `applyTheme` is the only writer
 * of that attribute. Everything here is pure so it can be unit-tested without a
 * DOM (jsdom still provides one for the attribute assertions).
 */

/** Attribute set on `<html>`; must stay in sync with `tokens.css`. */
export const THEME_ATTRIBUTE = 'data-theme';

/** `localStorage` key; a remembered choice survives restarts. */
export const THEME_STORAGE_KEY = 'curve-studio.theme';

/** User choice: follow the OS, or force one look. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** What the tokens actually show. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

export const DEFAULT_THEME_MODE: ThemeMode = 'system';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return mode;
}

/** Minimal storage port so tests (and future settings stores) can inject one. */
export interface ThemeStorage {
  getItem(key: string): string | null;
}

export function readStoredTheme(storage: ThemeStorage): ThemeMode {
  const stored = storage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : DEFAULT_THEME_MODE;
}

/** Minimal `matchMedia` surface; jsdom does not implement the real thing. */
export interface MediaQueryLike {
  matches: boolean;
  addEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
  removeEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
}

export function prefersDark(query: MediaQueryLike | null | undefined): boolean {
  return query?.matches ?? false;
}

export function getSystemDarkQuery(): MediaQueryLike | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia('(prefers-color-scheme: dark)');
}

/**
 * Applies a resolved theme to a root element. `color-scheme` is set as well so
 * native controls (scrollbars, selects) follow the tokens.
 */
export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  root.setAttribute(THEME_ATTRIBUTE, theme);
  root.style.setProperty('color-scheme', theme);
}
