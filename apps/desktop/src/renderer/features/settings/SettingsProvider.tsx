/**
 * Application settings provider (T5.5, ADR-050).
 *
 * Theme, language, autosave and the default table style live in
 * `userData/settings.json` (not in a workspace). The provider is deliberately
 * outside `I18nProvider`/`ThemeProvider`: they are controlled by it, so a
 * settings change and a language/theme change are the same state update.
 *
 * Updates are optimistic and serialised by the main process. The provider keeps
 * the latest local value in a ref so two quick changes (theme then language)
 * never send an older full document over a newer one.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../../../shared/contracts/settings';
import { createApiClient } from '../../api-client';

import type { AppError, AppSettings, CurveApi } from '../../../shared/contracts/ipc';
import type { ReactElement, ReactNode } from 'react';

export type SettingsPatch = Partial<Omit<AppSettings, 'version'>>;

export interface SettingsContextValue {
  settings: AppSettings;
  /** True after the startup read (or immediately with `initialSettings`). */
  ready: boolean;
  /** Last persistence failure; cleared by the next successful update. */
  error: AppError | null;
  update(patch: SettingsPatch): Promise<AppError | null>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Narrow port so component tests can supply a fake without Electron. */
export type SettingsApi = Pick<CurveApi['app'], 'settings' | 'updateSettings'>;

export interface SettingsProviderProps {
  children: ReactNode;
  /** Settings read before the first render (T5.5 bootstrap in `main.tsx`). */
  initialSettings?: AppSettings;
  /** Test hook; defaults to the real `window.api` bridge. */
  api?: SettingsApi;
}

function bridgeApi(): SettingsApi {
  if (typeof window === 'undefined') {
    return createApiClient(undefined).app;
  }
  return createApiClient((window as Window & { api?: CurveApi }).api).app;
}

export function SettingsProvider({
  children,
  initialSettings,
  api,
}: SettingsProviderProps): ReactElement {
  const appApi = useMemo<SettingsApi>(() => api ?? bridgeApi(), [api]);
  const [settings, setSettings] = useState<AppSettings>(
    () => initialSettings ?? DEFAULT_APP_SETTINGS,
  );
  const [ready, setReady] = useState(initialSettings !== undefined);
  const [error, setError] = useState<AppError | null>(null);
  const settingsRef = useRef<AppSettings>(settings);
  const revisionRef = useRef(0);

  useEffect(() => {
    if (initialSettings !== undefined) {
      return undefined;
    }
    let cancelled = false;
    void appApi.settings().then((result) => {
      if (cancelled) {
        return;
      }
      setReady(true);
      if (result.ok) {
        settingsRef.current = result.data;
        setSettings(result.data);
        return;
      }
      setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [appApi, initialSettings]);

  const update = useCallback(
    async (patch: SettingsPatch): Promise<AppError | null> => {
      const next = normalizeAppSettings({ ...settingsRef.current, ...patch });
      const revision = revisionRef.current + 1;
      revisionRef.current = revision;
      settingsRef.current = next;
      setSettings(next);
      setError(null);

      const result = await appApi.updateSettings(next);
      if (!result.ok) {
        if (revision === revisionRef.current) {
          setError(result.error);
        }
        return result.error;
      }
      // A newer update may already be in flight; never roll its state back.
      if (revision === revisionRef.current) {
        settingsRef.current = result.data;
        setSettings(result.data);
      }
      return null;
    },
    [appApi],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, ready, error, update }),
    [settings, ready, error, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) {
    throw new Error('useSettings must be used inside <SettingsProvider>');
  }
  return value;
}
