import { useCallback, useEffect, useRef, useState } from 'react';

import { ToastHost, useToasts } from '@curve/ui';

import { describeAppError } from '../error-text';
import { useI18n } from '../i18n';

import { HelpDialog } from './HelpDialog';
import { Inspector } from './Inspector';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { useRuntimeInfo } from './use-runtime-info';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';

import type { AppError } from '../../shared/contracts/ipc';
import type { ReactElement } from 'react';

/**
 * App Shell (TASKS T0.4): title bar, collapsible sidebar, main area, inspector,
 * status bar and the toast/dialog layers. Layout is a CSS grid so the keyboard
 * order matches the visual order: skip link → title bar → sidebar → main →
 * inspector → status bar.
 */
export function AppShell(): ReactElement {
  const { t } = useI18n();
  const runtime = useRuntimeInfo();
  const { toasts, push, dismiss } = useToasts();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const reportedError = useRef<AppError | null>(null);

  useEffect(() => {
    if (runtime.status !== 'error' || reportedError.current === runtime.error) {
      return;
    }
    reportedError.current = runtime.error;
    push('error', describeAppError(runtime.error, t));
  }, [runtime, push, t]);

  const notifyUnavailable = useCallback((): void => {
    push('info', t('shell.empty.unavailable'));
  }, [push, t]);

  return (
    <div
      className="cs-app"
      data-testid="shell"
      data-sidebar={sidebarOpen ? 'open' : 'closed'}
      data-inspector={inspectorOpen ? 'open' : 'closed'}
    >
      <a className="cs-skip-link" href="#cs-main">
        {t('shell.skipToMain')}
      </a>

      <TitleBar
        sidebarOpen={sidebarOpen}
        inspectorOpen={inspectorOpen}
        onToggleSidebar={() => {
          setSidebarOpen((open) => !open);
        }}
        onToggleInspector={() => {
          setInspectorOpen((open) => !open);
        }}
        onOpenHelp={() => {
          setHelpOpen(true);
        }}
      />

      {sidebarOpen ? <Sidebar /> : null}

      <main className="cs-app__main" id="cs-main" data-testid="main" tabIndex={-1}>
        <WorkspaceEmptyState onUnavailable={notifyUnavailable} />
      </main>

      {inspectorOpen ? <Inspector /> : null}

      <StatusBar runtime={runtime} />

      <ToastHost
        toasts={toasts}
        onDismiss={dismiss}
        dismissLabel={t('toast.dismiss')}
        regionLabel={t('toast.region')}
      />

      <HelpDialog
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false);
        }}
      />
    </div>
  );
}
