import { useEffect, useState } from 'react';

import type { AppError } from '@curve/domain';
import { Button } from '@curve/ui';

import { useWorkspaceController } from '../../app-core/use-workspace-controller';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { NewWorkspaceDialog } from './NewWorkspaceDialog';
import { OpenWorkspaceDialog } from './OpenWorkspaceDialog';

import type { RecentEntry } from '../../../shared/contracts/ipc';
import type { ReactElement } from 'react';

export interface WelcomePageProps {
  /** `app:info.documentsDir`; used only to suggest a default parent folder. */
  documentsDir?: string;
}

export function WelcomePage({ documentsDir }: WelcomePageProps): ReactElement {
  const { t, locale } = useI18n();
  const controller = useWorkspaceController();
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    let cancelled = false;
    void controller.listRecent().then((entries) => {
      if (!cancelled) {
        setRecent(entries);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [controller]);

  const open = (): void => {
    setOpenDialog(true);
  };

  const formatDate = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      date,
    );
  };

  return (
    <section className="cs-welcome" aria-labelledby="cs-welcome-title" data-testid="welcome">
      <h2 className="cs-welcome__title" id="cs-welcome-title">
        {t('workspace.welcome.title')}
      </h2>
      <p className="cs-welcome__body">{t('workspace.welcome.body')}</p>

      <div className="cs-welcome__actions">
        <Button
          variant="primary"
          onClick={() => {
            setNewOpen(true);
          }}
        >
          {t('workspace.welcome.new')}
        </Button>
        <Button variant="secondary" onClick={open}>
          {t('workspace.welcome.open')}
        </Button>
      </div>

      {error === null ? null : (
        <p className="cs-welcome__error" role="alert">
          {describeAppError(error, t)}
        </p>
      )}

      <section className="cs-welcome__recent" aria-labelledby="cs-welcome-recent-title">
        <h3 className="cs-welcome__recent-title" id="cs-welcome-recent-title">
          {t('workspace.welcome.recent')}
        </h3>
        {recent.length === 0 ? (
          <p className="cs-welcome__recent-empty">{t('workspace.welcome.recentEmpty')}</p>
        ) : (
          <ul className="cs-welcome__recent-list">
            {recent.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className="cs-welcome__recent-item"
                  data-testid="recent-workspace"
                  onClick={() => {
                    void controller.openWorkspace(entry.path).then((failure) => {
                      setError(failure);
                    });
                  }}
                >
                  <span className="cs-welcome__recent-name">{entry.name}</span>
                  <span className="cs-welcome__recent-path">{entry.path}</span>
                  <span className="cs-welcome__recent-date">{formatDate(entry.lastOpenedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NewWorkspaceDialog
        open={newOpen}
        documentsDir={documentsDir}
        onClose={() => {
          setNewOpen(false);
        }}
      />
      <OpenWorkspaceDialog
        open={openDialog}
        onClose={() => {
          setOpenDialog(false);
        }}
      />
    </section>
  );
}
