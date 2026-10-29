import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';

import type { AppState } from '@curve/app-core';

import { createRendererCore } from './renderer-core';

import type { RendererCore } from './renderer-core';
import type { CurveApi } from '../../shared/contracts/ipc';
import type { ReactElement, ReactNode } from 'react';

const RendererCoreContext = createContext<RendererCore | null>(null);

function currentBridge(): CurveApi | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return (window as Window & { api?: CurveApi }).api;
}

export interface AppCoreProviderProps {
  children: ReactNode;
  /** T5.5: initial autosave preference from `settings.json`. */
  autosaveEnabled?: boolean;
  /** Test hook; production creates the singleton from `window.api`. */
  core?: RendererCore;
}

/**
 * Creates exactly one renderer core per app (SPEC §13.1 / ADR-025). The table
 * Worker is terminated when the provider unmounts.
 */
export function AppCoreProvider({
  children,
  autosaveEnabled = true,
  core,
}: AppCoreProviderProps): ReactElement {
  const [value] = useState<RendererCore>(
    () => core ?? createRendererCore(currentBridge(), { autosaveEnabled }),
  );

  useEffect(() => {
    // Component tests inject partial cores; only the real app-core exposes this.
    value.core?.setAutosaveEnabled?.(autosaveEnabled);
  }, [value, autosaveEnabled]);

  useEffect(
    () => () => {
      value.tableIo.terminate();
      value.query.terminate();
    },
    [value],
  );

  return <RendererCoreContext.Provider value={value}>{children}</RendererCoreContext.Provider>;
}

export function useRendererCore(): RendererCore {
  const value = useContext(RendererCoreContext);
  if (value === null) {
    throw new Error('useRendererCore must be used inside <AppCoreProvider>.');
  }
  return value;
}

/**
 * Binds the vanilla Zustand store to React with `useSyncExternalStore`; no
 * React binding is imported into app-core (ADR-025).
 */
export function useAppState<T>(selector: (state: AppState) => T): T {
  const { core } = useRendererCore();
  const subscribe = core.store.subscribe;
  const getSnapshot = (): T => selector(core.store.getState());
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
