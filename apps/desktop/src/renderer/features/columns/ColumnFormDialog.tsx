import { useEffect, useRef, useState } from 'react';

import { checkColumnDraft } from '@curve/app-core';
import type { ColumnDraft, ColumnDraftIssue } from '@curve/app-core';
import type { ColumnDef, ColumnRole, ColumnType, TableMeta } from '@curve/domain';
import { Button, Dialog, Input, Select } from '@curve/ui';

import { useI18n } from '../../i18n';
import { listFieldTypes } from '../../plugins';

import { columnIssueText } from './column-error-text';
import {
  COLUMN_ROLES,
  COLUMN_TYPES,
  draftFromColumn,
  keyFromLabel,
  newColumnDraft,
} from './column-form';

import type { ReactElement } from 'react';

export type ColumnFormSubmitResult =
  | { kind: 'done' }
  | { kind: 'confirm' }
  | { kind: 'issues'; issues: readonly ColumnDraftIssue[] }
  | { kind: 'error'; message: string };

export interface ColumnFormDialogProps {
  open: boolean;
  mode: 'add' | 'edit';
  table: TableMeta;
  column?: ColumnDef;
  onClose: () => void;
  onRequestDelete?: (column: ColumnDef) => void;
  onRequestPrimaryKey?: (column: ColumnDef) => void;
  onSubmit: (draft: ColumnDraft, column: ColumnDef) => Promise<ColumnFormSubmitResult>;
}

/**
 * Add/edit form for one column (T2.3).
 *
 * The form owns field-level validation via `checkColumnDraft`; the panel owns
 * the destructive confirmation and the command dispatch. Add and metadata-only
 * edits go straight to the panel; type/required/enum changes come back as
 * `{ kind: 'confirm' }` so the panel can show the affected-row dialog first.
 */
