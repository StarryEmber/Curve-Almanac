import type { ColumnChangeInspection } from '@curve/app-core';
import { Button, Dialog } from '@curve/ui';

import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { columnFailureReasonText, columnFailureValueText } from './column-error-text';

import type { MessageKey } from '../../i18n';
import type { ReactElement } from 'react';

export type ColumnChangeIntent = 'delete' | 'update' | 'primary-key';

const TITLE_KEYS: Record<ColumnChangeIntent, MessageKey> = {
  delete: 'columns.change.deleteTitle',
  update: 'columns.change.updateTitle',
  'primary-key': 'columns.change.primaryKeyTitle',
};

const BODY_KEYS: Record<ColumnChangeIntent, MessageKey> = {
  delete: 'columns.change.deleteBody',
  update: 'columns.change.updateBody',
  'primary-key': 'columns.change.primaryKeyBody',
};

const CONFIRM_KEYS: Record<ColumnChangeIntent, MessageKey> = {
  delete: 'columns.change.confirmDelete',
  update: 'columns.change.confirmUpdate',
  'primary-key': 'columns.change.confirmPrimaryKey',
};

export interface ColumnChangeDialogProps {
  open: boolean;
  intent: ColumnChangeIntent;
  columnName: string;
  inspection: ColumnChangeInspection | null;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Shared destructive/structure confirmation for column delete, type/required/
 * enum updates and primary-key changes (T2.3, Q5).
 *
 * When the inspection has row failures the confirm button is disabled and the
 * first 100 problematic rows are listed; nothing has been dispatched at that
 * point, so cancelling leaves memory and disk untouched.
 */
export function ColumnChangeDialog({
  open,
  intent,
  columnName,
  inspection,
  busy,
  error,
  onConfirm,
  onClose,
}: ColumnChangeDialogProps): ReactElement {
  const { t } = useI18n();
  const failed = inspection !== null && !inspection.ok;
  const summary = inspection !== null && inspection.ok ? inspection.summary : null;
  const failures = inspection !== null && !inspection.ok ? inspection.failures : [];
  const totalFailures = inspection !== null && !inspection.ok ? inspection.totalFailures : 0;
  const blocked = failed && failures.length === 0;

  const title = failed
    ? t('columns.change.failureTitle', { name: columnName })
    : t(TITLE_KEYS[intent], { name: columnName });

  return (
    <Dialog
      open={open}
      title={title}
      description={t(BODY_KEYS[intent])}
      closeLabel={t('common.close')}
      onClose={onClose}
      className="cs-column-change-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={intent === 'delete' ? 'danger' : 'primary'}
            disabled={busy || failed}
            data-testid="column-change-confirm"
            onClick={onConfirm}
          >
            {t(CONFIRM_KEYS[intent])}
          </Button>
        </>
      }
    >
      <div className="cs-column-change" data-testid="column-change-dialog">
        {summary === null ? null : (
          <ul className="cs-column-change__summary">
            <li>{t('columns.change.rows', { rows: summary.affectedRows })}</li>
            {summary.convertedCells > 0 ? (
              <li>{t('columns.change.cells', { cells: summary.convertedCells })}</li>
            ) : null}
            {summary.viewUpdates > 0 ? (
              <li>{t('columns.change.views', { views: summary.viewUpdates })}</li>
            ) : null}
            {summary.invalidCharts > 0 ? (
              <li>{t('columns.change.charts', { charts: summary.invalidCharts })}</li>
            ) : null}
          </ul>
        )}

        {summary !== null && summary.invalidCharts > 0 ? (
          <p className="cs-dialog__notice" role="note">
            {t('columns.change.chartsWarning')}
          </p>
        ) : null}

        {failed ? (
          <>
            {failures.length > 0 ? (
              <>
                <h3 className="cs-column-change__failures-title">
                  {t('columns.change.failuresTitle', {
                    shown: failures.length,
                    total: totalFailures,
                  })}
                </h3>
                <ul className="cs-column-change__failures" data-testid="column-change-failures">
                  {failures.map((failure, index) => (
                    <li key={`${failure.rowId}-${String(index)}`}>
                      {t('columns.failure.row', {
                        row: failure.rowNumber,
                        value: columnFailureValueText(failure.value, t),
                        reason: columnFailureReasonText(failure.code, t),
                      })}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="cs-dialog__error" role="alert">
              {t('columns.change.blocked')}
            </p>
            {blocked ? (
              <p className="cs-dialog__hint">
                {describeAppError(
                  inspection !== null && !inspection.ok
                    ? inspection.error
                    : { code: 'E_UNKNOWN', message: 'inspection unavailable' },
                  t,
                )}
              </p>
            ) : null}
          </>
        ) : null}

        {error === null ? null : (
          <p className="cs-dialog__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
