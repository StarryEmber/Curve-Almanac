import { useEffect, useState } from 'react';

import { findActivePane } from '@curve/app-core';
import { Button } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';
import { DataGrid } from '../grid/DataGrid';

import { TabBar } from './TabBar';

import type { ReactElement } from 'react';

/** Main area for an open workspace: warnings, tabs and the active grid. */
export function WorkspaceView(): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const workspace = useAppState((state) => state.workspace);
  const layout = useAppState((state) => state.layout);
  const views = useAppState((state) => state.views);
  const tables = useAppState((state) => state.tables);
  const activeViewId = useAppState((state) => state.ui.activeViewId);
  const [warningsDismissed, setWarningsDismissed] = useState(false);

  useEffect(() => {
    setWarningsDismissed(false);
  }, [workspace?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'w') {
        return;
      }
      if (activeViewId === null) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') !==
          null
      ) {
        return;
      }
      event.preventDefault();
      void core.actions.closeView(activeViewId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeViewId, core]);

  const pane = findActivePane(layout);
  const viewIds = pane?.viewIds ?? [];
  const view = activeViewId === null ? undefined : views[activeViewId];
  const tableData = view?.kind === 'table' ? tables[view.refId] : undefined;
  const warnings = workspace?.warnings ?? [];
  const firstTableId = Object.keys(tables)[0];

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

      <TabBar
        viewIds={viewIds}
        views={views}
        activeViewId={activeViewId}
        label={t('tabs.label')}
        closeLabel={(title) => t('tabs.close', { title })}
        onActivate={(viewId) => {
          void core.actions.activateView(viewId);
        }}
        onClose={(viewId) => {
          void core.actions.closeView(viewId);
        }}
      />

      <div
        className="cs-workspace__content"
        role="tabpanel"
        aria-label={view?.title ?? t('tabs.label')}
      >
        {tableData === undefined || view === undefined || view.kind !== 'table' ? (
          <div className="cs-workspace__empty" data-testid="workspace-empty">
            <h2 className="cs-workspace__empty-title">{t('tabs.empty.title')}</h2>
            <p className="cs-workspace__empty-body">{t('tabs.empty.body')}</p>
            {firstTableId === undefined ? null : (
              <Button
                variant="primary"
                onClick={() => {
                  void core.actions.openTable(firstTableId);
                }}
              >
                {t('tabs.empty.action')}
              </Button>
            )}
          </div>
        ) : (
          <DataGrid
            key={view.id}
            tableMeta={tableData.table}
            rows={tableData.rows}
            view={view}
            onViewUpdate={(patch) => {
              void core.actions.updateView(view.id, patch);
            }}
          />
        )}
      </div>
    </div>
  );
}
