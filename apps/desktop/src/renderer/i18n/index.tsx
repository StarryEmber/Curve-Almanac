import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, createTranslator, isLocale } from './translate';

import type { Locale, Translate } from './translate';
import type { ReactElement, ReactNode } from 'react';

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  MESSAGE_TABLES,
  createTranslator,
  formatMessage,
  isLocale,
} from './translate';
export type { Locale, MessageKey, MessageParams, Translate } from './translate';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    // Storage can be unavailable (privacy mode); the default locale still works.
    return DEFAULT_LOCALE;
  }
}

export interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
  /**
   * Controlled locale (T5.5): when supplied, the provider does not keep its own
   * state; the settings provider owns the value and persists changes.
   */
  locale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
}

export function I18nProvider({
  children,
  initialLocale,
  locale: controlledLocale,
  onLocaleChange,
}: I18nProviderProps): ReactElement {
  const [internalLocale, setInternalLocale] = useState<Locale>(
    () => initialLocale ?? readStoredLocale(),
  );
  const locale = controlledLocale ?? internalLocale;
  const t = useMemo(() => createTranslator(locale), [locale]);

  const setLocale = useCallback(
    (next: Locale): void => {
      if (controlledLocale === undefined) {
        setInternalLocale(next);
      }
      onLocaleChange?.(next);
    },
    [controlledLocale, onLocaleChange],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    // Also mirrored to `localStorage` as a cheap fallback for standalone
    // providers; `settings.json` remains the persisted source in the app.
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Persisting the choice is best-effort.
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return value;
}
