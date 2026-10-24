/**
 * Conditional-rule form model (T3.4, SPEC §10.4/§10.6).
 *
 * The editor keeps raw UI strings and up to two predicate levels (a root
 * all/any of groups, each group all/any of comparisons). This module converts
 * that state to the persisted `FilterPredicate` and back, keeping validation
 * out of React and reusing the condition-only operator whitelist.
 */

import {
  coerceCell,
  compareOpNeedsSecondValue,
  compareOpNeedsValue,
  conditionCompareOps,
  MAX_FILTER_CHILDREN,
} from '@curve/domain';
import type { Cell, ColumnDef, CompareOp, FilterPredicate, TableMeta } from '@curve/domain';

import { dateFilterInputValue, defaultFilterValueFor } from './filter-builder';

import type { FilterDraftIssueReason } from './filter-builder';

export const MAX_CONDITIONAL_GROUPS = 2;

export type ConditionGroupMode = 'all' | 'any';

export interface ConditionalConditionDraft {
  columnId: string;
  op: CompareOp;
  /** Raw UI value; ignored for isNull/notNull. */
  value: string;
  value2?: string;
}

export interface ConditionalGroupDraft {
  mode: ConditionGroupMode;
  conditions: ConditionalConditionDraft[];
}

export interface ConditionalPredicateDraft {
  mode: ConditionGroupMode;
  groups: ConditionalGroupDraft[];
}

export type ConditionalConditionField = 'column' | 'operator' | 'value' | 'value2' | 'group';

export interface ConditionalPredicateIssue {
  /** 0-based group index; -1 for a root-level issue. */
  groupIndex: number;
  /** 0-based condition index; -1 for a group-level issue. */
  conditionIndex: number;
  field: ConditionalConditionField;
  reason: FilterDraftIssueReason;
  /** English diagnostic for logs/tests; the UI maps `reason` to `t()`. */
  message: string;
}

export type BuildConditionalPredicateResult =
  | { readonly ok: true; readonly predicate: FilterPredicate }
  | { readonly ok: false; readonly issues: readonly ConditionalPredicateIssue[] };

export function defaultConditionalOperator(column: ColumnDef): CompareOp {
  return conditionCompareOps(column)[0] ?? 'eq';
}

export function defaultConditionalValue(column: ColumnDef): string {
  return defaultFilterValueFor(column);
}

/** A usable condition for the given (or first) column. */
export function createConditionDraft(
  table: TableMeta,
  columnId?: string,
): ConditionalConditionDraft {
  const column =
    (columnId === undefined
      ? table.columns[0]
      : table.columns.find((candidate) => candidate.id === columnId)) ?? table.columns[0];
  if (column === undefined) {
    return { columnId: '', op: 'eq', value: '' };
  }
  return {
    columnId: column.id,
    op: defaultConditionalOperator(column),
    value: defaultConditionalValue(column),
  };
}

/** A single group with one condition, or no groups for a column-less table. */
export function createConditionalPredicateDraft(table: TableMeta): ConditionalPredicateDraft {
  const condition = table.columns[0] === undefined ? null : createConditionDraft(table);
  return {
    mode: 'all',
    groups: condition === null ? [] : [{ mode: 'all', conditions: [condition] }],
  };
}

