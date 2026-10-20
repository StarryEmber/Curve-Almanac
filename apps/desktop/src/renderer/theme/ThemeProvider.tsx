import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';

import {
  THEME_STORAGE_KEY,
  applyTheme,
  getSystemDarkQuery,
  prefersDark,
  readStoredTheme,
  resolveTheme,
} from '@curve/ui';
import type { ResolvedTheme, ThemeMode, ThemeStorage } from '@curve/ui';

import type { ReactElement, ReactNode } from 'react';

export interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const storage: ThemeStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
};

function rememberMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Persisting the choice is best-effort.
  }
}

export interface ThemeProviderProps {
  children: ReactNode;
  initialMode?: ThemeMode;
}

/**
 * Theme skeleton for T0.4: `mode` is the user's choice (light / dark / system),
 * `resolved` is what the tokens show. The `data-theme` attribute on `<html>` is
 * the single switch `tokens.css` reacts to (TASKS T0.4 step 1).
 */
export function ThemeProvider({ children, initialMode }: ThemeProviderProps): ReactElement {
  const [mode, setMode] = useState<ThemeMode>(() => initialMode ?? readStoredTheme(storage));
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark(getSystemDarkQuery()));
  const resolved = resolveTheme(mode, systemDark);

  // A layout effect applies the attribute before the first paint, so a stored
  // dark preference does not flash the light palette.
  useLayoutEffect(() => {
    applyTheme(document.documentElement, resolved);
  }, [resolved]);

  useLayoutEffect(() => {
    rememberMode(mode);
  }, [mode]);

  useLayoutEffect(() => {
    const query = getSystemDarkQuery();
    if (query?.addEventListener === undefined) {
      return undefined;
    }
    const listener = (event: { matches: boolean }): void => {
      setSystemDark(event.matches);
    };
    query.addEventListener('change', listener);
    return () => {
      query.removeEventListener?.('change', listener);
    };
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ mode, resolved, setMode }), [mode, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return value;
}
