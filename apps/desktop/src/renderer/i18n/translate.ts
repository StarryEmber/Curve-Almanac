import { enUS } from './messages/en-US';
import { zhCN } from './messages/zh-CN';

import type { MessageKey } from './messages/zh-CN';

/**
 * Minimal typed i18n (ADR-013): flat message tables plus a `t(key, params)`
 * function. No runtime library, no namespaces, no pluralisation — v1 has two
 * locales and the shell copy does not need them.
 *
 * T5.5 (ADR-050): in Vite dev builds a missing key throws instead of silently
 * falling back to zh-CN, so the type checker and the runtime agree. Production
 * keeps the zh-CN fallback (a shipped package must not crash on stale copy).
 */

export type Locale = 'zh-CN' | 'en-US';

/** SPEC §16.4: Chinese is the default locale in v1. */
export const DEFAULT_LOCALE: Locale = 'zh-CN';

export const LOCALES: readonly Locale[] = ['zh-CN', 'en-US'];

export const LOCALE_STORAGE_KEY = 'curve-studio.locale';

export const MESSAGE_TABLES: Record<Locale, Record<MessageKey, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export type { MessageKey };

export type MessageParams = Record<string, string | number>;

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/** `import.meta.env.DEV` outside Vite (Node unit tests pass `strict` directly). */
function isDevBuild(): boolean {
  try {
    return Boolean(import.meta.env.DEV);
  } catch {
    return false;
  }
}

export function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en-US';
}

/** Replaces `{name}` placeholders; unknown placeholders are left visible. */
export function formatMessage(template: string, params?: MessageParams): string {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match: string, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export interface TranslateKeyOptions {
  /** Message tables; tests inject a deliberately incomplete pair. */
  tables?: Record<Locale, Record<string, string>>;
  /** Throw on a missing key; defaults to `import.meta.env.DEV`. */
  strict?: boolean;
}

/**
 * The single lookup used by `createTranslator`. Extracted (and exported) so the
 * missing-key behaviour is unit-testable without mutating the shipped tables.
 */
export function translateKey(
  locale: Locale,
  key: MessageKey,
  params?: MessageParams,
  options: TranslateKeyOptions = {},
): string {
  const tables = options.tables ?? MESSAGE_TABLES;
  const template = tables[locale][key];
  if (template !== undefined) {
    return formatMessage(template, params);
  }

  if (options.strict ?? isDevBuild()) {
    throw new Error(`Missing message "${key}" for locale "${locale}".`);
  }
  const fallback = tables[DEFAULT_LOCALE][key];
  return fallback === undefined ? key : formatMessage(fallback, params);
}

export function createTranslator(locale: Locale): Translate {
  return (key, params) => translateKey(locale, key, params);
}
