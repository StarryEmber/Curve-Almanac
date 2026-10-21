import { findMissingChartColumns } from '@curve/app-core';
import type { ViewDef } from '@curve/domain';

import { useAppState } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

/**
 * Minimal chart view surface until M3 (T3.1) adds the real renderer (T2.3, Q4).
 *
 * It exists so a chart whose mapped column was deleted has a visible, testable
 * "column deleted / remap" error state instead of falling through to the empty
 * workspace or crashing. No chart option code is built here.
 */
export function ChartPlaceholder({ view }: { view: ViewDef }): ReactElement {
  const { t } = useI18n();
  const chart = useAppState((state) => state.charts[view.refId]);
  const table = useAppState((state) =>
    chart === undefined ? undefined : state.tables[chart.tableId]?.table,
  );
  const missing =
    chart === undefined || table === undefined ? [] : findMissingChartColumns(chart, table);
  const broken = chart === undefined || table === undefined || missing.length > 0;

  return (
    <section
      className="cs-chart-placeholder"
      data-testid="chart-placeholder"
      aria-label={view.title}
      role={broken ? 'alert' : 'status'}
    >
      <h2 className="cs-chart-placeholder__title">{view.title}</h2>
      {chart === undefined || table === undefined ? (
        <p className="cs-chart-placeholder__error">{t('chart.placeholder.missingTable')}</p>
      ) : null}
      {missing.length > 0 ? (
        <>
          <p className="cs-chart-placeholder__error">
            {t('chart.placeholder.missingColumns', { columns: missing.join(', ') })}
          </p>
          <p className="cs-chart-placeholder__hint">{t('chart.placeholder.remapHint')}</p>
        </>
      ) : null}
      {broken ? null : (
        <p className="cs-chart-placeholder__body">{t('chart.placeholder.pending')}</p>
      )}
    </section>
  );
}