function cellValueToDraft(value: Cell | undefined, column: ColumnDef): string {
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

function compareDraft(
  predicate: Extract<FilterPredicate, { kind: 'compare' }>,
  table: TableMeta,
): ConditionalConditionDraft | null {
  const column = table.columns.find((candidate) => candidate.id === predicate.columnId);
  if (column === undefined || !conditionCompareOps(column).includes(predicate.op)) {
    return null;
  }
  return {
    columnId: column.id,
    op: predicate.op,
    value: cellValueToDraft(predicate.value, column),
    ...(predicate.value2 === undefined
      ? {}
      : { value2: cellValueToDraft(predicate.value2, column) }),
  };
}

function groupFromPredicate(
  predicate: FilterPredicate,
  table: TableMeta,
): ConditionalGroupDraft | null {
  if (predicate.kind === 'compare') {
    return null;
  }
  const conditions: ConditionalConditionDraft[] = [];
  for (const child of predicate.children) {
    if (child.kind !== 'compare') {
      return null;
    }
    const draft = compareDraft(child, table);
    if (draft === null) {
      return null;
    }
    conditions.push(draft);
  }
  if (conditions.length === 0) {
    return null;
  }
  return { mode: predicate.kind, conditions };
}

/**
 * Converts a persisted rule predicate into editor state.
 *
 * Returns `null` when the predicate is deeper than the two supported levels,
 * references a missing column or uses an operator outside `conditionCompareOps`.
 * The editor then keeps the rule read-only instead of silently changing it.
 */
export function conditionPredicateFromRule(
  when: FilterPredicate,
  table: TableMeta,
): ConditionalPredicateDraft | null {
  if (when.kind === 'compare') {
    const draft = compareDraft(when, table);
    return draft === null ? null : { mode: 'all', groups: [{ mode: 'all', conditions: [draft] }] };
  }

  const direct = when.children.every((child) => child.kind === 'compare');
  if (direct) {
    const group = groupFromPredicate(when, table);
    return group === null ? null : { mode: when.kind, groups: [group] };
  }

  const groups: ConditionalGroupDraft[] = [];
  for (const child of when.children) {
    const group = groupFromPredicate(child, table);
    if (group === null) {
      return null;
    }
    groups.push(group);
  }
  return groups.length === 0 ? null : { mode: when.kind, groups };
}

function pushIssue(
  issues: ConditionalPredicateIssue[],
  groupIndex: number,
  conditionIndex: number,
  field: ConditionalConditionField,
  reason: FilterDraftIssueReason,
  message: string,
): void {
  issues.push({ groupIndex, conditionIndex, field, reason, message });
}

function parseDraftValue(
  raw: string,
  column: ColumnDef,
  issues: ConditionalPredicateIssue[],
  groupIndex: number,
  conditionIndex: number,
  field: 'value' | 'value2',
): Cell | undefined {
  if (raw.trim() === '') {
    pushIssue(
      issues,
      groupIndex,
      conditionIndex,
      field,
      'missing-value',
      `condition ${String(conditionIndex + 1)} needs a value`,
    );
    return undefined;
  }
  const coerced = coerceCell(raw, column);
  if (!coerced.ok) {
    pushIssue(
      issues,
      groupIndex,
      conditionIndex,
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
      groupIndex,
      conditionIndex,
      field,
      'missing-value',
      `condition ${String(conditionIndex + 1)} needs a value`,
    );
    return undefined;
  }
  return coerced.value;
}

function buildGroup(
  table: TableMeta,
  group: ConditionalGroupDraft,
  groupIndex: number,
  issues: ConditionalPredicateIssue[],
): FilterPredicate | null {
  if (group.conditions.length === 0) {
    pushIssue(issues, groupIndex, -1, 'group', 'limit', 'a condition group must not be empty');
    return null;
  }
  if (group.conditions.length > MAX_FILTER_CHILDREN) {
    pushIssue(
      issues,
      groupIndex,
      -1,
      'group',
      'limit',
      `a condition group may contain at most ${String(MAX_FILTER_CHILDREN)} conditions`,
    );
    return null;
  }

  const children: FilterPredicate[] = [];
  group.conditions.forEach((condition, conditionIndex) => {
    const column = table.columns.find((candidate) => candidate.id === condition.columnId);
    if (column === undefined) {
      pushIssue(
        issues,
        groupIndex,
        conditionIndex,
        'column',
        'missing-column',
        `condition ${String(conditionIndex + 1)} references a missing column`,
      );
      return;
    }
    if (!conditionCompareOps(column).includes(condition.op)) {
      pushIssue(
        issues,
        groupIndex,
        conditionIndex,
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

    const value = parseDraftValue(
      condition.value,
      column,
      issues,
      groupIndex,
      conditionIndex,
      'value',
    );
    let value2: Cell | undefined;
    if (compareOpNeedsSecondValue(condition.op)) {
      value2 = parseDraftValue(
        condition.value2 ?? '',
        column,
        issues,
        groupIndex,
        conditionIndex,
        'value2',
      );
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

  return { kind: group.mode, children };
}

/**
 * Builds the persisted predicate for a rule.
 *
 * A single group is flattened to one level (the common case). Two or more
 * groups become a root all/any whose children are the group predicates, which
 * is the maximum depth the editor supports.
 */
export function buildConditionalPredicate(
  table: TableMeta,
  draft: ConditionalPredicateDraft,
): BuildConditionalPredicateResult {
  const issues: ConditionalPredicateIssue[] = [];
  if (draft.groups.length === 0) {
    pushIssue(issues, -1, -1, 'group', 'limit', 'a rule needs at least one condition');
    return { ok: false, issues };
  }
  if (draft.groups.length > MAX_CONDITIONAL_GROUPS) {
    pushIssue(
      issues,
      -1,
      -1,
      'group',
      'limit',
      `a rule may contain at most ${String(MAX_CONDITIONAL_GROUPS)} condition groups`,
    );
    return { ok: false, issues };
  }

  const groups: FilterPredicate[] = [];
  draft.groups.forEach((group, index) => {
    const built = buildGroup(table, group, index, issues);
    if (built !== null) {
      groups.push(built);
    }
  });
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const first = groups[0];
  if (first === undefined) {
    return {
      ok: false,
      issues: [
        {
          groupIndex: -1,
          conditionIndex: -1,
          field: 'group',
          reason: 'limit',
          message: 'a rule needs at least one condition',
        },
      ],
    };
  }
  if (groups.length === 1) {
    return { ok: true, predicate: first };
  }
  return { ok: true, predicate: { kind: draft.mode, children: groups } };
}