export function ColumnFormDialog({
  open,
  mode,
  table,
  column,
  onClose,
  onRequestDelete,
  onRequestPrimaryKey,
  onSubmit,
}: ColumnFormDialogProps): ReactElement {
  const { t } = useI18n();
  const [form, setForm] = useState<ColumnDraft>(() =>
    column === undefined ? newColumnDraft(table) : draftFromColumn(column),
  );
  const [keyTouched, setKeyTouched] = useState(mode === 'edit');
  const [issues, setIssues] = useState<readonly ColumnDraftIssue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initialized = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      initialized.current = null;
      return;
    }
    const key = `${mode}:${column?.id ?? 'new'}`;
    if (initialized.current === key) {
      return;
    }
    initialized.current = key;
    setForm(column === undefined ? newColumnDraft(table) : draftFromColumn(column));
    setKeyTouched(mode === 'edit');
    setIssues([]);
    setFormError(null);
    setBusy(false);
  }, [open, mode, column, table]);

  const existingKeys = table.columns.map((entry) => entry.key);
  const issueFor = (field: ColumnDraftIssue['field']): ColumnDraftIssue | undefined =>
    issues.find((issue) => issue.field === field);

  const update = (patch: Partial<ColumnDraft>): void => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const changeType = (type: ColumnType): void => {
    setForm((current) => {
      // A semantic type must store the column's type (ADR-015), so changing the
      // storage type clears it; the select only offers compatible field types.
      if (type === 'enum') {
        return {
          ...current,
          type,
          fieldTypeId: null,
          enumOptions:
            current.enumOptions === undefined || current.enumOptions.length === 0
              ? [{ value: '', label: '' }]
              : current.enumOptions,
        };
      }
      const rest: ColumnDraft = { ...current };
      delete rest.enumOptions;
      return { ...rest, type, fieldTypeId: null };
    });
  };

  const submit = async (): Promise<void> => {
    setFormError(null);
    setIssues([]);
    if (mode === 'add' && form.required === true && table.rowCount > 0) {
      setFormError(t('columns.error.requiredNonEmpty'));
      return;
    }
    const columnId = mode === 'edit' && column !== undefined ? column.id : 'col_draft';
    const checked = checkColumnDraft(table, form, columnId);
    if (!checked.ok) {
      setIssues(checked.issues);
      return;
    }

    setBusy(true);
    try {
      const result = await onSubmit(draftFromColumn(checked.column), checked.column);
      if (result.kind === 'issues') {
        setIssues(result.issues);
        return;
      }
      if (result.kind === 'error') {
        setFormError(result.message);
        return;
      }
      if (result.kind === 'done') {
        onClose();
      }
      // `confirm`: the panel has already replaced this dialog with the
      // confirmation dialog; do not close it here or the confirm state is lost.
    } finally {
      setBusy(false);
    }
  };

  const enumOptions = form.enumOptions ?? [];
  const labelIssue = issueFor('label');
  const keyIssue = issueFor('key');
  const typeIssue = issueFor('type');
  const unitIssue = issueFor('unit');
  const precisionIssue = issueFor('precision');
  const formIssue = issueFor('form');
  const enumError = issueFor('enumOptions');
  const isPrimaryKey = column !== undefined && column.id === table.primaryKey;

  // T6.2: semantic field types come from the plugin host registry; only those
  // storing the selected storage type can be applied (ADR-015).
  const selectedFieldTypeId = form.fieldTypeId ?? '';
  const compatibleFieldTypes = listFieldTypes().filter(
    (entry) => entry.def.storageType === form.type,
  );
  const unknownFieldType =
    selectedFieldTypeId !== '' &&
    !compatibleFieldTypes.some((entry) => entry.id === selectedFieldTypeId);
  const showFieldType = compatibleFieldTypes.length > 0 || unknownFieldType;
  const fieldTypeOptions = [
    { value: '', label: t('columns.form.fieldTypeNone') },
    ...compatibleFieldTypes.map((entry) => ({ value: entry.id, label: entry.def.label })),
    ...(unknownFieldType ? [{ value: selectedFieldTypeId, label: selectedFieldTypeId }] : []),
  ];

  return (
    <Dialog
      open={open}
      title={mode === 'add' ? t('columns.form.addTitle') : t('columns.form.editTitle')}
      description={t('columns.form.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      className="cs-column-form-dialog"
      footer={
        <>
          {mode === 'edit' && column !== undefined && !isPrimaryKey && column.type === 'text' ? (
            <Button
              variant="ghost"
              data-testid="column-form-primary-key"
              onClick={() => {
                onRequestPrimaryKey?.(column);
              }}
            >
              {t('columns.form.makePrimaryKey')}
            </Button>
          ) : null}
          {mode === 'edit' && column !== undefined && !isPrimaryKey ? (
            <Button
              variant="ghost"
              className="cs-dialog__danger-action"
              data-testid="column-form-delete"
              onClick={() => {
                onRequestDelete?.(column);
              }}
            >
              {t('columns.form.delete')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            data-testid="column-form-submit"
            onClick={() => void submit()}
          >
            {mode === 'add' ? t('columns.form.create') : t('columns.form.save')}
          </Button>
        </>
      }
    >
      <div className="cs-column-form" data-testid="column-form">
        <Input
          label={t('columns.form.label')}
          value={form.label}
          autoFocus
          error={labelIssue === undefined ? undefined : columnIssueText(labelIssue, t)}
          onChange={(event) => {
            const label = event.target.value;
            setForm((current) => ({
              ...current,
              label,
              ...(mode === 'add' && !keyTouched ? { key: keyFromLabel(label, existingKeys) } : {}),
            }));
          }}
        />
        <Input
          label={t('columns.form.key')}
          value={form.key}
          hint={t('columns.form.keyHint')}
          error={keyIssue === undefined ? undefined : columnIssueText(keyIssue, t)}
          onChange={(event) => {
            setKeyTouched(true);
            update({ key: event.target.value });
          }}
        />
        <div className="cs-column-form__row">
          <Select
            label={t('columns.form.type')}
            value={form.type}
            options={COLUMN_TYPES.map((type) => ({
              value: type,
              label: t(`columns.type.${type}`),
            }))}
            disabled={isPrimaryKey}
            error={typeIssue === undefined ? undefined : columnIssueText(typeIssue, t)}
            onChange={(event) => {
              changeType(event.target.value as ColumnType);
            }}
          />
          <Select
            label={t('columns.form.role')}
            value={form.role}
            options={COLUMN_ROLES.map((role) => ({
              value: role,
              label: t(`columns.role.${role}`),
            }))}
            onChange={(event) => {
              update({ role: event.target.value as ColumnRole });
            }}
          />
        </div>
        {isPrimaryKey ? (
          <p className="cs-dialog__hint">{t('columns.form.primaryKeyNote')}</p>
        ) : null}
        {showFieldType ? (
          <Select
            label={t('columns.form.fieldType')}
            hint={t('columns.form.fieldTypeHint')}
            data-testid="column-form-field-type"
            value={selectedFieldTypeId}
            options={fieldTypeOptions}
            disabled={isPrimaryKey}
            onChange={(event) => {
              const value = event.currentTarget.value;
              update({ fieldTypeId: value === '' ? null : value });
            }}
          />
        ) : null}

        <div className="cs-column-form__row">
          <Input
            label={t('columns.form.unit')}
            value={form.unit ?? ''}
            maxLength={16}
            error={unitIssue === undefined ? undefined : columnIssueText(unitIssue, t)}
            onChange={(event) => {
              update({
                ...(event.target.value.length === 0
                  ? { unit: undefined }
                  : { unit: event.target.value }),
              });
            }}
          />
          <Input
            label={t('columns.form.precision')}
            type="number"
            min={0}
            max={10}
            step={1}
            value={form.precision === undefined ? '' : String(form.precision)}
            hint={t('columns.form.precisionHint')}
            error={precisionIssue === undefined ? undefined : columnIssueText(precisionIssue, t)}
            onChange={(event) => {
              const raw = event.target.value;
              update({ precision: raw === '' ? undefined : Number(raw) });
            }}
          />
        </div>

        <label className="cs-column-form__check">
          <input
            type="checkbox"
            checked={form.required === true}
            onChange={(event) => {
              update({ required: event.target.checked });
            }}
          />
          <span>{t('columns.form.required')}</span>
        </label>

        {form.type === 'enum' ? (
          <fieldset className="cs-column-form__enum">
            <legend className="cs-field__label">{t('columns.form.enumOptions')}</legend>
            <ul className="cs-column-form__enum-list">
              {enumOptions.map((option, index) => (
                <li className="cs-column-form__enum-row" key={index}>
                  <input
                    className="cs-input"
                    aria-label={t('columns.form.enumValue', { index: index + 1 })}
                    placeholder={t('columns.form.enumValue', { index: index + 1 })}
                    value={option.value}
                    onChange={(event) => {
                      const next = enumOptions.map((entry, position) =>
                        position === index ? { ...entry, value: event.target.value } : entry,
                      );
                      update({ enumOptions: next });
                    }}
                  />
                  <input
                    className="cs-input"
                    aria-label={t('columns.form.enumLabel', { index: index + 1 })}
                    placeholder={t('columns.form.enumLabel', { index: index + 1 })}
                    value={option.label}
                    onChange={(event) => {
                      const next = enumOptions.map((entry, position) =>
                        position === index ? { ...entry, label: event.target.value } : entry,
                      );
                      update({ enumOptions: next });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    aria-label={t('columns.form.removeOption', { index: index + 1 })}
                    onClick={() => {
                      update({
                        enumOptions: enumOptions.filter((_entry, position) => position !== index),
                      });
                    }}
                  >
                    <span aria-hidden="true">×</span>
                  </Button>
                </li>
              ))}
            </ul>
            <div className="cs-column-form__enum-actions">
              <Button
                size="sm"
                variant="secondary"
                disabled={enumOptions.length >= 100}
                onClick={() => {
                  update({ enumOptions: [...enumOptions, { value: '', label: '' }] });
                }}
              >
                {t('columns.form.addOption')}
              </Button>
              {enumError === undefined ? null : (
                <p className="cs-field__error" role="alert">
                  {columnIssueText(enumError, t)}
                </p>
              )}
            </div>
          </fieldset>
        ) : null}

        {formIssue === undefined ? null : (
          <p className="cs-dialog__error" role="alert">
            {columnIssueText(formIssue, t)}
          </p>
        )}
        {formError === null ? null : (
          <p className="cs-dialog__error" role="alert">
            {formError}
          </p>
        )}
      </div>
    </Dialog>
  );
}
