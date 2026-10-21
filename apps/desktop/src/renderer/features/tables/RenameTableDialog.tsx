import { useEffect, useState } from 'react';

import { Button, Dialog, Input } from '@curve/ui';

import { useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

export interface RenameTableDialogProps {
  open: boolean;
  tableId: string | null;
  initialName: string;
  onClose: () => void;
}

export function RenameTableDialog({
  open,
  tableId,
  initialName,
  onClose,
}: RenameTableDialogProps): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
      setBusy(false);
    }
  }, [initialName, open]);

  const submit = async (): Promise<void> => {
    if (tableId === null || name.trim().length === 0) {
      setError(t('tables.rename.name'));
      return;
    }
    setBusy(true);
    const result = await core.actions.renameTable(tableId, name);
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
      title={t('tables.rename.title')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {t('tables.rename.save')}
          </Button>
        </>
      }
    >
      <Input
        label={t('tables.rename.name')}
        value={name}
        autoFocus
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      {error === null ? null : (
        <p className="cs-dialog__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
