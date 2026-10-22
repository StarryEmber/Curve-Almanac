import type { PasteColumnDraft, PasteColumnType } from '@curve/app-core';
import { Button, Dialog, Input, Select } from '@curve/ui';

import { useI18n } from '../../i18n';

import type { ReactElement } from 'react';

export interface PasteColumnsDialogProps {
  open: boolean;
  count: number;
  drafts: readonly PasteColumnDraft[];
  existingColumnCount: number;
  maxColumns: number;
  busy: boolean;
  error: string | null;
  onChange: (index: number, patch: Partial<PasteColumnDraft>) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const TYPE_OPTIONS: ReadonlyArray<{
  value: PasteColumnType;
  key: 'text' | 'number' | 'date' | 'boolean';
}> = [
  { value: 'text', key: 'text' },
  { value: 'number', key: 'number' },
  { value: 'date', key: 'date' },
  { value: 'boolean', key: 'boolean' },
];

/**
 * Confirmation for a paste wider than the current table (SPEC §9.3).
 *
 * New columns are optional and default to text; the label and storage type can
 * be changed here. The dialog never dispatches: it only collects drafts, which
 * `createPasteColumns` turns into schema with the same rules as the T2.3 form.
 */
export function PasteColumnsDialog({
  open,
  count,
  drafts,
  existingColumnCount,
  maxColumns,
  busy,
  error,
  onChange,
  onConfirm,
  onClose,
}: PasteColumnsDialogProps): ReactElement {
  const { t } = useI18n();
  const limitExceeded = existingColumnCount + count > maxColumns;
  const typeOptions = TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`columns.type.${option.key}`),
  }));

  return (
    <Dialog
      open={open}
      title={t('paste.columns.title', { count })}
      description={t('paste.columns.body')}
      closeLabel={t('common.close')}
      onClose={busy ? () => undefined : onClose}
      className="cs-paste-columns-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            data-testid="paste-columns-confirm"
            disabled={busy || limitExceeded || drafts.length !== count}
            onClick={onConfirm}
          >
            {t('paste.columns.confirm')}
          </Button>
        </>
      }
    >
      <div className="cs-paste-columns" data-testid="paste-columns-dialog">
        {limitExceeded ? (
          <p className="cs-dialog__error" role="alert">
            {t('paste.columns.limit', { columns: existingColumnCount, added: count })}
          </p>
        ) : null}
        <ul className="cs-paste-columns__list">
          {drafts.map((draft, index) => (
            <li className="cs-paste-columns__row" key={index}>
              <Input
                label={`${t('paste.columns.name')} ${String(index + 1)}`}
                value={draft.label}
                maxLength={80}
                data-testid={`paste-column-label-${String(index)}`}
                onChange={(event) => {
                  onChange(index, { label: event.target.value });
                }}
              />
              <Select
                label={`${t('paste.columns.type')} ${String(index + 1)}`}
                options={typeOptions}
                value={draft.type}
                data-testid={`paste-column-type-${String(index)}`}
                onChange={(event) => {
                  onChange(index, { type: event.target.value as PasteColumnType });
                }}
              />
            </li>
          ))}
        </ul>
        {error === null ? null : (
          <p className="cs-dialog__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
