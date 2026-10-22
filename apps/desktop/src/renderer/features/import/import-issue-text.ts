import type { ImportIssue } from '@curve/table-engine';

import type { MessageKey, Translate } from '../../i18n';

const REASON_KEYS: Record<ImportIssue['code'], MessageKey> = {
  E_TYPE: 'import.issue.reason.type',
  E_REQUIRED: 'import.issue.reason.required',
  E_DUPLICATE_KEY: 'import.issue.reason.duplicateKey',
  E_ENUM: 'import.issue.reason.enum',
  E_RANGE: 'import.issue.reason.range',
  E_VALIDATION: 'import.issue.reason.validation',
  E_IMPORT_FORMAT: 'import.issue.reason.format',
};

export function importIssueReason(issue: ImportIssue, t: Translate): string {
  return t(REASON_KEYS[issue.code]);
}

export function importIssueText(issue: ImportIssue, t: Translate): string {
  if (issue.columnId === undefined && issue.code === 'E_IMPORT_FORMAT') {
    return t('import.issue.rowFormat', { row: issue.row });
  }
  return t('import.issue.row', {
    row: issue.row,
    column: issue.columnName ?? '—',
    reason: importIssueReason(issue, t),
  });
}
