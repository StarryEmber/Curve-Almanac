/**
 * Recursive split layout and per-pane tabs (T5.1, SPEC §12).
 *
 * The persisted `LayoutNode` tree drives rendering: every pane owns its tab bar
 * and active view, while `ui.activePanePath` (UI-only) tracks the pane that owns
 * the inspector/inline actions. Splitting creates an empty second pane; tabs can
 * be moved to the next pane and a pane collapses when its last tab closes.
 * Ratios are dragged locally and committed once on pointer-up (500ms debounced
 * manifest write in app-core); keyboard arrows adjust them by 2%.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { countPanes, LAYOUT_ROOT_PATH } from '@curve/app-core';
import { DEFAULT_TABLE_STYLE, MAX_PANES, resolveStyle } from '@curve/domain';
import type { LayoutNode, ViewDef } from '@curve/domain';
import type { TableData } from '@curve/table-engine';
import { Button } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';
import { ChartView } from '../charts/ChartView';
import { DataGrid } from '../grid/DataGrid';
import { useViewRows } from '../grid/use-view-rows';

import { TabBar } from './TabBar';

import type { DataGridProps, GridLocateTarget } from '../grid/DataGrid';
import type { CellCommitOutcome } from '../grid/use-cell-editing';
import type { UsePasteResult } from '../paste/use-paste';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement } from 'react';

type SplitLayoutNode = Extract<LayoutNode, { type: 'split' }>;

export interface LayoutViewProps {
  onPasteText: UsePasteResult['handlePaste'];
  locate: GridLocateTarget | null;
}

function clampRatio(value: number): number {
  return Math.min(0.8, Math.max(0.2, value));
}

export function LayoutView({ onPasteText, locate }: LayoutViewProps): ReactElement {
  const layout = useAppState((state) => state.layout);
  const paneCount = countPanes(layout);
  return (
    <div className="cs-layout" data-testid="layout" data-layout-panes={paneCount}>
      <LayoutNodeView
        node={layout}
        path={LAYOUT_ROOT_PATH}
        paneCount={paneCount}
        onPasteText={onPasteText}
        locate={locate}
      />
    </div>
  );
}

interface LayoutNodeViewProps extends LayoutViewProps {
  node: LayoutNode;
  path: string;
  paneCount: number;
}

function LayoutNodeView({
  node,
  path,
  paneCount,
  onPasteText,
  locate,
}: LayoutNodeViewProps): ReactElement {
  if (node.type === 'pane') {
    return (
      <PaneView
        node={node}
        path={path}
        paneCount={paneCount}
        onPasteText={onPasteText}
        locate={locate}
      />
    );
  }
  return (
    <SplitView
      node={node}
      path={path}
      paneCount={paneCount}
      onPasteText={onPasteText}
      locate={locate}
    />
  );
}

interface SplitViewProps extends LayoutViewProps {
  node: SplitLayoutNode;
  path: string;
  paneCount: number;
}

function SplitView({ node, path, paneCount, onPasteText, locate }: SplitViewProps): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ start: number; size: number; ratio: number } | null>(null);
  const [ratio, setRatio] = useState(node.ratio);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setRatio(node.ratio);
  }, [node.ratio, path]);

  const commit = (next: number): void => {
    const clamped = clampRatio(next);
    setRatio(clamped);
    if (clamped !== node.ratio) {
      void core.actions.setLayoutRatio(path, clamped);
    }
  };

  const horizontal = node.direction === 'horizontal';
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect === undefined) {
      return;
    }
    dragRef.current = {
      start: horizontal ? event.clientX : event.clientY,
      size: horizontal ? rect.width : rect.height,
      ratio,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (drag === null) {
      return;
    }
    const position = horizontal ? event.clientX : event.clientY;
    setRatio(clampRatio(drag.ratio + (position - drag.start) / Math.max(1, drag.size)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (drag === null) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commit(ratio);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = 0.02;
    let next: number | null = null;
    if (horizontal && event.key === 'ArrowLeft') {
      next = ratio - step;
    } else if (horizontal && event.key === 'ArrowRight') {
      next = ratio + step;
    } else if (!horizontal && event.key === 'ArrowUp') {
      next = ratio - step;
    } else if (!horizontal && event.key === 'ArrowDown') {
      next = ratio + step;
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    commit(next);
  };

  const style: CSSProperties = horizontal
    ? { gridTemplateColumns: `${String(ratio)}fr 6px ${String(1 - ratio)}fr` }
    : { gridTemplateRows: `${String(ratio)}fr 6px ${String(1 - ratio)}fr` };
  const percent = Math.round(ratio * 100);
  const handleLabel = t('layout.resize');

  return (
    <div
      ref={containerRef}
      className="cs-layout__split"
      data-direction={node.direction}
      data-testid="layout-split"
      data-split-path={path}
      data-dragging={dragging ? 'true' : 'false'}
      style={style}
    >
      <div className="cs-layout__slot">
        <LayoutNodeView
          node={node.first}
          path={`${path}.0`}
          paneCount={paneCount}
          onPasteText={onPasteText}
          locate={locate}
        />
      </div>
      <div
        className="cs-layout__separator"
        role="separator"
        aria-label={handleLabel}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={percent}
        aria-valuetext={`${String(percent)}%`}
        tabIndex={0}
        data-testid="split-handle"
        data-split-path={path}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <div className="cs-layout__slot">
        <LayoutNodeView
          node={node.second}
          path={`${path}.1`}
          paneCount={paneCount}
          onPasteText={onPasteText}
          locate={locate}
        />
      </div>
    </div>
  );
}

interface PaneViewProps extends LayoutViewProps {
  node: Extract<LayoutNode, { type: 'pane' }>;
  path: string;
  paneCount: number;
}

function PaneView({ node, path, paneCount, onPasteText, locate }: PaneViewProps): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const activeViewId = useAppState((state) => state.ui.activeViewId);
  const activePanePath = useAppState((state) => state.ui.activePanePath);
  const views = useAppState((state) => state.views);
  const tables = useAppState((state) => state.tables);
  const tableStyles = useAppState((state) => state.tableStyles);
  const activeId = node.activeViewId ?? node.viewIds[0] ?? null;
  const view = activeId === null ? undefined : views[activeId];
  const tableData = view?.kind === 'table' ? tables[view.refId] : undefined;
  const isActive = activePanePath === path;

  const styleResolution = useMemo(() => {
    if (view === undefined || view.kind !== 'table' || view.tableView === undefined) {
      return null;
    }
    return resolveStyle(view.tableView.styleId, Object.values(tableStyles));
  }, [tableStyles, view]);

  const focus = (): void => {
    core.store.getState().actions.focusPane(path);
  };

  return (
    <section
      className={isActive ? 'cs-layout__pane cs-layout__pane--active' : 'cs-layout__pane'}
      data-testid="pane"
      data-pane-path={path}
      data-pane-active={isActive ? 'true' : 'false'}
      aria-label={t('layout.pane')}
      onPointerDownCapture={focus}
    >
      <div className="cs-pane__header">
        <TabBar
          viewIds={node.viewIds}
          views={views}
          activeViewId={activeId}
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
        <div className="cs-pane__actions" role="group" aria-label={t('layout.actions')}>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('layout.splitHorizontal')}
            title={t('layout.splitHorizontal')}
            data-testid="pane-split-horizontal"
            disabled={paneCount >= MAX_PANES}
            onClick={() => {
              void core.actions.splitPane('horizontal');
            }}
          >
            <span aria-hidden="true">{'\u21d4'}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('layout.splitVertical')}
            title={t('layout.splitVertical')}
            data-testid="pane-split-vertical"
            disabled={paneCount >= MAX_PANES}
            onClick={() => {
              void core.actions.splitPane('vertical');
            }}
          >
            <span aria-hidden="true">{'\u21d5'}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('layout.moveNext')}
            title={t('layout.moveNext')}
            data-testid="pane-move-next"
            disabled={paneCount < 2 || view === undefined}
            onClick={() => {
              if (view !== undefined) {
                void core.actions.moveViewToNextPane(view.id);
              }
            }}
          >
            <span aria-hidden="true">{'\u21a6'}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('layout.closePane')}
            title={t('layout.closePane')}
            data-testid="pane-close"
            disabled={paneCount <= 1 || node.viewIds.length > 0}
            onClick={() => {
              void core.actions.closePane();
            }}
          >
            <span aria-hidden="true">{'\u00d7'}</span>
          </Button>
        </div>
      </div>

      <div className="cs-pane__content" role="tabpanel" aria-label={view?.title ?? t('tabs.label')}>
        {view?.kind === 'chart' ? (
          <ChartView key={view.id} view={view} />
        ) : view !== undefined && tableData !== undefined ? (
          <TableViewGrid
            key={view.id}
            tableData={tableData}
            view={view}
            tableStyle={styleResolution?.style ?? DEFAULT_TABLE_STYLE}
            styleFallback={styleResolution?.fallback ?? false}
            active={view.id === activeViewId}
            onPasteText={onPasteText}
            locate={locate}
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
            onEditIssue={(issue) => {
              core.store.getState().actions.setEditIssue(issue);
            }}
          />
        ) : (
          <PaneEmptyState
            canClose={paneCount > 1}
            onClose={() => {
              void core.actions.closePane();
            }}
          />
        )}
      </div>
    </section>
  );
}

interface TableViewGridProps {
  tableData: TableData;
  view: ViewDef;
  tableStyle: DataGridProps['tableStyle'];
  styleFallback: boolean;
  active: boolean;
  onPasteText: UsePasteResult['handlePaste'];
  locate: GridLocateTarget | null;
  onViewUpdate: DataGridProps['onViewUpdate'];
  onCellCommit: DataGridProps['onCellCommit'];
  onEditIssue: DataGridProps['onEditIssue'];
}

/** Calls the query hook only for table views, then hands the visible rows to the grid. */
function TableViewGrid({
  tableData,
  view,
  tableStyle,
  styleFallback,
  active,
  onPasteText,
  locate,
  onViewUpdate,
  onCellCommit,
  onEditIssue,
}: TableViewGridProps): ReactElement {
  const viewRows = useViewRows(tableData, view.tableView);

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
      {...(active ? { onPasteText } : {})}
      {...(active && locate !== null ? { locate } : {})}
    />
  );
}

function PaneEmptyState({
  canClose,
  onClose,
}: {
  canClose: boolean;
  onClose: () => void;
}): ReactElement {
  const { t } = useI18n();
  return (
    <div className="cs-pane__empty" data-testid="workspace-empty" data-pane-empty="true">
      <h2 className="cs-pane__empty-title">{t('layout.empty.title')}</h2>
      <p className="cs-pane__empty-body">{t('layout.empty.body')}</p>
      {canClose ? (
        <Button variant="secondary" onClick={onClose}>
          {t('layout.closePane')}
        </Button>
      ) : null}
    </div>
  );
}
