/**
 * Validation shared by `view.create` and `view.update` (T2.6).
 *
 * The Zod schema checks the persisted shape; this module checks the parts that
 * need the table schema: filter operators/values, the three-level sort limit and
 * the hidden-column references. The query engine is the single owner of those
 * rules, so the store and the worker cannot drift.
 */

import { createAppError, MAX_FROZEN_COLUMNS } from '@curve/domain';
import type { TableMeta, TableViewState } from '@curve/domain';
import { validateFilterPredicate, validateSortSpecs } from '@curve/table-engine';
import type { QueryIssue } from '@curve/table-engine';

export interface ViewStateIssue {
  path: string;
  code: string;
  message: string;
}

function toViewIssues(issues: readonly QueryIssue[]): ViewStateIssue[] {
  return issues.map((issue) => ({
    path: issue.path,
    code: issue.code,
    message: issue.message,
  }));
}

/** Returns every problem in a table view state; an empty array means valid. */
export function validateTableViewState(
  table: TableMeta,
  tableView: TableViewState,
): ViewStateIssue[] {
  const issues: ViewStateIssue[] = [];
  if (tableView.sort.length > 0) {
    issues.push(...toViewIssues(validateSortSpecs(table, tableView.sort)));
  }
  if (tableView.filter !== undefined) {
    issues.push(...toViewIssues(validateFilterPredicate(table, tableView.filter)));
  }

  const known = new Set(table.columns.map((column) => column.id));
  const ordered = new Set(tableView.columnOrder);
  const hidden = new Set<string>();
  tableView.hiddenColumnIds.forEach((columnId, index) => {
    if (!known.has(columnId)) {
      issues.push({
        path: `tableView.hiddenColumnIds[${index}]`,
        code: 'E_VALIDATION',
        message: `hidden column "${columnId}" does not exist`,
      });
    } else if (!ordered.has(columnId)) {
      issues.push({
        path: `tableView.hiddenColumnIds[${index}]`,
        code: 'E_VALIDATION',
        message: `hidden column "${columnId}" is not in columnOrder`,
      });
    }
    if (hidden.has(columnId)) {
      issues.push({
        path: `tableView.hiddenColumnIds[${index}]`,
        code: 'E_DUPLICATE_KEY',
        message: `hidden column "${columnId}" appears more than once`,
      });
    }
    hidden.add(columnId);
  });

  for (const columnId of Object.keys(tableView.widths)) {
    if (!known.has(columnId)) {
      issues.push({
        path: `tableView.widths.${columnId}`,
        code: 'E_VALIDATION',
        message: `widths references unknown column "${columnId}"`,
      });
    }
  }

  if (tableView.frozenColumnCount > MAX_FROZEN_COLUMNS) {
    issues.push({
      path: 'tableView.frozenColumnCount',
      code: 'E_RANGE',
      message: `at most ${String(MAX_FROZEN_COLUMNS)} columns can be frozen`,
    });
  }

  return issues;
}

/** Throws the first structured issue as an `E_VALIDATION` AppError. */
export function assertValidTableView(table: TableMeta, tableView: TableViewState): void {
  const issues = validateTableViewState(table, tableView);
  const first = issues[0];
  if (first !== undefined) {
    throw createAppError('E_VALIDATION', first.message, {
      detail: `${first.path}:${first.code}`,
    });
  }
}
