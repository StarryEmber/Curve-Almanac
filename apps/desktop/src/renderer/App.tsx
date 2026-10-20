import { useEffect, useMemo, useState } from 'react';

import { createApiClient } from './api-client';
import { describeAppError } from './error-text';
import { ToastHost, useToasts } from './toast';

import type { AppInfo } from '../shared/contracts/ipc';
import type { ReactElement } from 'react';

type RuntimeState =
  { status: 'loading' } | { status: 'ready'; info: AppInfo } | { status: 'error' };

/**
 * T0.2 placeholder shell: proves the typed IPC bridge works end to end.
 * T0.4 replaces it with the real App Shell, design tokens and i18n.
 */
export function App(): ReactElement {
  const [state, setState] = useState<RuntimeState>({ status: 'loading' });
  const { toasts, push, dismiss } = useToasts();
  const api = useMemo(() => createApiClient(window.api), []);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      const result = await api.app.info();
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setState({ status: 'ready', info: result.data });
        return;
      }
      setState({ status: 'error' });
      push('error', describeAppError(result.error));
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [api, push]);

  return (
    <main className="shell" role="main">
      <header className="shell__header">
        <h1 className="shell__title">Curve Studio</h1>
        <p className="shell__subtitle">Local-first tables and curves</p>
      </header>

      <section className="shell__panel" aria-labelledby="runtime-heading">
        <h2 id="runtime-heading" className="shell__panel-title">
          Runtime
        </h2>

        {state.status === 'loading' && (
          <p className="shell__status" role="status">
            Connecting to the main process…
          </p>
        )}

        {state.status === 'error' && (
          <p className="shell__status shell__status--error" role="status">
            Runtime information is unavailable.
          </p>
        )}

        {state.status === 'ready' && (
          <dl className="shell__facts" data-testid="runtime-status">
            <div className="shell__fact">
              <dt>Version</dt>
              <dd>{state.info.version}</dd>
            </div>
            <div className="shell__fact">
              <dt>Platform</dt>
              <dd>{state.info.platform}</dd>
            </div>
            <div className="shell__fact">
              <dt>Locale</dt>
              <dd>{state.info.locale}</dd>
            </div>
          </dl>
        )}
      </section>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
