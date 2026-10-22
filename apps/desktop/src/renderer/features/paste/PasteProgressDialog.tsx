import type { PasteProgress } from '@curve/app-core';
import { Button, Dialog } from '@curve/ui';

import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

export interface PasteProgressDialogProps {
  open: boolean;
  progress: PasteProgress;
  phase: 'validating' | 'saving';
  onCancel: () => void;
}

/**
 * Cancellable progress for matrices of 10,000 cells or more (SPEC §9.3).
 *
 * Cancel is only available while validating. After the command is dispatched
 * the state has changed and the save queue cannot be cancelled without losing
 * the user's data, so the dialog switches to a non-cancellable “saving” state.
 */
export function PasteProgressDialog({
  open,
  progress,
  phase,
  onCancel,
}: PasteProgressDialogProps): ReactElement {
  const { t } = useI18n();
  const max = Math.max(1, progress.total);
  const value = Math.min(Math.max(0, progress.done), max);
  const percent = progress.total === 0 ? 0 : Math.round((value / progress.total) * 100);
  const cancelling = phase === 'saving';

  return (
    <Dialog
      open={open}
      title={t('paste.progress.title')}
      closeLabel={t('common.close')}
      dismissOnBackdrop={false}
      onClose={cancelling ? () => undefined : onCancel}
      className="cs-paste-progress-dialog"
      footer={
        <Button
          variant="secondary"
          data-testid="paste-progress-cancel"
          disabled={cancelling}
          onClick={onCancel}
        >
          {t('paste.progress.cancel')}
        </Button>
      }
    >
      <div className="cs-paste-progress" data-testid="paste-progress-dialog">
        <progress
          className="cs-paste-progress__bar"
          value={value}
          max={max}
          aria-label={t('paste.progress.title')}
        />
        <p className="cs-paste-progress__text" aria-live="polite">
          {phase === 'saving'
            ? t('paste.progress.saving')
            : t('paste.progress.validating', {
                done: progress.done,
                total: progress.total,
              })}
        </p>
        <p className="cs-paste-progress__percent">{t('paste.progress.percent', { percent })}</p>
      </div>
    </Dialog>
  );
}
