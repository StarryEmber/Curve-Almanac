import { useEffect, useState } from 'react';

import { Button, Dialog, Input } from '@curve/ui';

import { useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

export interface NewTableDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewTableDialog({ open, onClose }: NewTableDialogProps): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const [name, setName] = useState('');
  const [primaryKey, setPrimaryKey] = useState('id');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setPrimaryKey('id');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async (): Promise<void> => {
    if (name.trim().length === 0) {
      setError(t('tables.new.name'));
      return;
    }
    setBusy(true);
    const result = await core.actions.createTable(name, primaryKey);
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
      title={t('tables.new.title')}
      description={t('tables.new.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {t('tables.new.create')}
          </Button>
        </>
      }
    >
      <Input
        label={t('tables.new.name')}
        value={name}
        autoFocus
        placeholder={t('tables.new.namePlaceholder')}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <Input
        label={t('tables.new.primaryKey')}
        value={primaryKey}
        hint={t('tables.new.primaryKeyHint')}
        onChange={(event) => {
          setPrimaryKey(event.target.value);
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
