import { useEffect, useMemo, useState } from 'react';

import { countTableReferences } from '@curve/app-core';
import { Button, Dialog } from '@curve/ui';

import { useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

export interface DeleteTableDialogProps {
  open: boolean;
  tableId: string | null;
  tableName: string;
  onClose: () => void;
}

export function DeleteTableDialog({
  open,
  tableId,
  tableName,
  onClose,
}: DeleteTableDialogProps): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    if (!open || tableId === null) {
      return { views: 0, charts: 0 };
    }
    return countTableReferences(core.store.getState(), tableId);
  }, [core, open, tableId]);

  useEffect(() => {
    if (open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const confirm = async (): Promise<void> => {
    if (tableId === null) {
      return;
    }
    setBusy(true);
    const result = await core.actions.deleteTable(tableId);
    setBusy(false);
    if (!result.ok) {
      setError(describeAppError(result.error, t));
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={t('tables.delete.title')}
      description={t('tables.delete.body', { name: tableName })}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
            {t('tables.delete.confirm')}
          </Button>
        </>
      }
    >
      {counts.views > 0 || counts.charts > 0 ? (
        <p className="cs-dialog__notice" role="note">
          {t('tables.delete.references', { views: counts.views, charts: counts.charts })}
        </p>
      ) : null}
      {error === null ? null : (
        <p className="cs-dialog__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
