import { useAppState } from '../app-core/use-app-core';
import { ColumnsPanel } from '../features/columns/ColumnsPanel';
import { useI18n } from '../i18n';

import type { ReactElement } from 'react';

const FACT_KEYS = ['selection', 'source', 'style'] as const;

/** Right panel: the active table's column manager, or an empty-state hint. */
export function Inspector(): ReactElement {
  const { t } = useI18n();
  const activeTableId = useAppState((state) => state.ui.activeTableId);
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
      {activeTableId !== null && hasTable ? (
        <ColumnsPanel tableId={activeTableId} />
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
