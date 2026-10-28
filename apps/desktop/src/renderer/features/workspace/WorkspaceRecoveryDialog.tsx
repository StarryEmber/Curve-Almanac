import { useEffect, useState } from 'react';

import type { AppError } from '@curve/domain';
import type { WorkspaceInspection, WorkspaceRecoveryChoice } from '@curve/persistence';
import { Button, Dialog, Select } from '@curve/ui';

import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

export interface PendingRecovery {
  dir: string;
  inspection: WorkspaceInspection;
}

export interface WorkspaceRecoveryDialogProps {
  pending: PendingRecovery | null;
  busy: boolean;
  error: AppError | null;
  /** `undefined` means "open directly" (no backup rebuild). */
  onConfirm: (recovery?: WorkspaceRecoveryChoice) => void;
  onCancel: () => void;
}

function fileName(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index === -1 ? path : path.slice(index + 1);
}

/**
 * Crash-recovery prompt (T5.3, SPEC §7.5 / ADR-026).
 *
 * Two shapes:
 * - stale/corrupt `.lock`: "try recovery" vs "open directly";
 * - unreadable manifest: pick one of the `backups/manifest.*.json.bak` files
 *   and rebuild (the current manifest is backed up before the write).
 */
export function WorkspaceRecoveryDialog({
  pending,
  busy,
  error,
  onConfirm,
  onCancel,
}: WorkspaceRecoveryDialogProps): ReactElement | null {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState('');

  useEffect(() => {
    setSelected(pending?.inspection.backups[0]?.path ?? '');
  }, [pending]);

  if (pending === null) {
    return null;
  }

  const { inspection } = pending;
  const manifestMode = inspection.manifest !== 'ok';
  const name = inspection.name ?? t('workspace.recovery.unnamed');
  const backups = inspection.backups;
  const backupOptions = backups.map((backup) => ({
    value: backup.path,
    label: t('workspace.recovery.backupOption', {
      name: fileName(backup.path),
      date: new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(backup.createdAt),
      ),
      size: new Intl.NumberFormat(locale).format(backup.bytes),
    }),
  }));

  const footer = manifestMode ? (
    <>
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        disabled={busy || selected.length === 0}
        onClick={() => {
          onConfirm({ acceptStaleLock: true, manifestBackup: selected });
        }}
      >
        {t('workspace.recovery.rebuild')}
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          onConfirm();
        }}
      >
        {t('workspace.recovery.direct')}
      </Button>
      <Button
        variant="primary"
        disabled={busy}
        onClick={() => {
          onConfirm({ acceptStaleLock: true });
        }}
      >
        {t('workspace.recovery.try')}
      </Button>
    </>
  );

  return (
    <Dialog
      open
      className="cs-workspace-recovery"
      title={manifestMode ? t('workspace.recovery.manifestTitle') : t('workspace.recovery.title')}
      description={
        manifestMode
          ? t('workspace.recovery.manifestBody', { name })
          : t('workspace.recovery.lockBody', { name })
      }
      closeLabel={t('common.close')}
      onClose={onCancel}
      footer={footer}
    >
      <p className="cs-workspace-recovery__path">{pending.dir}</p>
      {manifestMode ? (
        backups.length === 0 ? (
          <p className="cs-workspace-recovery__empty">{t('workspace.recovery.noBackups')}</p>
        ) : (
          <Select
            label={t('workspace.recovery.backupLabel')}
            data-testid="recovery-backup-select"
            options={backupOptions}
            value={selected}
            disabled={busy}
            onChange={(event) => {
              setSelected(event.target.value);
            }}
          />
        )
      ) : (
        <p className="cs-workspace-recovery__lost">{t('workspace.recovery.lostEdits')}</p>
      )}
      {error === null ? null : (
        <p className="cs-dialog__error" role="alert">
          {describeAppError(error, t)}
        </p>
      )}
    </Dialog>
  );
}
