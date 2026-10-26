/**
 * Chart view surface (T4.4 creation/inspector, T4.5 interaction/empty/export).
 *
 * Resolves the persisted `ChartSpec` into a `RenderModel`, renders it through
 * `ChartCanvas` and keeps every SPEC §11.3 warning visible. A chart whose
 * mapped column was deleted (or whose mapping became type-incompatible) shows an
 * actionable error state with the same mapping editor the inspector uses
 * (SPEC §6.6.4: no crash, remap required).
 *
 * T4.5 adds the toolbar (legend/zoom/reset/open table/export), the three empty
 * states with their actions, the screen-reader summary and the PNG dialog
 * (ADR-044). Interaction state lives only in this view: it is never persisted.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { isEmptyModel } from '@curve/chart-echarts';
import type { ChartInteractionAction, ChartInteractionState } from '@curve/chart-echarts';
import type { RenderModel } from '@curve/chart-model';
import type { ChartMapping, ChartSpec, ViewDef } from '@curve/domain';
import { Button } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';

import {
  chartKindLabel,
  chartSummaryText,
  mappingIssueLabel,
  mappingPathLabel,
} from './chart-text';
import { chartRenderStatus } from './chart-view-model';
import { ChartCanvas } from './ChartCanvas';
import { DeleteChartDialog } from './ChartDialogs';
import { ChartEmptyState } from './ChartEmptyState';
import { ChartExportDialog } from './ChartExportDialog';
import { ChartMappingFields } from './ChartMappingFields';
import { useChartEditor } from './use-chart-editor';

import type { ChartCanvasHandle } from './ChartCanvas';
import type { ReactElement } from 'react';

const EMPTY_INTERACTION: ChartInteractionState = { zoom: null, hiddenSeries: [] };

/**
 * RenderModel summary fields exposed as `data-chart-*` (T4.4 E2E/a11y
 * contract). State and interaction attributes are added by the caller.
 */
function modelAttributes(model: RenderModel, chart: ChartSpec): Record<string, string> {
  return {
    'data-chart-kind': model.kind,
    'data-chart-layout': chart.mapping.layout,
    'data-chart-x-type': model.x.type,
    'data-chart-x-label': model.x.label ?? '',
    'data-chart-y-label': model.y?.label ?? '',
    'data-chart-series-count': String(model.series.length),
    'data-chart-series': model.series.map((series) => series.name).join('|'),
    'data-chart-source-points': String(model.meta.sourcePoints),
    'data-chart-rendered-points': String(model.meta.renderedPoints),
    'data-chart-sampled': model.meta.sampled ? 'true' : 'false',
    'data-chart-palette': model.style.palette[0] ?? '',
    'data-chart-background': model.style.background,
    'data-chart-legend': model.style.legend,
    'data-chart-show-grid': model.style.showGrid ? 'true' : 'false',
    'data-chart-smooth': model.style.smooth ? 'true' : 'false',
    'data-chart-show-symbol': model.style.showSymbol ? 'true' : 'false',
    'data-chart-line-width': String(model.style.lineWidth),
    'data-chart-number-digits': String(model.style.numberDigits),
    'data-chart-y-start-at-zero': model.style.yStartAtZero ? 'true' : 'false',
  };
}

