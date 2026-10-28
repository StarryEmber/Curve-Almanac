import { AppCoreProvider } from './app-core/use-app-core';
import { WorkspaceOpenProvider } from './features/workspace/workspace-open-flow';
import { I18nProvider } from './i18n';
import { AppShell } from './shell/AppShell';
import { ThemeProvider } from './theme/ThemeProvider';

import type { ReactElement } from 'react';

/**
 * Composition root for the renderer: locale and theme providers wrap the shell,
 * and one app-core instance is shared by every component (T2.1). The workspace
 * open flow owns the crash-recovery dialog (T5.3).
 */
export function App(): ReactElement {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AppCoreProvider>
          <WorkspaceOpenProvider>
            <AppShell />
          </WorkspaceOpenProvider>
        </AppCoreProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
