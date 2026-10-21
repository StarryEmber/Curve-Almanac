import { AppCoreProvider } from './app-core/use-app-core';
import { I18nProvider } from './i18n';
import { AppShell } from './shell/AppShell';
import { ThemeProvider } from './theme/ThemeProvider';

import type { ReactElement } from 'react';

/**
 * Composition root for the renderer: locale and theme providers wrap the shell,
 * and one app-core instance is shared by every component (T2.1).
 */
export function App(): ReactElement {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AppCoreProvider>
          <AppShell />
        </AppCoreProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