export function ChartView({ view }: { view: ViewDef }): ReactElement {
  const { t, locale } = useI18n();
  const { resolved } = useTheme();
  const { core } = useRendererCore();
  const commit = useChartEditor();
  const chart = useAppState((state) => state.charts[view.refId]);
  const tableData = useAppState((state) =>
    chart === undefined ? undefined : state.tables[chart.tableId],
  );
  const table = tableData?.table;
  const rows = tableData?.rows;

  const status = useMemo(
    () =>
      chartRenderStatus({
        chart,
        table,
        rows: rows ?? [],
        locale,
        theme: resolved,
      }),
    [chart, table, rows, locale, resolved],
  );

  const canvasRef = useRef<ChartCanvasHandle>(null);
  const remapRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<ChartInteractionState>(EMPTY_INTERACTION);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const title = chart?.title ?? view.title;

  // Subscribe after ChartCanvas mounts (child effects run first). The canvas
  // keeps this subscription across locale-driven renderer rebuilds. `emptyModel`
  // participates so an empty → ready transition (filter change) subscribes too.
  const statusKind = status.kind;
  const emptyModel = status.kind === 'ready' ? isEmptyModel(status.model) : true;
  useEffect(() => {
    const handle = canvasRef.current;
    if (handle === null) {
      setInteraction(EMPTY_INTERACTION);
      return undefined;
    }
    setInteraction(handle.getInteractionState());
    return handle.subscribeInteraction(setInteraction);
  }, [chart?.id, statusKind, emptyModel]);

  const openTable = (): void => {
    if (chart === undefined) {
      return;
    }
    void core.actions.openTable(chart.tableId).then((outcome) => {
      if (!outcome.ok) {
        core.store.getState().actions.setError(outcome.error);
      }
    });
  };

  const focusMapping = (): void => {
    const container = remapRef.current;
    const field = container?.querySelector<HTMLElement>('select, input');
    field?.focus();
  };

  const dispatch = (action: ChartInteractionAction): void => {
    canvasRef.current?.dispatchInteraction(action);
  };

  const confirmDelete = async (): Promise<void> => {
    if (chart === undefined) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    const outcome = await core.actions.deleteChart(chart.id);
    setDeleteBusy(false);
    if (outcome.ok || outcome.committed === true) {
      setDeleteOpen(false);
      return;
    }
    setDeleteError(describeAppError(outcome.error, t));
  };

  if (status.kind === 'missing-chart' || status.kind === 'error') {
    return (
      <section
        className="cs-chart-view"
        data-testid="chart-view"
        data-chart-state={status.kind}
        aria-label={title}
      >
        <header className="cs-chart-view__header">
          <h2 className="cs-chart-view__title">{title}</h2>
        </header>
        <p className="cs-chart-view__error" role="alert" data-testid="chart-error">
          {status.kind === 'missing-chart'
            ? t('chart.view.missingChart')
            : t('chart.view.error', { message: status.message })}
        </p>
      </section>
    );
  }

  if (status.kind === 'missing-table') {
    return (
      <section
        className="cs-chart-view"
        data-testid="chart-view"
        data-chart-state="missing-table"
        data-chart-empty="no-table"
        aria-label={title}
      >
        <header className="cs-chart-view__header">
          <h2 className="cs-chart-view__title">{title}</h2>
        </header>
        <p className="cs-chart-view__error" role="alert" data-testid="chart-error">
          {t('chart.view.missingTable')}
        </p>
        <ChartEmptyState
          kind="no-table"
          title={t('chart.empty.noTable.title')}
          body={t('chart.empty.noTable.body')}
          actionLabel={t('chart.empty.noTable.action')}
          onAction={() => {
            setDeleteOpen(true);
          }}
        />
        <DeleteChartDialog
          chart={deleteOpen ? (chart ?? null) : null}
          busy={deleteBusy}
          error={deleteError}
          onClose={() => {
            setDeleteOpen(false);
            setDeleteError(null);
          }}
          onConfirm={() => {
            void confirmDelete();
          }}
        />
      </section>
    );
  }

  if (chart === undefined || table === undefined) {
    // Guarded by the status branches above; keeps TypeScript narrowing simple.
    return <section className="cs-chart-view" data-testid="chart-view" />;
  }

  if (status.kind === 'missing-columns' || status.kind === 'invalid') {
    const issues = status.kind === 'invalid' ? status.issues : [];
    return (
      <section
        className="cs-chart-view"
        data-testid="chart-view"
        data-chart-state={status.kind}
        data-chart-empty="unmapped"
        aria-label={title}
      >
        <header className="cs-chart-view__header">
          <h2 className="cs-chart-view__title">{title}</h2>
        </header>
        <div className="cs-chart-view__error" role="alert" data-testid="chart-error">
          <p>
            {status.kind === 'missing-columns'
              ? t('chart.view.missingColumns', { columns: status.columnIds.join(', ') })
              : t('chart.view.invalidMapping')}
          </p>
          {issues.length === 0 ? null : (
            <ul className="cs-chart-view__issues" data-testid="chart-issues">
              {issues.map((issue, index) => (
                <li key={`${issue.path}-${String(index)}`}>
                  {t(mappingPathLabel(issue.path))}: {mappingIssueLabel(issue.code, t)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <ChartEmptyState
          kind="unmapped"
          title={t('chart.empty.unmapped.title')}
          body={t('chart.empty.unmapped.body')}
          actionLabel={t('chart.empty.unmapped.action')}
          onAction={focusMapping}
        >
          <div className="cs-chart-view__remap" data-testid="chart-remap" ref={remapRef}>
            <h3 className="cs-chart-view__remap-title">{t('chart.view.remap')}</h3>
            <p className="cs-chart-view__hint">{t('chart.view.remapHint')}</p>
            <ChartMappingFields
              chart={chart}
              table={table}
              testIdPrefix="chart-remap"
              onChange={(mapping: ChartMapping) => {
                commit({ ...chart, mapping });
              }}
            />
          </div>
        </ChartEmptyState>
      </section>
    );
  }

  const { model } = status;
  const summary = chartSummaryText(model, t);
  const canvasLabel = t('chart.view.ariaLabel', { title, summary });
  const attributes = modelAttributes(model, chart);
  const sampledBadge = model.meta.sampled ? (
    <span className="cs-chart-view__badge" data-testid="chart-sampled-badge">
      {t('chart.view.sampled')}
    </span>
  ) : null;
  const hiddenSeries = new Set(interaction.hiddenSeries);
  const zoomStart = interaction.zoom?.start ?? 0;
  const zoomEnd = interaction.zoom?.end ?? 100;

  const header = (
    <header className="cs-chart-view__header">
      <h2 className="cs-chart-view__title" data-testid="chart-title">
        {title}
      </h2>
      <span className="cs-chart-view__meta" data-testid="chart-summary">
        {chartKindLabel(model.kind, t)} ·{' '}
        {t('chart.view.seriesCount', { count: model.series.length })}
        {' · '}
        {model.meta.sampled
          ? t('chart.view.sampledPoints', {
              source: model.meta.sourcePoints,
              rendered: model.meta.renderedPoints,
            })
          : t('chart.view.points', { points: model.meta.sourcePoints })}
      </span>
      {sampledBadge}
    </header>
  );

  if (emptyModel) {
    return (
      <section
        className="cs-chart-view"
        data-testid="chart-view"
        data-chart-state="empty"
        data-chart-empty="no-data"
        {...attributes}
        data-chart-zoom-start=""
        data-chart-zoom-end=""
        data-chart-hidden-series=""
        aria-label={canvasLabel}
      >
        {header}
        <ChartEmptyState
          kind="no-data"
          title={t('chart.empty.noData.title')}
          body={t('chart.empty.noData.body')}
          actionLabel={t('chart.empty.noData.action')}
          onAction={openTable}
        />
      </section>
    );
  }

  return (
    <section
      className="cs-chart-view"
      data-testid="chart-view"
      data-chart-state="ready"
      {...attributes}
      data-chart-zoom-start={zoomStart}
      data-chart-zoom-end={zoomEnd}
      data-chart-hidden-series={interaction.hiddenSeries.join('|')}
      aria-label={title}
    >
      {header}

      <div
        className="cs-chart-toolbar"
        role="toolbar"
        aria-label={t('chart.view.toolbar')}
        data-testid="chart-toolbar"
      >
        <div className="cs-chart-toolbar__group" role="group" aria-label={t('chart.view.legend')}>
          {model.series.map((series, index) => {
            const pressed = !hiddenSeries.has(series.name);
            return (
              <Button
                key={series.id}
                size="sm"
                variant="ghost"
                aria-pressed={pressed}
                data-testid={`chart-series-toggle-${index}`}
                className={pressed ? undefined : 'cs-chart-toolbar__toggle--off'}
                onClick={() => {
                  dispatch({ type: 'toggle-series', name: series.name });
                }}
              >
                {t('chart.view.seriesToggle', { name: series.name })}
              </Button>
            );
          })}
        </div>
        <div className="cs-chart-toolbar__group">
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('chart.view.zoomOut')}
            title={t('chart.view.zoomOut')}
            data-testid="chart-zoom-out"
            onClick={() => {
              dispatch({ type: 'zoom-by', factor: 0.5 });
            }}
          >
            <span aria-hidden="true">{'\u2212'}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="chart-zoom-reset"
            onClick={() => {
              dispatch({ type: 'reset-view' });
            }}
          >
            {t('chart.view.resetZoom')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('chart.view.zoomIn')}
            title={t('chart.view.zoomIn')}
            data-testid="chart-zoom-in"
            onClick={() => {
              dispatch({ type: 'zoom-by', factor: 2 });
            }}
          >
            <span aria-hidden="true">{'+'}</span>
          </Button>
          <span className="cs-chart-toolbar__range" data-testid="chart-zoom-range">
            {t('chart.view.zoomRange', {
              start: Math.round(zoomStart),
              end: Math.round(zoomEnd),
            })}
          </span>
        </div>
        <Button size="sm" variant="secondary" data-testid="chart-open-table" onClick={openTable}>
          {t('chart.view.openTable')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          data-testid="chart-export-open"
          onClick={() => {
            setExportOpen(true);
          }}
        >
          {t('chart.view.export')}
        </Button>
      </div>

      <ChartCanvas ref={canvasRef} model={model} label={canvasLabel} testId="chart-canvas" />

      {model.meta.warnings.length === 0 ? null : (
        <section
          className="cs-chart-view__warnings"
          aria-label={t('chart.view.warnings', { count: model.meta.warnings.length })}
          data-testid="chart-warnings"
        >
          <ul>
            {model.meta.warnings.map((warning, index) => (
              <li key={`${String(index)}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <ChartExportDialog
        open={exportOpen}
        title={title}
        disabled={false}
        canvas={canvasRef}
        onClose={() => {
          setExportOpen(false);
        }}
      />
    </section>
  );
}
