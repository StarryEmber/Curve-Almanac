import type { ImportColumnDraft } from '@curve/app-core';
import type { ColumnDef } from '@curve/domain';
import type {
  ImportDelimiter,
  ImportIssue,
  ImportStats,
  ImportColumnMapping,
  ImportedColumn,
} from '@curve/table-engine';
import { Button, Dialog, Input, Select } from '@curve/ui';

import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { importIssueText } from './import-issue-text';

import type { ImportPlanView } from './import-plan-view';
import type { MessageKey } from '../../i18n';
import type { ImportEncodingChoice } from '../../import/encoding';
import type { ImportPreview } from '../../import/worker-protocol';
import type { ReactElement } from 'react';

export interface ImportWizardDialogProps {
  open: boolean;
  tableName: string;
  fileName: string;
  fileSize: number;
  existingRowCount: number;
  step: 1 | 2 | 3 | 4 | 5;
  preview: ImportPreview | null;
  existingColumns: readonly ColumnDef[];
  encoding: ImportEncodingChoice;
  delimiter: ImportDelimiter | undefined;
  hasHeader: boolean;
  drafts: ImportColumnDraft[];
  mappings: ImportColumnMapping[];
  plan: ImportPlanView | null;
  skipInvalid: boolean;
  mode: 'append' | 'replace';
  busy: boolean;
  busyLabel: string | null;
  canCancelBusy: boolean;
  error: string | null;
  requiredMissing: string[];
  duplicateTarget: boolean;
  largeRows: boolean;
  replaceConfirmed: boolean;
  largeConfirmed: boolean;
  onEncodingChange: (encoding: ImportEncodingChoice) => void;
  onDelimiterChange: (delimiter: ImportDelimiter) => void;
  onHeaderChange: (hasHeader: boolean) => void;
  onMappingChange: (sourceIndex: number, target: ImportColumnMapping['target']) => void;
  onDraftChange: (index: number, patch: Partial<ImportColumnDraft>) => void;
  onNext: () => void;
  onBack: () => void;
  onValidate: () => void;
  onSkipChange: (skip: boolean) => void;
  onExportErrors: () => void;
  onModeChange: (mode: 'append' | 'replace') => void;
  onReplaceConfirmChange: (confirmed: boolean) => void;
  onLargeConfirmChange: (confirmed: boolean) => void;
  onCommit: () => void;
  onClose: () => void;
  onCancelBusy: () => void;
}

const STEP_KEYS: readonly MessageKey[] = [
  'import.step.file',
  'import.step.preview',
  'import.step.mapping',
  'import.step.validation',
  'import.step.commit',
];

const TYPE_KEYS: Record<ImportedColumn['type'], MessageKey> = {
  text: 'import.mapping.typeText',
  number: 'import.mapping.typeNumber',
  date: 'import.mapping.typeDate',
  boolean: 'import.mapping.typeBoolean',
};

