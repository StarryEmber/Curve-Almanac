import type { ColumnDraftIssue, ColumnDraftIssueReason } from '@curve/app-core';
import type { Cell, ColumnChangeFailure } from '@curve/domain';

import type { MessageKey, Translate } from '../../i18n';

const ISSUE_MESSAGE_KEYS: Record<ColumnDraftIssueReason, MessageKey> = {
  required: 'columns.error.required',
  format: 'columns.error.format',
  range: 'columns.error.range',
  duplicate: 'columns.error.duplicate',
  'enum-empty': 'columns.error.enumEmpty',
  'enum-duplicate': 'columns.error.enumDuplicate',
  'primary-key-type': 'columns.error.primaryKeyType',
  limit: 'columns.error.limit',
  invalid: 'columns.error.invalid',
};

const FAILURE_MESSAGE_KEYS: Record<ColumnChangeFailure['code'], MessageKey> = {
  E_REQUIRED: 'columns.failure.required',
  E_TYPE: 'columns.failure.type',
  E_RANGE: 'columns.failure.range',
  E_ENUM: 'columns.failure.enum',
  E_DUPLICATE_KEY: 'columns.failure.duplicate',
  E_VALIDATION: 'columns.failure.invalid',
};

export function columnIssueText(issue: ColumnDraftIssue, t: Translate): string {
  return t(ISSUE_MESSAGE_KEYS[issue.reason]);
}

export function columnFailureReasonText(code: ColumnChangeFailure['code'], t: Translate): string {
  return t(FAILURE_MESSAGE_KEYS[code]);
}

/** Compact, localised rendering of a stored cell for the failure list. */
export function columnFailureValueText(value: Cell, t: Translate): string {
  if (value === null || value === undefined) {
    return t('columns.failure.empty');
  }
  if (typeof value === 'boolean') {
    return value ? t('grid.editor.true') : t('grid.editor.false');
  }
  const text = String(value);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
