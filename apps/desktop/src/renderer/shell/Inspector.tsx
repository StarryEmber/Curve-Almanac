import { Tabs } from '@curve/ui';

import { useAppState } from '../app-core/use-app-core';
import { ChartInspector } from '../features/charts/ChartInspector';
import { ColumnsPanel } from '../features/columns/ColumnsPanel';
import { StylePanel } from '../features/style/StylePanel';
import { useI18n } from '../i18n';

import type { ReactElement } from 'react';

const FACT_KEYS = ['selection', 'source', 'style'] as const;

/**
 * Right panel: chart inspector for chart views, the active table's column/style
 * tabs for table views, or an empty-state hint.
 */
export function Inspector(): ReactElement {
  const { t } = useI18n();
  const activeTableId = useAppState((state) => state.ui.activeTableId);
  const activeViewId = useAppState((state) => state.ui.activeViewId);
  const activeView = useAppState((state) =>
    activeViewId === null ? undefined : state.views[activeViewId],
  );
  const chart = useAppState((state) =>
    activeView?.kind === 'chart' ? state.charts[activeView.refId] : undefined,
  );
  const chartTable = useAppState((state) =>
    chart === undefined ? undefined : state.tables[chart.tableId],
  );
  const hasTable = useAppState((state) =>
    activeTableId === null ? false : state.tables[activeTableId] !== undefined,
  );

  return (
    <aside
      className="cs-app__inspector"
      aria-label={t('shell.inspector.title')}
      data-testid="inspector"
    >
      <h2 className="cs-inspector__title">{t('shell.inspector.title')}</h2>
      {chart !== undefined && chartTable !== undefined ? (
        <ChartInspector chart={chart} table={chartTable.table} rowCount={chartTable.rows.length} />
      ) : activeTableId !== null && hasTable ? (
        <Tabs
          label={t('shell.inspector.title')}
          className="cs-inspector__tabs"
          tabs={[
            {
              id: 'columns',
              label: t('columns.label'),
              content: <ColumnsPanel tableId={activeTableId} />,
            },
            {
              id: 'style',
              label: t('style.tab'),
              content: <StylePanel />,
            },
          ]}
        />
      ) : (
        <>
          <p className="cs-inspector__empty">{t('shell.inspector.empty')}</p>
          <dl className="cs-inspector__facts">
            {FACT_KEYS.map((key) => (
              <div className="cs-inspector__fact" key={key}>
                <dt>{t(`shell.inspector.${key}`)}</dt>
                <dd>{t('shell.inspector.none')}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </aside>
  );
}
