import { useEffect, useState } from 'react';

import { Button, Dialog, Input } from '@curve/ui';

import { useWorkspaceController } from '../../app-core/use-workspace-controller';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { useWorkspaceOpenFlow } from './workspace-open-flow';

import type { ReactElement } from 'react';

export interface OpenWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
}

export function OpenWorkspaceDialog({ open, onClose }: OpenWorkspaceDialogProps): ReactElement {
  const { t } = useI18n();
  const controller = useWorkspaceController();
  const openFlow = useWorkspaceOpenFlow();
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPath('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async (): Promise<void> => {
    if (path.trim().length === 0) {
      setError(t('workspace.open.pathRequired'));
      return;
    }
    setBusy(true);
    const failure = await openFlow.openWorkspace(path);
    setBusy(false);
    if (failure !== null) {
      setError(describeAppError(failure, t));
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={t('workspace.open.title')}
      description={t('workspace.open.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {t('workspace.open.open')}
          </Button>
        </>
      }
    >
      <div className="cs-location">
        <Input
          className="cs-location__input"
          label={t('workspace.open.location')}
          value={path}
          autoFocus
          onChange={(event) => {
            setPath(event.target.value);
          }}
        />
        <Button
          variant="secondary"
          onClick={() => {
            void controller.pickDirectory(t('workspace.open.pick')).then((picked) => {
              if (picked !== null) {
                setPath(picked);
              }
            });
          }}
        >
          {t('workspace.open.pick')}
        </Button>
      </div>
      {error === null ? null : (
        <p className="cs-dialog__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
