import { useEffect, useRef, useState } from 'react';

import { ToastHost, useToasts } from '@curve/ui';

import { useAppState } from '../app-core/use-app-core';
import { useQuitGuard } from '../app-core/use-quit-guard';
import { describeAppError } from '../error-text';
import { WelcomePage } from '../features/workspace/WelcomePage';
import { WorkspaceView } from '../features/workspace/WorkspaceView';
import { useI18n } from '../i18n';

import { HelpDialog } from './HelpDialog';
import { Inspector } from './Inspector';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { useRuntimeInfo } from './use-runtime-info';

import type { AppError } from '../../shared/contracts/ipc';
import type { ReactElement } from 'react';

/**
 * App Shell: title bar, collapsible sidebar, main area, inspector, status bar
 * and the toast/dialog layers. T2.1 swaps the T0.4 empty state for the welcome
 * page and the workspace view.
 */
export function AppShell(): ReactElement {
  const { t } = useI18n();
  const runtime = useRuntimeInfo();
  useQuitGuard();
  const { toasts, push, dismiss } = useToasts();
  const workspace = useAppState((state) => state.workspace);
  const appError = useAppState((state) => state.ui.error);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const reportedRuntimeError = useRef<AppError | null>(null);
  const reportedAppError = useRef<AppError | null>(null);

  useEffect(() => {
    if (runtime.status !== 'error' || reportedRuntimeError.current === runtime.error) {
      return;
    }
    reportedRuntimeError.current = runtime.error;
    push('error', describeAppError(runtime.error, t));
  }, [runtime, push, t]);

  useEffect(() => {
    if (appError === null) {
      reportedAppError.current = null;
      return;
    }
    if (reportedAppError.current === appError) {
      return;
    }
    reportedAppError.current = appError;
    push('error', describeAppError(appError, t));
  }, [appError, push, t]);

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
        {workspace === null ? (
          <WelcomePage
            documentsDir={runtime.status === 'ready' ? runtime.info.documentsDir : undefined}
          />
        ) : (
          <WorkspaceView />
        )}
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
