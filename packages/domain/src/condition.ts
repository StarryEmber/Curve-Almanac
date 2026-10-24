/**
 * Conditional-format engine (SPEC §10.4, T3.3).
 *
 * Rules are evaluated in array order and the first applicable match wins; no
 * style merging happens between rules. A rule targets the whole row or one
 * column cell. Missing columns are ignored (SPEC §6.6.7/§10.5): a predicate
 * branch that references a column absent from the current table is dropped, and
 * a rule whose target column is absent never applies.
 *
 * Preparation is separated from evaluation so a grid can prepare 50 rules once
 * and evaluate them for every visible row without re-resolving columns or
 * re-normalising comparison values.
 */

import { DEFAULT_COMPARE_LOCALE, matchesPreparedComparison, prepareComparison } from './predicate';

import type { PreparedComparison } from './predicate';
import type { ColumnDef, ConditionalRule, FilterPredicate, Row } from './types';

export interface ConditionalFormatOptions {
  /** BCP 47 locale for case-insensitive text matching. */
  locale?: string;
}

export interface ConditionalRuleMatch {
  readonly rule: ConditionalRule;
  readonly target: 'row' | 'cell';
  /** Target column for `cell` rules; null for row rules. */
  readonly columnId: string | null;
}

/** Per-row result: the row rule plus a resolver for individual cells. */
export interface RowConditionalFormat {
  /** First matching row-target rule (may be later than a cell-specific one). */
  readonly rowRule: ConditionalRuleMatch | null;
  /** First applicable matching rule for one cell, or null. */
  readonly cellRule: (columnId: string) => ConditionalRuleMatch | null;
}

export interface ConditionalFormat {
  /** First matching rule for the row, regardless of target. */
  evaluateRules(row: Row): ConditionalRuleMatch | null;
  /** Row-level rule plus a per-cell resolver honouring target columns. */
  evaluateRow(row: Row): RowConditionalFormat;
}

interface PreparedComparePredicate {
  readonly kind: 'compare';
  readonly columnIndex: number;
  readonly comparison: PreparedComparison;
}

interface PreparedGroupPredicate {
  readonly kind: 'all' | 'any';
  readonly children: readonly PreparedPredicate[];
}

type PreparedPredicate = PreparedComparePredicate | PreparedGroupPredicate;

interface PreparedRule {
  readonly rule: ConditionalRule;
  /** null for a row target; otherwise the resolved column index. */
  readonly targetColumnIndex: number | null;
  readonly predicate: PreparedPredicate;
}

function preparePredicate(
  predicate: FilterPredicate,
  columns: readonly ColumnDef[],
  indexById: ReadonlyMap<string, number>,
  locale: string,
): PreparedPredicate | null {
  if (predicate.kind === 'compare') {
    const columnIndex = indexById.get(predicate.columnId);
    if (columnIndex === undefined) {
      return null;
    }
    const column = columns[columnIndex];
    if (column === undefined) {
      return null;
    }
    return {
      kind: 'compare',
      columnIndex,
      comparison: prepareComparison(column, predicate, { locale, mode: 'condition' }),
    };
  }

  const children: PreparedPredicate[] = [];
  for (const child of predicate.children) {
    const prepared = preparePredicate(child, columns, indexById, locale);
    // Missing columns are ignored; if every branch disappears the rule cannot
    // match, which is safer than treating an empty `all` as true.
    if (prepared !== null) {
      children.push(prepared);
    }
  }
  if (children.length === 0) {
    return null;
  }
  return { kind: predicate.kind, children };
}

function prepareRule(
  rule: ConditionalRule,
  columns: readonly ColumnDef[],
  indexById: ReadonlyMap<string, number>,
  locale: string,
): PreparedRule | null {
  if (!rule.enabled) {
    return null;
  }

  let targetColumnIndex: number | null = null;
  if (rule.target.kind === 'cell') {
    const resolved = indexById.get(rule.target.columnId);
    if (resolved === undefined) {
      // A rule targeting a column this table does not have never applies.
      return null;
    }
    targetColumnIndex = resolved;
  }

  const predicate = preparePredicate(rule.when, columns, indexById, locale);
  if (predicate === null) {
    return null;
  }

  return { rule, targetColumnIndex, predicate };
}

