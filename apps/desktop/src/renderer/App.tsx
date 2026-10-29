import { AppCoreProvider } from './app-core/use-app-core';
import { SettingsProvider, useSettings } from './features/settings/SettingsProvider';
import { UnsavedChangesProvider } from './features/workspace/unsaved-changes';
import { WorkspaceOpenProvider } from './features/workspace/workspace-open-flow';
import { I18nProvider } from './i18n';
import { AppShell } from './shell/AppShell';
import { ThemeProvider } from './theme/ThemeProvider';

import type { AppSettings } from '../shared/contracts/ipc';
import type { ReactElement } from 'react';

/**
 * Composition root for the renderer.
 *
 * T5.5 makes application settings the outer provider: locale and theme are
 * controlled by it (so one settings update changes the UI immediately) and
 * autosave is passed to the core. The initial settings are read in `main.tsx`
 * before the first render, which keeps the first paint in the stored theme and
 * language.
 */
function LocalizedProviders(): ReactElement {
  const { settings, update } = useSettings();

  return (
    <I18nProvider
      locale={settings.locale}
      onLocaleChange={(locale) => {
        void update({ locale });
      }}
    >
      <ThemeProvider
        mode={settings.theme}
        onModeChange={(theme) => {
          void update({ theme });
        }}
      >
        <AppCoreProvider autosaveEnabled={settings.autosave}>
          <UnsavedChangesProvider>
            <WorkspaceOpenProvider>
              <AppShell />
            </WorkspaceOpenProvider>
          </UnsavedChangesProvider>
        </AppCoreProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

export interface AppProps {
  /** Settings read before React mounts (see `main.tsx`). */
  initialSettings?: AppSettings;
}

export function App({ initialSettings }: AppProps): ReactElement {
  return (
    <SettingsProvider initialSettings={initialSettings}>
      <LocalizedProviders />
    </SettingsProvider>
  );
}
