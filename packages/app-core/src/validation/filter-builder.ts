/**
 * Filter-builder form model (T2.6).
 *
 * The dialog edits strings/flags; this module turns them into the persisted
 * `FilterPredicate` AST. Keeping it in app-core (not the component) means the
 * same coercion rules as inline editing/paste/import apply to filter values, and
 * the UI only renders issues.
 */

import { coerceCell, MAX_FILTER_CHILDREN } from '@curve/domain';
import type { Cell, ColumnDef, CompareOp, FilterPredicate, TableMeta } from '@curve/domain';
import {
  allowedCompareOps,
  compareOpNeedsSecondValue,
  compareOpNeedsValue,
} from '@curve/table-engine';

export {
  allowedCompareOps,
  compareOpNeedsSecondValue,
  compareOpNeedsValue,
} from '@curve/table-engine';

export type FilterDraftMode = 'all' | 'any';

export interface FilterDraftCondition {
  columnId: string;
  op: CompareOp;
  /** Raw UI text; ignored for isNull/notNull. */
  value: string;
  value2?: string;
}

export interface FilterDraft {
  mode: FilterDraftMode;
  conditions: FilterDraftCondition[];
}

export type FilterDraftField = 'column' | 'operator' | 'value' | 'value2' | 'group';

export type FilterDraftIssueReason =
  | 'missing-column'
  | 'unsupported-operator'
  | 'missing-value'
  | 'invalid-type'
  | 'out-of-range'
  | 'invalid-enum'
  | 'limit';

export interface FilterDraftIssue {
  /** 0-based condition index; -1 for a group-level issue. */
  index: number;
  field: FilterDraftField;
  reason: FilterDraftIssueReason;
  /** English diagnostic for logs/tests; UI maps `reason` to `t()`. */
  message: string;
}

export type BuildFilterResult =
  | { readonly ok: true; readonly filter?: FilterPredicate }
  | { readonly ok: false; readonly issues: FilterDraftIssue[] };

export function defaultOperatorFor(column: ColumnDef): CompareOp {
  return allowedCompareOps(column)[0] ?? 'eq';
}

/** A usable initial value for a new condition (enums/bools need a choice). */
export function defaultFilterValueFor(column: ColumnDef): string {
  if (column.type === 'boolean') {
    return 'true';
  }
  if (column.type === 'enum') {
    return column.enumOptions?.[0]?.value ?? '';
  }
  return '';
}

/** A new draft: first column, its first operator, empty value. */
export function createEmptyFilterDraft(table: TableMeta): FilterDraft {
  const column = table.columns[0];
  return {
    mode: 'all',
    conditions:
      column === undefined
        ? []
        : [
            {
              columnId: column.id,
              op: defaultOperatorFor(column),
              value: defaultFilterValueFor(column),
            },
          ],
  };
}

export function dateFilterInputValue(epochMs: number): string {
  const date = new Date(epochMs);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function valueToDraft(value: Cell | undefined, column: ColumnDef): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (column.type === 'date' && typeof value === 'number') {
    return dateFilterInputValue(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

/**
 * Converts a persisted predicate back into dialog state.
 *
 * Returns `null` for nested groups: the T2.6 dialog only edits one root group
 * with flat compare children, and silently flattening a nested filter would
 * change its meaning when the user presses Apply.
 */
export function filterDraftFromPredicate(
  table: TableMeta,
  filter: FilterPredicate | undefined,
): FilterDraft | null {
  if (filter === undefined) {
    return createEmptyFilterDraft(table);
  }
  const root = filter.kind === 'compare' ? { kind: 'all' as const, children: [filter] } : filter;
  const conditions: FilterDraftCondition[] = [];
  for (const child of root.children) {
    if (child.kind !== 'compare') {
      return null;
    }
    const column = table.columns.find((candidate) => candidate.id === child.columnId);
    if (column === undefined) {
      return null;
    }
    conditions.push({
      columnId: child.columnId,
      op: child.op,
      value: valueToDraft(child.value, column),
      ...(child.value2 === undefined ? {} : { value2: valueToDraft(child.value2, column) }),
    });
  }
  return { mode: root.kind === 'any' ? 'any' : 'all', conditions };
}

function pushIssue(
  issues: FilterDraftIssue[],
  index: number,
  field: FilterDraftField,
  reason: FilterDraftIssueReason,
  message: string,
): void {
  issues.push({ index, field, reason, message });
}

function parseDraftValue(
  raw: string,
  column: ColumnDef,
  issues: FilterDraftIssue[],
  index: number,
  field: 'value' | 'value2',
): Cell | undefined {
  if (raw.trim() === '') {
    pushIssue(
      issues,
      index,
      field,
      'missing-value',
      `condition ${String(index + 1)} needs a value`,
    );
    return undefined;
  }
  const coerced = coerceCell(raw, column);
  if (!coerced.ok) {
    pushIssue(
      issues,
      index,
      field,
      coerced.code === 'E_RANGE'
        ? 'out-of-range'
        : coerced.code === 'E_ENUM'
          ? 'invalid-enum'
          : 'invalid-type',
      coerced.message,
    );
    return undefined;
  }
  if (coerced.value === null || (column.type === 'text' && coerced.value === '')) {
    pushIssue(
      issues,
      index,
      field,
      'missing-value',
      `condition ${String(index + 1)} needs a value`,
    );
    return undefined;
  }
  return coerced.value;
}

/** Builds the persisted predicate; an empty condition list means "clear". */
export function buildFilterPredicate(table: TableMeta, draft: FilterDraft): BuildFilterResult {
  if (draft.conditions.length > MAX_FILTER_CHILDREN) {
    return {
      ok: false,
      issues: [
        {
          index: -1,
          field: 'group',
          reason: 'limit',
          message: `a filter may contain at most ${String(MAX_FILTER_CHILDREN)} conditions`,
        },
      ],
    };
  }
  if (draft.conditions.length === 0) {
    return { ok: true };
  }

  const issues: FilterDraftIssue[] = [];
  const children: FilterPredicate[] = [];
  draft.conditions.forEach((condition, index) => {
    const column = table.columns.find((candidate) => candidate.id === condition.columnId);
    if (column === undefined) {
      pushIssue(
        issues,
        index,
        'column',
        'missing-column',
        `condition ${String(index + 1)} references a missing column`,
      );
      return;
    }
    if (!allowedCompareOps(column).includes(condition.op)) {
      pushIssue(
        issues,
        index,
        'operator',
        'unsupported-operator',
        `operator "${condition.op}" does not apply to column "${column.key}"`,
      );
      return;
    }

    if (!compareOpNeedsValue(condition.op)) {
      children.push({ kind: 'compare', columnId: column.id, op: condition.op });
      return;
    }

    const value = parseDraftValue(condition.value, column, issues, index, 'value');
    let value2: Cell | undefined;
    if (compareOpNeedsSecondValue(condition.op)) {
      value2 = parseDraftValue(condition.value2 ?? '', column, issues, index, 'value2');
    }
    if (value === undefined || (compareOpNeedsSecondValue(condition.op) && value2 === undefined)) {
      return;
    }
    children.push({
      kind: 'compare',
      columnId: column.id,
      op: condition.op,
      value,
      ...(value2 === undefined ? {} : { value2 }),
    });
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, filter: { kind: draft.mode, children } };
}
