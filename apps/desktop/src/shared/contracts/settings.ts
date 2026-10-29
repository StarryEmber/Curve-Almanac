/**
 * Application preferences persisted in `userData/settings.json` (T5.5, ADR-050).
 *
 * These are *application* settings, not workspace data: theme, language,
 * autosave and the default table style used to seed new workspaces. The file is
 * read once at startup and written through `app:settings:update`; an unreadable
 * or partially invalid file never blocks startup (field-level defaults apply).
 *
 * The module is shared by main and the renderer, so it must stay free of
 * Electron, Node and React imports. Preload only imports the types, which are
 * erased at build time.
 */

import { DEFAULT_TABLE_STYLE_ID, isBuiltinStyleId } from '@curve/domain';

/** Document version; future migrations bump this and add a `migrate` step. */
export const APP_SETTINGS_VERSION = 1;

/** Mirrors `@curve/ui`'s `ThemeMode` without importing the React package. */
export type AppSettingsTheme = 'light' | 'dark' | 'system';

/** Mirrors the renderer i18n `Locale` union. */
export type AppSettingsLocale = 'zh-CN' | 'en-US';

export const APP_SETTINGS_THEMES: readonly AppSettingsTheme[] = ['light', 'dark', 'system'];
export const APP_SETTINGS_LOCALES: readonly AppSettingsLocale[] = ['zh-CN', 'en-US'];

export interface AppSettings {
  version: typeof APP_SETTINGS_VERSION;
  theme: AppSettingsTheme;
  locale: AppSettingsLocale;
  /** When false, document changes stay in memory until Ctrl/Cmd+S or a prompt. */
  autosave: boolean;
  /** Builtin style for new workspaces; a workspace's own default wins after creation. */
  defaultTableStyleId: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = Object.freeze({
  version: APP_SETTINGS_VERSION,
  theme: 'system',
  locale: 'zh-CN',
  autosave: true,
  defaultTableStyleId: DEFAULT_TABLE_STYLE_ID,
});

export function isAppSettingsTheme(value: unknown): value is AppSettingsTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isAppSettingsLocale(value: unknown): value is AppSettingsLocale {
  return value === 'zh-CN' || value === 'en-US';
}

/**
 * Reads an untrusted settings document (file contents, IPC payload or a test
 * fixture) into a complete `AppSettings`.
 *
 * Missing or invalid fields fall back individually, so a future/partial file
 * cannot brick the app. Unknown keys are ignored on purpose: a newer build may
 * add fields that an older build should not reject.
 */
export function normalizeAppSettings(value: unknown): AppSettings {
  const record =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const theme = record['theme'];
  const locale = record['locale'];
  const autosave = record['autosave'];
  const defaultTableStyleId = record['defaultTableStyleId'];

  return {
    version: APP_SETTINGS_VERSION,
    theme: isAppSettingsTheme(theme) ? theme : DEFAULT_APP_SETTINGS.theme,
    locale: isAppSettingsLocale(locale) ? locale : DEFAULT_APP_SETTINGS.locale,
    autosave: typeof autosave === 'boolean' ? autosave : DEFAULT_APP_SETTINGS.autosave,
    defaultTableStyleId:
      typeof defaultTableStyleId === 'string' && isBuiltinStyleId(defaultTableStyleId)
        ? defaultTableStyleId
        : DEFAULT_APP_SETTINGS.defaultTableStyleId,
  };
}

/** True when two settings objects are field-for-field equal. */
export function appSettingsEqual(left: AppSettings, right: AppSettings): boolean {
  return (
    left.version === right.version &&
    left.theme === right.theme &&
    left.locale === right.locale &&
    left.autosave === right.autosave &&
    left.defaultTableStyleId === right.defaultTableStyleId
  );
}
