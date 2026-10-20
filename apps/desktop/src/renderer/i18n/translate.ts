import { enUS } from './messages/en-US';
import { zhCN } from './messages/zh-CN';

import type { MessageKey } from './messages/zh-CN';

/**
 * Minimal typed i18n (ADR-013): flat message tables plus a `t(key, params)`
 * function. No runtime library, no namespaces, no pluralisation — v1 has two
 * locales and the shell copy does not need them.
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

export function createTranslator(locale: Locale): Translate {
  return (key, params) => {
    const template = MESSAGE_TABLES[locale][key] ?? MESSAGE_TABLES[DEFAULT_LOCALE][key];
    return formatMessage(template, params);
  };
}
