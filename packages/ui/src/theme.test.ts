// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THEME_MODE,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  applyTheme,
  getSystemDarkQuery,
  isThemeMode,
  prefersDark,
  readStoredTheme,
  resolveTheme,
} from './theme';

describe('theme helpers', () => {
  it('resolves explicit modes without consulting the system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system preference in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('validates persisted values', () => {
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('sepia')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it('reads a stored mode and falls back to the default', () => {
    expect(readStoredTheme({ getItem: (key) => (key === THEME_STORAGE_KEY ? 'dark' : null) })).toBe(
      'dark',
    );
    expect(readStoredTheme({ getItem: () => 'sepia' })).toBe(DEFAULT_THEME_MODE);
    expect(readStoredTheme({ getItem: () => null })).toBe('system');
  });

  it('applies the attribute and the native color scheme', () => {
    const root = document.createElement('div');

    applyTheme(root, 'dark');

    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
    expect(root.style.getPropertyValue('color-scheme')).toBe('dark');
  });

  it('treats a missing media query as light', () => {
    expect(prefersDark(null)).toBe(false);
    expect(prefersDark({ matches: true })).toBe(true);
    // jsdom has no matchMedia, so the query helper must fail soft.
    expect(getSystemDarkQuery()).toBeNull();
  });
});
