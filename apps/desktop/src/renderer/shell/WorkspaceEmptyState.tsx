import { Button } from '@curve/ui';

import { useI18n } from '../i18n';

import { AppMark } from './icons';

import type { ReactElement } from 'react';

export interface WorkspaceEmptyStateProps {
  /** Workspace IPC lands in T1.2; until then the actions explain themselves. */
  onUnavailable: () => void;
}

export function WorkspaceEmptyState({ onUnavailable }: WorkspaceEmptyStateProps): ReactElement {
  const { t } = useI18n();

  return (
    <section className="cs-empty" aria-labelledby="cs-empty-title">
      <AppMark size={44} className="cs-empty__mark" />
      <h2 className="cs-empty__title" id="cs-empty-title">
        {t('shell.empty.title')}
      </h2>
      <p className="cs-empty__body">{t('shell.empty.body')}</p>
      <div className="cs-empty__actions">
        <Button variant="primary" onClick={onUnavailable}>
          {t('shell.empty.create')}
        </Button>
        <Button variant="secondary" onClick={onUnavailable}>
          {t('shell.empty.open')}
        </Button>
      </div>
    </section>
  );
}
