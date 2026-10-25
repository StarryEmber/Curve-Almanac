/**
 * Presentational dialogs for the chart list (T4.4): rename and delete.
 */

import { useEffect, useState } from 'react';

import type { ChartSpec } from '@curve/domain';
import { Button, Dialog, Input } from '@curve/ui';

import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

export interface RenameChartDialogProps {
  open: boolean;
  chart: ChartSpec | null;
  onClose: () => void;
  onSave: (title: string) => void;
}

export function RenameChartDialog({
  open,
  chart,
  onClose,
  onSave,
}: RenameChartDialogProps): ReactElement {
  const { t } = useI18n();
  const [title, setTitle] = useState(chart?.title ?? '');

  useEffect(() => {
    if (open) {
      setTitle(chart?.title ?? '');
    }
  }, [chart, open]);

  const trimmed = title.trim();
  const invalid = trimmed.length === 0 || trimmed.length > 80;

  return (
    <Dialog
      open={open && chart !== null}
      title={t('chart.rename.title')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={invalid}
            data-testid="chart-rename-save"
            onClick={() => {
              onSave(trimmed);
            }}
          >
            {t('chart.rename.save')}
          </Button>
        </>
      }
    >
      <Input
        label={t('chart.rename.label')}
        value={title}
        maxLength={80}
        data-testid="chart-rename-input"
        error={invalid ? t('chart.rename.empty') : undefined}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
      />
    </Dialog>
  );
}

export interface DeleteChartDialogProps {
  chart: ChartSpec | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteChartDialog({
  chart,
  busy,
  error,
  onClose,
  onConfirm,
}: DeleteChartDialogProps): ReactElement {
  const { t } = useI18n();
  return (
    <Dialog
      open={chart !== null}
      title={t('chart.delete.title')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            data-testid="chart-delete-confirm"
            onClick={onConfirm}
          >
            {busy ? t('chart.delete.busy') : t('chart.delete.confirm')}
          </Button>
        </>
      }
    >
      <p>{t('chart.delete.message', { title: chart?.title ?? '' })}</p>
      {error === null ? null : (
        <p className="cs-field__error" role="alert" data-testid="chart-delete-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