const DELIMITER_KEYS: Record<ImportDelimiter, MessageKey> = {
  ',': 'import.preview.delimiterComma',
  ';': 'import.preview.delimiterSemicolon',
  '\t': 'import.preview.delimiterTab',
  '|': 'import.preview.delimiterPipe',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function currentTarget(mapping: ImportColumnMapping | undefined): {
  value: string;
  kind: ImportColumnMapping['target']['kind'];
} {
  if (mapping === undefined || mapping.target.kind === 'ignore') {
    return { value: 'ignore', kind: 'ignore' };
  }
  if (mapping.target.kind === 'existing') {
    return { value: `existing:${mapping.target.columnId}`, kind: 'existing' };
  }
  return { value: 'new', kind: 'new' };
}

export function ImportWizardDialog(props: ImportWizardDialogProps): ReactElement {
  const { t } = useI18n();
  const {
    open,
    tableName,
    fileName,
    fileSize,
    existingRowCount,
    step,
    preview,
    existingColumns,
    encoding,
    delimiter,
    hasHeader,
    drafts,
    mappings,
    plan,
    skipInvalid,
    mode,
    busy,
    busyLabel,
    canCancelBusy,
    error,
    requiredMissing,
    duplicateTarget,
    largeRows,
    replaceConfirmed,
    largeConfirmed,
  } = props;

  const previewColumns = preview?.columns ?? [];
  const columns = previewColumns;
  const issues: readonly ImportIssue[] = plan?.issues ?? [];
  const stats: ImportStats | null = plan?.stats ?? null;
  const mappingFor = (sourceIndex: number): ImportColumnMapping | undefined =>
    mappings.find((mapping) => mapping.sourceIndex === sourceIndex);

  const footer = (): ReactElement => {
    if (busy) {
      return (
        <>
          <span className="cs-import-busy" role="status">
            {busyLabel ?? t('import.busy.validating')}
          </span>
          <Button
            variant="secondary"
            data-testid="import-cancel-busy"
            disabled={!canCancelBusy}
            onClick={props.onCancelBusy}
          >
            {t('import.cancel')}
          </Button>
        </>
      );
    }
    const cancel = (
      <Button variant="secondary" data-testid="import-cancel" onClick={props.onClose}>
        {t('common.cancel')}
      </Button>
    );
    const back = (
      <Button variant="ghost" data-testid="import-back" onClick={props.onBack}>
        {t('import.back')}
      </Button>
    );

    if (preview === null) {
      return cancel;
    }

    switch (step) {
      case 1:
        return (
          <>
            {cancel}
            <Button variant="primary" data-testid="import-next" onClick={props.onNext}>
              {t('import.next')}
            </Button>
          </>
        );
      case 2:
        return (
          <>
            {cancel}
            {back}
            <Button variant="primary" data-testid="import-next" onClick={props.onNext}>
              {t('import.next')}
            </Button>
          </>
        );
      case 3:
        return (
          <>
            {cancel}
            {back}
            <Button
              variant="primary"
              data-testid="import-validate"
              disabled={requiredMissing.length > 0 || duplicateTarget}
              onClick={props.onValidate}
            >
              {t('import.validate')}
            </Button>
          </>
        );
      case 4:
        return (
          <>
            {cancel}
            {back}
            {issues.length > 0 ? (
              <Button
                variant="secondary"
                data-testid="import-export-errors"
                onClick={props.onExportErrors}
              >
                {t('import.validation.export')}
              </Button>
            ) : null}
            {plan !== null && !plan.ok && issues.length > 0 ? (
              <Button variant="primary" data-testid="import-recheck" onClick={props.onValidate}>
                {t('import.validation.recheck')}
              </Button>
            ) : (
              <Button
                variant="primary"
                data-testid="import-next"
                disabled={plan === null || !plan.ok}
                onClick={props.onNext}
              >
                {t('import.next')}
              </Button>
            )}
          </>
        );
      case 5:
        return (
          <>
            {cancel}
            {back}
            <Button
              variant="primary"
              data-testid="import-commit"
              disabled={
                plan === null ||
                !plan.ok ||
                (mode === 'replace' && !replaceConfirmed) ||
                (largeRows && !largeConfirmed)
              }
              onClick={props.onCommit}
            >
              {t('import.commit.import')}
            </Button>
          </>
        );
    }
  };

  const body = (): ReactElement => {
    if (error !== null) {
      return (
        <div className="cs-import-error" role="alert" data-testid="import-error">
          <p>{error}</p>
        </div>
      );
    }
    if (preview === null) {
      return <p className="cs-import-busy">{busyLabel ?? t('import.busy.reading')}</p>;
    }

    if (step === 1) {
      return (
        <div className="cs-import-step" data-testid="import-step-file">
          <dl className="cs-import-file">
            <dt>{t('import.file.name')}</dt>
            <dd>{fileName}</dd>
            <dt>{t('import.file.size')}</dt>
            <dd>{formatBytes(fileSize)}</dd>
            <dt>{t('import.file.format')}</dt>
            <dd>{preview.format.toUpperCase()}</dd>
          </dl>
          <Select
            label={t('import.file.encoding')}
            data-testid="import-encoding"
            value={encoding}
            options={[
              { value: 'auto', label: t('import.file.encodingAuto') },
              { value: 'utf-8', label: t('import.file.encodingUtf8') },
              { value: 'gb18030', label: t('import.file.encodingGb') },
            ]}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'auto' || value === 'utf-8' || value === 'gb18030') {
                props.onEncodingChange(value);
              }
            }}
          />
          {preview.encodingMismatch ? (
            <p className="cs-dialog__error" role="alert" data-testid="import-encoding-warning">
              {t('import.file.mismatch')}
            </p>
          ) : null}
          <p className="cs-import-meta" data-testid="import-detected-encoding">
            {t('import.file.detected', {
              encoding:
                preview.encoding === 'gb18030'
                  ? t('import.file.encodingGb')
                  : t('import.file.encodingUtf8'),
            })}
          </p>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="cs-import-step" data-testid="import-step-preview">
          <div className="cs-import-controls">
            {preview.format === 'csv' ? (
              <Select
                label={t('import.preview.delimiter')}
                data-testid="import-delimiter"
                value={delimiter ?? ','}
                options={(Object.keys(DELIMITER_KEYS) as ImportDelimiter[]).map((value) => ({
                  value,
                  label: t(DELIMITER_KEYS[value]),
                }))}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (value === ',' || value === ';' || value === '\t' || value === '|') {
                    props.onDelimiterChange(value);
                  }
                }}
              />
            ) : null}
            {preview.format === 'csv' ? (
              <label className="cs-import-check">
                <input
                  type="checkbox"
                  data-testid="import-header"
                  checked={hasHeader}
                  onChange={(event) => {
                    props.onHeaderChange(event.currentTarget.checked);
                  }}
                />
                {t('import.preview.header')}
              </label>
            ) : null}
          </div>
          <p className="cs-import-meta">
            {t('import.preview.total', { count: preview.totalRows })} ·{' '}
            {t('import.preview.columns', { count: preview.headers.length })}
          </p>
          <div className="cs-import-preview">
            <table>
              <thead>
                <tr>
                  {preview.headers.map((header, index) => (
                    <th key={`${header}-${String(index)}`} scope="col">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((row, rowIndex) => (
                  <tr key={String(rowIndex)}>
                    {preview.headers.map((header, columnIndex) => (
                      <td key={`${header}-${String(columnIndex)}`}>
                        {valueText(row[columnIndex])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.warnings.length > 0 ? (
            <ul className="cs-import-warnings">
              {preview.warnings.map((warning, index) => (
                <li key={String(index)}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="cs-import-step" data-testid="import-step-mapping">
          <p className="cs-import-meta">{t('import.mapping.body')}</p>
          {requiredMissing.length > 0 ? (
            <p className="cs-dialog__error" role="alert" data-testid="import-required-missing">
              {t('import.mapping.requiredMissing', { columns: requiredMissing.join(', ') })}
            </p>
          ) : null}
          {duplicateTarget ? (
            <p className="cs-dialog__error" role="alert" data-testid="import-duplicate-target">
              {t('import.mapping.duplicateTarget')}
            </p>
          ) : null}
          <div className="cs-import-mapping">
            {columns.map((source) => {
              const mapping = mappingFor(source.index);
              const target = currentTarget(mapping);
              const draft = drafts[source.index];
              return (
                <div className="cs-import-mapping__row" key={String(source.index)}>
                  <div className="cs-import-mapping__source">
                    <strong>{source.name}</strong>
                    <span className="cs-import-mapping__sample">
                      {preview.previewRows
                        .slice(0, 2)
                        .map((row) => valueText(row[source.index]))
                        .filter((value) => value.length > 0)
                        .join(' · ')}
                    </span>
                    <span className="cs-import-mapping__inferred">
                      {t('import.mapping.confidence', {
                        type: t(TYPE_KEYS[source.type]),
                        percent: Math.round(source.confidence * 100),
                      })}
                    </span>
                  </div>
                  <Select
                    label={t('import.mapping.target')}
                    hideLabel
                    data-testid={`import-mapping-${String(source.index)}`}
                    value={target.value}
                    options={[
                      { value: 'ignore', label: t('import.mapping.ignore') },
                      ...existingColumns.map((column) => ({
                        value: `existing:${column.id}`,
                        label: `${column.label} (${column.key})`,
                      })),
                      { value: 'new', label: t('import.mapping.new') },
                    ]}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value === 'ignore') {
                        props.onMappingChange(source.index, { kind: 'ignore' });
                        return;
                      }
                      if (value === 'new') {
                        props.onMappingChange(source.index, {
                          kind: 'new',
                          newColumnIndex: source.index,
                        });
                        return;
                      }
                      if (value.startsWith('existing:')) {
                        props.onMappingChange(source.index, {
                          kind: 'existing',
                          columnId: value.slice('existing:'.length),
                        });
                      }
                    }}
                  />
                  {target.kind === 'new' && draft !== undefined ? (
                    <div className="cs-import-mapping__new">
                      <Input
                        label={t('import.mapping.newLabel')}
                        data-testid={`import-new-label-${String(source.index)}`}
                        value={draft.label}
                        onChange={(event) => {
                          props.onDraftChange(source.index, { label: event.currentTarget.value });
                        }}
                      />
                      <Select
                        label={t('import.mapping.newType')}
                        data-testid={`import-new-type-${String(source.index)}`}
                        value={draft.type}
                        options={[
                          { value: 'text', label: t('import.mapping.typeText') },
                          { value: 'number', label: t('import.mapping.typeNumber') },
                          { value: 'date', label: t('import.mapping.typeDate') },
                          { value: 'boolean', label: t('import.mapping.typeBoolean') },
                        ]}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          if (
                            value === 'text' ||
                            value === 'number' ||
                            value === 'date' ||
                            value === 'boolean'
                          ) {
                            props.onDraftChange(source.index, { type: value });
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (step === 4) {
      return (
        <div className="cs-import-step" data-testid="import-step-validation">
          {stats === null ? (
            <p className="cs-import-busy">{t('import.busy.validating')}</p>
          ) : (
            <ul className="cs-import-stats">
              <li data-testid="import-stat-total">
                {t('import.validation.total')}: {stats.total}
              </li>
              <li data-testid="import-stat-accepted">
                {t('import.validation.accepted')}: {stats.accepted}
              </li>
              <li data-testid="import-stat-skipped">
                {t('import.validation.skipped')}: {stats.skipped}
              </li>
            </ul>
          )}
          {plan !== null && !plan.ok && issues.length === 0 ? (
            <p className="cs-dialog__error" role="alert">
              {plan.error.code === 'E_TABLE_LIMIT'
                ? t('import.validation.overLimit')
                : t('import.validation.hardError', {
                    message: describeAppError(plan.error, t),
                  })}
            </p>
          ) : null}
          {issues.length > 0 ? (
            <>
              <p className="cs-import-meta">
                {t('import.validation.issues', {
                  shown: Math.min(issues.length, 100),
                  total: issues.length,
                })}
              </p>
              <ul className="cs-import-issues" data-testid="import-issues">
                {issues.slice(0, 100).map((issue, index) => (
                  <li key={`${String(issue.row)}-${String(issue.code)}-${String(index)}`}>
                    {importIssueText(issue, t)}
                  </li>
                ))}
              </ul>
              <label className="cs-import-check">
                <input
                  type="checkbox"
                  data-testid="import-skip"
                  checked={skipInvalid}
                  onChange={(event) => {
                    props.onSkipChange(event.currentTarget.checked);
                  }}
                />
                {t('import.validation.skip')}
              </label>
            </>
          ) : plan?.ok ? (
            <p className="cs-import-meta">{t('import.validation.noIssues')}</p>
          ) : null}
        </div>
      );
    }

    const finalCount = plan?.ok ? plan.finalRowCount : null;
    return (
      <div className="cs-import-step" data-testid="import-step-commit">
        <fieldset className="cs-import-mode">
          <legend>{t('import.commit.mode')}</legend>
          <label className="cs-import-check">
            <input
              type="radio"
              name="import-mode"
              value="append"
              data-testid="import-mode-append"
              checked={mode === 'append'}
              onChange={() => {
                props.onModeChange('append');
              }}
            />
            {t('import.commit.append')}
          </label>
          <label className="cs-import-check">
            <input
              type="radio"
              name="import-mode"
              value="replace"
              data-testid="import-mode-replace"
              checked={mode === 'replace'}
              onChange={() => {
                props.onModeChange('replace');
              }}
            />
            {t('import.commit.replace')}
          </label>
        </fieldset>
        {mode === 'replace' ? (
          <div className="cs-import-warning" role="note">
            <p>{t('import.commit.replaceWarning', { count: existingRowCount })}</p>
            <label className="cs-import-check">
              <input
                type="checkbox"
                data-testid="import-replace-confirm"
                checked={replaceConfirmed}
                onChange={(event) => {
                  props.onReplaceConfirmChange(event.currentTarget.checked);
                }}
              />
              {t('import.commit.replaceConfirm')}
            </label>
          </div>
        ) : null}
        {finalCount !== null ? (
          <p className="cs-import-meta">{t('import.commit.finalCount', { count: finalCount })}</p>
        ) : null}
        {largeRows ? (
          <div className="cs-import-warning" role="note">
            <p>{t('import.commit.large')}</p>
            <label className="cs-import-check">
              <input
                type="checkbox"
                data-testid="import-large-confirm"
                checked={largeConfirmed}
                onChange={(event) => {
                  props.onLargeConfirmChange(event.currentTarget.checked);
                }}
              />
              {t('import.commit.largeConfirm')}
            </label>
          </div>
        ) : null}
        <p className="cs-import-meta">{t('import.commit.archive')}</p>
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      title={t('import.title')}
      description={t('import.description', { table: tableName })}
      closeLabel={t('common.close')}
      onClose={props.onClose}
      dismissOnBackdrop={!busy}
      className="cs-import-dialog"
      footer={footer()}
    >
      <ol className="cs-import-steps" aria-label={t('import.steps')}>
        {STEP_KEYS.map((key, index) => {
          const number = index + 1;
          return (
            <li
              key={key}
              className={number === step ? 'cs-import-steps__current' : undefined}
              aria-current={number === step ? 'step' : undefined}
            >
              <span>{number}</span>
              {t(key)}
            </li>
          );
        })}
      </ol>
      {body()}
    </Dialog>
  );
}
