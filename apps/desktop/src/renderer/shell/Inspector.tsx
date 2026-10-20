import { useI18n } from '../i18n';

import type { ReactElement } from 'react';

const FACT_KEYS = ['selection', 'source', 'style'] as const;

/** Right panel: properties of the current selection. Empty until T1.x adds selection. */
export function Inspector(): ReactElement {
  const { t } = useI18n();

  return (
    <aside
      className="cs-app__inspector"
      aria-label={t('shell.inspector.title')}
      data-testid="inspector"
    >
      <h2 className="cs-inspector__title">{t('shell.inspector.title')}</h2>
      <p className="cs-inspector__empty">{t('shell.inspector.empty')}</p>
      <dl className="cs-inspector__facts">
        {FACT_KEYS.map((key) => (
          <div className="cs-inspector__fact" key={key}>
            <dt>{t(`shell.inspector.${key}`)}</dt>
            <dd>{t('shell.inspector.none')}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
