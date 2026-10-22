/**
 * Localised text for one paste issue (T2.4).
 *
 * The planner returns machine-readable reasons; the dialog never renders the
 * English `message`. Column labels come from the live table, so a renamed
 * column is reflected without re-planning.
 */

import type { PasteIssue } from '@curve/app-core';

import type { Translate } from '../../i18n';

const REASON_KEYS = {
  required: 'grid.error.required',
  type: 'grid.error.type',
  range: 'grid.error.range',
  enum: 'grid.error.enum',
  'duplicate-key': 'grid.error.duplicateKey',
  'primary-key-empty': 'grid.error.primaryKeyEmpty',
  'table-not-found': 'grid.error.tableNotFound',
  'row-not-found': 'grid.error.rowNotFound',
  'column-not-found': 'grid.error.columnNotFound',
  'row-shape': 'grid.error.rowShape',
  unknown: 'grid.error.unknown',
} as const;

function reasonText(issue: PasteIssue, t: Translate): string {
  if (issue.reason === 'duplicate-key') {
    return t('grid.error.duplicateKey', { row: issue.conflictRowNumber ?? 0 });
  }
  return t(REASON_KEYS[issue.reason]);
}

export interface PasteIssueTextOptions {
  t: Translate;
  /** Label for `issue.columnId`; falls back to the id. */
  columnLabel?: string;
}

/** Formats one issue as “第 N 行 · 列 X：原因（值：…）”. */
export function describePasteIssue(issue: PasteIssue, options: PasteIssueTextOptions): string {
  const { t } = options;
  const row = issue.rowNumber ?? issue.matrixRow + 1;
  const column = options.columnLabel ?? issue.columnId ?? '—';
  const reason = reasonText(issue, t);
  if (issue.matrixColumn < 0) {
    return t('paste.error.requiredColumn', { row, column });
  }
  const value = issue.value.trim() === '' ? t('columns.failure.empty') : issue.value;
  return t('paste.error.issue', { row, column, reason, value });
}

/** Short label for a column id, used by the issue list and the locate button. */
export function pasteIssueColumnLabel(
  issue: PasteIssue,
  columns: ReadonlyMap<string, string>,
): string | undefined {
  if (issue.columnId === undefined) {
    return undefined;
  }
  return columns.get(issue.columnId) ?? issue.columnId;
}
