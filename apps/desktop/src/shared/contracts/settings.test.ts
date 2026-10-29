import { describe, expect, it } from 'vitest';

import {
  APP_SETTINGS_VERSION,
  DEFAULT_APP_SETTINGS,
  appSettingsEqual,
  isAppSettingsLocale,
  isAppSettingsTheme,
  normalizeAppSettings,
} from './settings';

describe('application settings', () => {
  it('defaults to the SPEC locale, system theme, autosave on and the report style', () => {
    expect(APP_SETTINGS_VERSION).toBe(1);
    expect(DEFAULT_APP_SETTINGS).toEqual({
      version: 1,
      theme: 'system',
      locale: 'zh-CN',
      autosave: true,
      defaultTableStyleId: 'builtin.report-light',
    });
  });

  it('accepts both known themes and locales only', () => {
    expect(isAppSettingsTheme('dark')).toBe(true);
    expect(isAppSettingsTheme('sepia')).toBe(false);
    expect(isAppSettingsLocale('en-US')).toBe(true);
    expect(isAppSettingsLocale('fr-FR')).toBe(false);
  });

  it('normalises a complete document', () => {
    expect(
      normalizeAppSettings({
        version: 1,
        theme: 'dark',
        locale: 'en-US',
        autosave: false,
        defaultTableStyleId: 'builtin.finance',
      }),
    ).toEqual({
      version: 1,
      theme: 'dark',
      locale: 'en-US',
      autosave: false,
      defaultTableStyleId: 'builtin.finance',
    });
  });

  it('falls back field by field and ignores unknown keys', () => {
    expect(
      normalizeAppSettings({
        theme: 'sepia',
        locale: 'en-US',
        autosave: 'off',
        defaultTableStyleId: 'sty_user',
        futureField: 'ignored',
      }),
    ).toEqual({ ...DEFAULT_APP_SETTINGS, locale: 'en-US' });
  });

  it('handles a non-object document', () => {
    expect(normalizeAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings([])).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings('dark')).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('compares every field', () => {
    expect(appSettingsEqual(DEFAULT_APP_SETTINGS, { ...DEFAULT_APP_SETTINGS })).toBe(true);
    expect(appSettingsEqual(DEFAULT_APP_SETTINGS, { ...DEFAULT_APP_SETTINGS, theme: 'dark' })).toBe(
      false,
    );
  });
});
