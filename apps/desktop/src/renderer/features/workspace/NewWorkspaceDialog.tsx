import { useEffect, useState } from 'react';

import type { AppError } from '@curve/domain';
import { joinPathLike, workspaceFolderName } from '@curve/persistence';
import { Button, Dialog, Input } from '@curve/ui';

import { APP_NAME } from '../../../shared/brand';
import { useWorkspaceController } from '../../app-core/use-workspace-controller';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

export interface NewWorkspaceDialogProps {
  open: boolean;
  documentsDir?: string;
  onClose: () => void;
}

function defaultParent(documentsDir: string | undefined): string {
  if (documentsDir === undefined || documentsDir.trim().length === 0) {
    return '';
  }
  return joinPathLike(documentsDir, APP_NAME);
}

export function NewWorkspaceDialog({
  open,
  documentsDir,
  onClose,
}: NewWorkspaceDialogProps): ReactElement {
  const { t } = useI18n();
  const controller = useWorkspaceController();
  const [name, setName] = useState('');
  const [parent, setParent] = useState(defaultParent(documentsDir));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setParent(defaultParent(documentsDir));
      setError(null);
      setBusy(false);
    }
  }, [documentsDir, open]);

  const submit = async (): Promise<void> => {
    if (name.trim().length === 0) {
      setError(t('workspace.new.nameRequired'));
      return;
    }
    setBusy(true);
    const failure: AppError | null = await controller.createWorkspace(parent, name);
    setBusy(false);
    if (failure !== null) {
      setError(describeAppError(failure, t));
      return;
    }
    onClose();
  };

  const folder = workspaceFolderName(name);
  const target = parent.length === 0 || folder.length === 0 ? parent : joinPathLike(parent, folder);

  return (
    <Dialog
      open={open}
      title={t('workspace.new.title')}
      description={t('workspace.new.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {t('workspace.new.create')}
          </Button>
        </>
      }
    >
      <Input
        label={t('workspace.new.name')}
        value={name}
        autoFocus
        placeholder={t('workspace.new.namePlaceholder')}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <div className="cs-location">
        <Input
          className="cs-location__input"
          label={t('workspace.new.parent')}
          value={parent}
          onChange={(event) => {
            setParent(event.target.value);
          }}
        />
        <Button
          variant="secondary"
          onClick={() => {
            void controller
              .pickDirectory(t('workspace.new.browse'), parent.length === 0 ? undefined : parent)
              .then((path) => {
                if (path !== null) {
                  setParent(path);
                }
              });
          }}
        >
          {t('workspace.new.browse')}
        </Button>
      </div>
      {target.length === 0 ? null : (
        <p className="cs-dialog__hint">{t('workspace.new.parentHint', { path: target })}</p>
      )}
      {error === null ? null : (
        <p className="cs-dialog__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
