import type { CellIssue, CellIssueReason } from '@curve/app-core';

import type { MessageKey, Translate } from '../../i18n';

const REASON_KEYS: Record<CellIssueReason, MessageKey> = {
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
};

/**
 * Localises a structured cell issue for the editor tooltip and status bar.
 * The English `issue.message` is never shown to users (SPEC §18).
 */
export function describeCellIssue(issue: CellIssue, t: Translate, columnLabel?: string): string {
  const reason = t(REASON_KEYS[issue.reason], {
    row: issue.conflictRowNumber ?? issue.rowNumber ?? 0,
  });
  if (issue.rowNumber !== undefined && columnLabel !== undefined) {
    return t('grid.status.editLocation', {
      row: issue.rowNumber,
      column: columnLabel,
      reason,
    });
  }
  if (columnLabel !== undefined) {
    return t('grid.status.editLocationNoRow', { column: columnLabel, reason });
  }
  return reason;
}
