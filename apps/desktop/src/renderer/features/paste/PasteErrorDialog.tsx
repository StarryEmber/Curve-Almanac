import type { PasteIssue } from '@curve/app-core';
import { Button, Dialog } from '@curve/ui';

import { useI18n } from '../../i18n';

import { describePasteIssue } from './paste-issue-text';

import type { ReactElement } from 'react';

export interface PasteErrorDialogProps {
  open: boolean;
  title: string;
  body: string;
  issues: readonly PasteIssue[];
  totalIssues: number;
  columnLabels: ReadonlyMap<string, string>;
  canLocate: boolean;
  locateHint?: string;
  onLocate: () => void;
  onClose: () => void;
}

/**
 * Lists the first 100 paste problems and offers to jump to the first one.
 *
 * The document was not touched: the planner is all-or-nothing, so closing this
 * dialog leaves the grid exactly as it was and the user can fix cells and paste
 * again.
 */
export function PasteErrorDialog({
  open,
  title,
  body,
  issues,
  totalIssues,
  columnLabels,
  canLocate,
  locateHint,
  onLocate,
  onClose,
}: PasteErrorDialogProps): ReactElement {
  const { t } = useI18n();

  return (
    <Dialog
      open={open}
      title={title}
      description={body}
      closeLabel={t('common.close')}
      onClose={onClose}
      className="cs-paste-error-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            variant="primary"
            data-testid="paste-locate-error"
            disabled={!canLocate}
            onClick={onLocate}
          >
            {t('paste.error.locate')}
          </Button>
        </>
      }
    >
      <div className="cs-paste-errors" data-testid="paste-error-dialog">
        {issues.length === 0 ? null : (
          <>
            <h3 className="cs-paste-errors__title">
              {t('paste.error.failuresTitle', { shown: issues.length, total: totalIssues })}
            </h3>
            <ul className="cs-paste-errors__list" data-testid="paste-error-list">
              {issues.map((issue, index) => (
                <li
                  key={`${String(issue.matrixRow)}-${String(issue.matrixColumn)}-${String(index)}`}
                >
                  {describePasteIssue(issue, {
                    t,
                    ...(issue.columnId === undefined
                      ? {}
                      : { columnLabel: columnLabels.get(issue.columnId) ?? issue.columnId }),
                  })}
                </li>
              ))}
            </ul>
            {canLocate || locateHint === undefined ? null : (
              <p className="cs-dialog__hint">{locateHint}</p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
