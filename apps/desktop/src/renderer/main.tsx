import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DEFAULT_APP_SETTINGS } from '../shared/contracts/settings';

import { createApiClient } from './api-client';
import { App } from './App';
import { activateRendererPlugins } from './plugins';
import './styles.css';

import type { CurveApi } from '../shared/contracts/ipc';
import type { AppSettings } from '../shared/contracts/settings';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Renderer root element is missing');
}

/**
 * T5.5: read `userData/settings.json` before the first paint. This keeps the
 * stored theme/language visible from the first frame (no light-then-dark flash)
 * and lets `AppCoreProvider` create the save queue with the right autosave mode.
 * A missing bridge or a failed read falls back to defaults; settings errors are
 * surfaced later by the settings dialog rather than blocking startup.
 */
const SETTINGS_BOOTSTRAP_TIMEOUT_MS = 1_500;

async function readInitialSettings(): Promise<AppSettings> {
  const api = createApiClient(
    typeof window === 'undefined' ? undefined : (window as Window & { api?: CurveApi }).api,
  );
  try {
    const result = await Promise.race([
      api.app.settings(),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, SETTINGS_BOOTSTRAP_TIMEOUT_MS);
      }),
    ]);
    return result?.ok === true ? result.data : DEFAULT_APP_SETTINGS;
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

void bootstrap(container);

/**
 * Startup order (T5.5/T6.2): settings → plugin activation → first paint. The
 * plugin host has already isolated activation failures (rollback + disabled +
 * log), so a broken plugin cannot block the window from rendering.
 */
async function bootstrap(root: HTMLElement): Promise<void> {
  const initialSettings = await readInitialSettings();
  await activateRendererPlugins();

  createRoot(root).render(
    <StrictMode>
      <App initialSettings={initialSettings} />
    </StrictMode>,
  );

  // T2.7/ADR-033: cold-start marker for the perf E2E spec. Two frames after
  // mount means the shell has painted and is interactive; the mark stays inert
  // in production (it is only a PerformanceEntry).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      performance.mark('curve:app-ready');
    });
  });
}
