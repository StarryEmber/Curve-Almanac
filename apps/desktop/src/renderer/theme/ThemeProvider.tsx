import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';

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
  /** Controlled mode (T5.5): the settings provider owns the persisted value. */
  mode?: ThemeMode;
  onModeChange?: (mode: ThemeMode) => void;
}

/**
 * Theme skeleton for T0.4: `mode` is the user's choice (light / dark / system),
 * `resolved` is what the tokens show. The `data-theme` attribute on `<html>` is
 * the single switch `tokens.css` reacts to (TASKS T0.4 step 1).
 *
 * T5.5 made the provider controllable so `settings.json` is the only persisted
 * source; standalone use (tests, `initialMode`) keeps the local state path.
 */
export function ThemeProvider({
  children,
  initialMode,
  mode: controlledMode,
  onModeChange,
}: ThemeProviderProps): ReactElement {
  const [internalMode, setInternalMode] = useState<ThemeMode>(
    () => initialMode ?? readStoredTheme(storage),
  );
  const mode = controlledMode ?? internalMode;
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark(getSystemDarkQuery()));
  const resolved = resolveTheme(mode, systemDark);

  const setMode = useCallback(
    (next: ThemeMode): void => {
      if (controlledMode === undefined) {
        setInternalMode(next);
      }
      onModeChange?.(next);
    },
    [controlledMode, onModeChange],
  );

  // A layout effect applies the attribute before the first paint, so a stored
  // dark preference does not flash the light palette.
  useLayoutEffect(() => {
    applyTheme(document.documentElement, resolved);
  }, [resolved]);

  useLayoutEffect(() => {
    // Mirrored to `localStorage` as a fallback for standalone providers;
    // `settings.json` remains the persisted source in the app.
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

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return value;
}
