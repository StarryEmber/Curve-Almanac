import { useEffect, useState } from 'react';

import { Button } from '@curve/ui';

import { useAppState } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';
import { usePaste } from '../paste/use-paste';

import { LayoutView } from './LayoutView';

import type { GridLocateTarget } from '../grid/DataGrid';
import type { ReactElement } from 'react';

/** Main area for an open workspace: warnings, split layout and the paste layer. */
export function WorkspaceView(): ReactElement {
  const { t } = useI18n();
  const workspace = useAppState((state) => state.workspace);
  const views = useAppState((state) => state.views);
  const tables = useAppState((state) => state.tables);
  const activeViewId = useAppState((state) => state.ui.activeViewId);
  const [warningsDismissed, setWarningsDismissed] = useState(false);

  useEffect(() => {
    setWarningsDismissed(false);
  }, [workspace?.id]);

  const activeView = activeViewId === null ? undefined : views[activeViewId];
  const activeTableData = activeView?.kind === 'table' ? tables[activeView.refId] : undefined;
  const warnings = workspace?.warnings ?? [];

  const [locateTarget, setLocateTarget] = useState<GridLocateTarget | null>(null);
  useEffect(() => {
    setLocateTarget(null);
  }, [activeViewId]);

  const paste = usePaste({
    tableId: activeTableData?.table.id ?? '',
    viewId: activeViewId ?? '',
    onLocate: (rowIndex, colIndex) => {
      setLocateTarget((current) => ({
        rowIndex,
        colIndex,
        nonce: (current?.nonce ?? 0) + 1,
      }));
    },
  });

  return (
    <div className="cs-workspace" data-testid="workspace-view">
      {warnings.length > 0 && !warningsDismissed ? (
        <section
          className="cs-warnings"
          aria-label={t('workspace.warnings.title', { count: warnings.length })}
        >
          <div className="cs-warnings__header">
            <h2 className="cs-warnings__title">
              {t('workspace.warnings.title', { count: warnings.length })}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setWarningsDismissed(true);
              }}
            >
              {t('workspace.warnings.dismiss')}
            </Button>
          </div>
          <ul className="cs-warnings__list">
            {warnings.map((warning, index) => (
              <li key={index} className="cs-warnings__item">
                {warning}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <LayoutView onPasteText={paste.handlePaste} locate={locateTarget} />
      {paste.dialogs}
    </div>
  );
}
