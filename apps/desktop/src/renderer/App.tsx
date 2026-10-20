import { I18nProvider } from './i18n';
import { AppShell } from './shell/AppShell';
import { ThemeProvider } from './theme/ThemeProvider';

import type { ReactElement } from 'react';

/**
 * Composition root for the renderer: locale and theme providers wrap the shell.
 * `main.tsx` mounts this into a full-height `#root` (styles.css).
 */
export function App(): ReactElement {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </I18nProvider>
  );
}