function matchesPreparedPredicate(row: Row, predicate: PreparedPredicate): boolean {
  if (predicate.kind === 'compare') {
    return matchesPreparedComparison(
      row.values[predicate.columnIndex] ?? null,
      predicate.comparison,
    );
  }
  if (predicate.kind === 'all') {
    return predicate.children.every((child) => matchesPreparedPredicate(row, child));
  }
  return predicate.children.some((child) => matchesPreparedPredicate(row, child));
}

interface RowEvaluation {
  readonly rowRuleIndex: number | undefined;
  readonly firstMatchIndex: number | undefined;
  readonly cellRuleIndices: readonly (number | undefined)[];
}

function evaluatePreparedRow(
  row: Row,
  preparedRules: readonly PreparedRule[],
  columnCount: number,
): RowEvaluation {
  const cellRuleIndices = new Array<number | undefined>(columnCount);
  let rowRuleIndex: number | undefined;
  let firstMatchIndex: number | undefined;

  for (let index = 0; index < preparedRules.length; index += 1) {
    const prepared = preparedRules[index];
    if (prepared === undefined) {
      continue;
    }
    if (!matchesPreparedPredicate(row, prepared.predicate)) {
      continue;
    }
    firstMatchIndex ??= index;
    if (prepared.targetColumnIndex === null) {
      rowRuleIndex ??= index;
    } else if (cellRuleIndices[prepared.targetColumnIndex] === undefined) {
      cellRuleIndices[prepared.targetColumnIndex] = index;
    }
  }

  return { rowRuleIndex, firstMatchIndex, cellRuleIndices };
}

/**
 * Prepares a rule set for repeated evaluation.
 *
 * Use this in render loops; `evaluateRules` is the convenience wrapper for
 * one-off calls and prepares the rules on every call.
 */
export function createConditionalFormat(
  rules: readonly ConditionalRule[],
  columns: readonly ColumnDef[],
  options: ConditionalFormatOptions = {},
): ConditionalFormat {
  const locale = options.locale ?? DEFAULT_COMPARE_LOCALE;
  const indexById = new Map(columns.map((column, index) => [column.id, index]));
  const preparedRules: PreparedRule[] = [];
  for (const rule of rules) {
    const prepared = prepareRule(rule, columns, indexById, locale);
    if (prepared !== null) {
      preparedRules.push(prepared);
    }
  }

  const matchAt = (index: number | undefined): ConditionalRuleMatch | null => {
    if (index === undefined) {
      return null;
    }
    const prepared = preparedRules[index];
    if (prepared === undefined) {
      return null;
    }
    if (prepared.targetColumnIndex === null) {
      return { rule: prepared.rule, target: 'row', columnId: null };
    }
    return {
      rule: prepared.rule,
      target: 'cell',
      columnId: columns[prepared.targetColumnIndex]?.id ?? null,
    };
  };

  return {
    evaluateRules(row: Row): ConditionalRuleMatch | null {
      const evaluated = evaluatePreparedRow(row, preparedRules, columns.length);
      return matchAt(evaluated.firstMatchIndex);
    },

    evaluateRow(row: Row): RowConditionalFormat {
      const evaluated = evaluatePreparedRow(row, preparedRules, columns.length);
      return {
        rowRule: matchAt(evaluated.rowRuleIndex),
        cellRule: (columnId: string): ConditionalRuleMatch | null => {
          const columnIndex = indexById.get(columnId);
          if (columnIndex === undefined) {
            return null;
          }
          const cellIndex = evaluated.cellRuleIndices[columnIndex];
          let chosen: number | undefined;
          if (cellIndex === undefined) {
            chosen = evaluated.rowRuleIndex;
          } else if (evaluated.rowRuleIndex === undefined) {
            chosen = cellIndex;
          } else {
            chosen = Math.min(cellIndex, evaluated.rowRuleIndex);
          }
          return matchAt(chosen);
        },
      };
    },
  };
}

/**
 * One-off form of `createConditionalFormat` (the signature named by TASKS
 * T3.3). Prefer the prepared evaluator when evaluating many rows.
 */
export function evaluateRules(
  rules: readonly ConditionalRule[],
  row: Row,
  columns: readonly ColumnDef[],
  options: ConditionalFormatOptions = {},
): ConditionalRuleMatch | null {
  return createConditionalFormat(rules, columns, options).evaluateRules(row);
}
