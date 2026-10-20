import { useEffect, useState } from 'react';

import type { AppInfo } from '../shared/ipc';
import type { ReactElement } from 'react';

type RuntimeState =
  { status: 'loading' } | { status: 'ready'; info: AppInfo } | { status: 'error'; message: string };

/**
 * T0.2 placeholder shell: proves the preload bridge works end to end.
 * T0.4 replaces it with the real App Shell, design tokens and i18n.
 */
export function App(): ReactElement {
  const [state, setState] = useState<RuntimeState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const result = await window.api.app.info();
        if (cancelled) {
          return;
        }
        setState(
          result.ok
            ? { status: 'ready', info: result.data }
            : { status: 'error', message: result.error.message },
        );
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: 'The main process did not answer.' });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

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
          <p className="shell__status shell__status--error" role="alert">
            {state.message}
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
    </main>
  );
}
