import { useEffect, useMemo, useState } from 'react';

import { findActivePane } from '@curve/app-core';
import type { CellIssue } from '@curve/app-core';
import { DEFAULT_TABLE_STYLE, resolveStyle } from '@curve/domain';
import type { TableStyle, ViewDef } from '@curve/domain';
import type { TableData } from '@curve/table-engine';
import { Button } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';
import { ChartView } from '../charts/ChartView';
import { DataGrid } from '../grid/DataGrid';
import { useViewRows } from '../grid/use-view-rows';
import { usePaste } from '../paste/use-paste';

import { TabBar } from './TabBar';

import type { GridLocateTarget, DataGridProps } from '../grid/DataGrid';
import type { CellCommitOutcome } from '../grid/use-cell-editing';
import type { ReactElement } from 'react';

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') !== null
  );
}

/** Main area for an open workspace: warnings, tabs and the active grid. */
export function WorkspaceView(): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const workspace = useAppState((state) => state.workspace);
  const layout = useAppState((state) => state.layout);
  const views = useAppState((state) => state.views);
  const tables = useAppState((state) => state.tables);
  const tableStyles = useAppState((state) => state.tableStyles);
  const activeViewId = useAppState((state) => state.ui.activeViewId);
  const [warningsDismissed, setWarningsDismissed] = useState(false);

  useEffect(() => {
    setWarningsDismissed(false);
  }, [workspace?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) {
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (!modifier) {
        return;
      }
      if (key === 'w') {
        if (activeViewId === null) {
          return;
        }
        event.preventDefault();
        void core.actions.closeView(activeViewId);
        return;
      }
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          void core.actions.redo();
        } else {
          void core.actions.undo();
        }
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        void core.actions.redo();
        return;
      }
      if (key === 's') {
        event.preventDefault();
        void core.actions.flushSaves();
      }
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
  const styleResolution = useMemo(() => {
    if (view === undefined || view.kind !== 'table' || view.tableView === undefined) {
      return null;
    }
    return resolveStyle(view.tableView.styleId, Object.values(tableStyles));
  }, [tableStyles, view]);
  const warnings = workspace?.warnings ?? [];
  const firstTableId = Object.keys(tables)[0];

  const [locateTarget, setLocateTarget] = useState<GridLocateTarget | null>(null);
  useEffect(() => {
    setLocateTarget(null);
  }, [view?.id]);

  const paste = usePaste({
    tableId: tableData?.table.id ?? '',
    viewId: view?.id ?? '',
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

      <TabBar
        viewIds={viewIds}
        views={views}
        activeViewId={activeViewId}
        label={t('tabs.label')}
        closeLabel={(title) => t('tabs.close', { title })}
        {...(view?.kind === 'table'
          ? {
              newViewLabel: t('tabs.newViewLabel'),
              newViewTitle: t('tabs.newView'),
              onNewView: () => {
                void core.actions.duplicateView(view.id);
              },
            }
          : {})}
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
        {view?.kind === 'chart' ? (
          <ChartView key={view.id} view={view} />
        ) : view === undefined || tableData === undefined ? (
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
          <TableViewGrid
            key={view.id}
            tableData={tableData}
            view={view}
            tableStyle={styleResolution?.style ?? DEFAULT_TABLE_STYLE}
            styleFallback={styleResolution?.fallback ?? false}
            onViewUpdate={(patch) => {
              void core.actions.updateView(view.id, patch);
            }}
            onCellCommit={async (row, column, raw): Promise<CellCommitOutcome> => {
              const outcome = await core.actions.updateCell(
                tableData.table.id,
                row.id,
                column.id,
                raw,
              );
              if (outcome.ok) {
                return { ok: true };
              }
              return {
                ok: false,
                ...(outcome.issue === undefined ? {} : { issue: outcome.issue }),
              };
            }}
            onEditIssue={(issue: CellIssue | null) => {
              core.store.getState().actions.setEditIssue(issue);
            }}
            onPasteText={paste.handlePaste}
            locate={locateTarget}
          />
        )}
      </div>
      {paste.dialogs}
    </div>
  );
}

type TableViewGridProps = Pick<
  DataGridProps,
  'onViewUpdate' | 'onCellCommit' | 'onEditIssue' | 'onPasteText' | 'locate'
> & {
  tableData: TableData;
  view: ViewDef;
  tableStyle: TableStyle;
  styleFallback: boolean;
};

/** Calls the query hook only for table views, then hands the visible rows to the grid. */
function TableViewGrid({
  tableData,
  view,
  tableStyle,
  styleFallback,
  onViewUpdate,
  onCellCommit,
  onEditIssue,
  onPasteText,
  locate,
}: TableViewGridProps): ReactElement {
  const viewRows = useViewRows(tableData, view.tableView);

  // T2.7/ADR-033: the first grid frame ends the `curve:open` measurement that
  // `useWorkspaceController` started. A frame after commit means the virtual rows
  // are mounted and the grid is interactive.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (performance.getEntriesByName('curve:open-start', 'mark').length === 0) {
        return;
      }
      performance.clearMarks('curve:open-ready');
      performance.mark('curve:open-ready');
      performance.clearMeasures('curve:open');
      performance.measure('curve:open', 'curve:open-start', 'curve:open-ready');
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [tableData.table.id, view.id]);

  return (
    <DataGrid
      tableMeta={tableData.table}
      tableStyle={tableStyle}
      styleFallback={styleFallback}
      rows={viewRows.rows}
      allRows={tableData.rows}
      viewRows={viewRows}
      view={view}
      onViewUpdate={onViewUpdate}
      onCellCommit={onCellCommit}
      onEditIssue={onEditIssue}
      {...(onPasteText === undefined ? {} : { onPasteText })}
      {...(locate === undefined || locate === null ? {} : { locate })}
    />
  );
}
