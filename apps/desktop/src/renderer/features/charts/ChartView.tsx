/**
 * Chart view surface (T4.4).
 *
 * Resolves the persisted `ChartSpec` into a `RenderModel`, renders it through
 * `ChartCanvas` and keeps every SPEC §11.3 warning visible. A chart whose
 * mapped column was deleted (or whose mapping became type-incompatible) shows an
 * actionable error state with the same mapping editor the inspector uses
 * (SPEC §6.6.4: no crash, remap required).
 */

import { useMemo } from 'react';

import { isEmptyModel } from '@curve/chart-echarts';
import type { ChartMapping, ViewDef } from '@curve/domain';

import { useAppState } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';

import { chartKindLabel, mappingIssueLabel, mappingPathLabel } from './chart-text';
import { chartRenderStatus } from './chart-view-model';
import { ChartCanvas } from './ChartCanvas';
import { ChartMappingFields } from './ChartMappingFields';
import { useChartEditor } from './use-chart-editor';

import type { ReactElement } from 'react';

export function ChartView({ view }: { view: ViewDef }): ReactElement {
  const { t, locale } = useI18n();
  const { resolved } = useTheme();
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

  const title = chart?.title ?? view.title;

  if (status.kind === 'missing-chart' || status.kind === 'missing-table') {
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
            : t('chart.view.missingTable')}
        </p>
      </section>
    );
  }

  if (status.kind === 'error') {
    return (
      <section
        className="cs-chart-view"
        data-testid="chart-view"
        data-chart-state="error"
        aria-label={title}
      >
        <header className="cs-chart-view__header">
          <h2 className="cs-chart-view__title">{title}</h2>
        </header>
        <p className="cs-chart-view__error" role="alert" data-testid="chart-error">
          {t('chart.view.error', { message: status.message })}
        </p>
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
        <div className="cs-chart-view__remap" data-testid="chart-remap">
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
      </section>
    );
  }

  const { model } = status;
  const sampledBadge = model.meta.sampled ? (
    <span className="cs-chart-view__badge" data-testid="chart-sampled-badge">
      {t('chart.view.sampled')}
    </span>
  ) : null;

  return (
    <section
      className="cs-chart-view"
      data-testid="chart-view"
      data-chart-state="ready"
      data-chart-kind={model.kind}
      data-chart-layout={chart.mapping.layout}
      data-chart-x-type={model.x.type}
      data-chart-x-label={model.x.label ?? ''}
      data-chart-y-label={model.y?.label ?? ''}
      data-chart-series-count={model.series.length}
      data-chart-series={model.series.map((series) => series.name).join('|')}
      data-chart-source-points={model.meta.sourcePoints}
      data-chart-rendered-points={model.meta.renderedPoints}
      data-chart-sampled={model.meta.sampled ? 'true' : 'false'}
      data-chart-palette={model.style.palette[0] ?? ''}
      data-chart-background={model.style.background}
      data-chart-legend={model.style.legend}
      data-chart-show-grid={model.style.showGrid ? 'true' : 'false'}
      data-chart-smooth={model.style.smooth ? 'true' : 'false'}
      data-chart-show-symbol={model.style.showSymbol ? 'true' : 'false'}
      data-chart-line-width={model.style.lineWidth}
      data-chart-number-digits={model.style.numberDigits}
      data-chart-y-start-at-zero={model.style.yStartAtZero ? 'true' : 'false'}
      aria-label={title}
    >
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

      {isEmptyModel(model) ? (
        <p className="cs-chart-view__empty" data-testid="chart-empty">
          {t('chart.view.empty')}
        </p>
      ) : null}

      <ChartCanvas
        model={model}
        label={t('chart.view.ariaLabel', { title })}
        testId="chart-canvas"
      />

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
    </section>
  );
}
