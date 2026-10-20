import { useEffect, useMemo, useState } from 'react';

import { createApiClient } from '../api-client';

import type { AppError, AppInfo } from '../../shared/contracts/ipc';

export type RuntimeState =
  { status: 'loading' } | { status: 'ready'; info: AppInfo } | { status: 'error'; error: AppError };

/**
 * Asks the main process for `app:info` once and turns every failure into the
 * envelope form, so the shell can render a status line without try/catch.
 */
export function useRuntimeInfo(): RuntimeState {
  const api = useMemo(() => createApiClient(window.api), []);
  const [state, setState] = useState<RuntimeState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void api.app.info().then((result) => {
      if (cancelled) {
        return;
      }
      setState(
        result.ok
          ? { status: 'ready', info: result.data }
          : { status: 'error', error: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return state;
}
