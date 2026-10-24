/**
 * Shared comparison semantics for filters and conditional formatting
 * (SPEC §9.5, §10.4; T3.3).
 *
 * `@curve/table-engine` owns the query context, the prepared-value cache and the
 * sorting plans. The actual 12 comparison operators, null handling and text
 * normalisation live here so conditional rules reuse exactly the same semantics
 * instead of growing a second implementation (ADR-036).
 *
 * `mode` is the only deliberate difference:
 * - `filter`: number/date only support numeric comparisons (the UI whitelist);
 * - `condition`: number/date additionally support `contains`, compared against
 *   the stringified value as SPEC §10.4 requires.
 */

import type { Cell, ColumnDef, CompareOp, FilterPredicate } from './types';

export type CompareMode = 'filter' | 'condition';

/** Locale used when a caller does not pass the workspace/UI locale. */
export const DEFAULT_COMPARE_LOCALE = 'en-US';

const TEXT_OPERATORS: readonly CompareOp[] = Object.freeze([
  'eq',
  'neq',
  'contains',
  'startsWith',
  'endsWith',
  'isNull',
  'notNull',
]);

const RANGE_OPERATORS: readonly CompareOp[] = Object.freeze([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'isNull',
  'notNull',
]);

/** Conditional rules may additionally stringify number/date for `contains`. */
const CONDITION_RANGE_OPERATORS: readonly CompareOp[] = Object.freeze([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'contains',
  'isNull',
  'notNull',
]);

const EQUALITY_OPERATORS: readonly CompareOp[] = Object.freeze(['eq', 'neq', 'isNull', 'notNull']);

/**
 * Operators offered for a column type by the filter builder (SPEC §9.5).
 * Kept in domain so both the query engine and the UI read one whitelist.
 */
export function allowedCompareOps(column: ColumnDef): readonly CompareOp[] {
  switch (column.type) {
    case 'text':
      return TEXT_OPERATORS;
    case 'number':
    case 'date':
      return RANGE_OPERATORS;
    case 'boolean':
    case 'enum':
      return EQUALITY_OPERATORS;
  }
}

/**
 * Operators a conditional rule may use on a column (SPEC §10.4).
 *
 * This is a superset of `allowedCompareOps` only for number/date `contains`;
 * the filter UI keeps its narrower list.
 */
export function conditionCompareOps(column: ColumnDef): readonly CompareOp[] {
  if (column.type === 'number' || column.type === 'date') {
    return CONDITION_RANGE_OPERATORS;
  }
  return allowedCompareOps(column);
}

/** `isNull`/`notNull` do not take a value; every other operator needs one. */
export function compareOpNeedsValue(op: CompareOp): boolean {
  return op !== 'isNull' && op !== 'notNull';
}

/** `between` needs a second value. */
export function compareOpNeedsSecondValue(op: CompareOp): boolean {
  return op === 'between';
}

type ComparePredicate = Extract<FilterPredicate, { kind: 'compare' }>;

export interface PrepareComparisonOptions {
  /** BCP 47 locale for case-insensitive text matching. */
  locale?: string;
  mode?: CompareMode;
}

/**
 * Everything needed to evaluate one comparison against many cells.
 *
 * The table-engine caches this per predicate (T2.7); conditional rules cache it
 * per rule, so neither caller normalises the needle for every row.
 */
export interface PreparedComparison {
  readonly column: ColumnDef;
  readonly op: CompareOp;
  readonly value?: Cell;
  readonly value2?: Cell;
  /** Locale-normalized needle for text ops (and conditional number contains). */
  readonly needle: string | null;
  readonly locale: string;
  readonly mode: CompareMode;
}

function isNullish(cell: Cell | undefined, column: ColumnDef): boolean {
  return cell === null || cell === undefined || (column.type === 'text' && cell === '');
}

function normalizeText(value: string, locale: string): string {
  return value.toLocaleLowerCase(locale);
}

function textOf(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) {
    return '';
  }
  return typeof cell === 'string' ? cell : String(cell);
}

function numericOf(cell: Cell | undefined): number | null {
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}

function usesTextNeedle(column: ColumnDef, op: CompareOp, mode: CompareMode): boolean {
  if (op !== 'contains' && op !== 'startsWith' && op !== 'endsWith') {
    return false;
  }
  if (column.type === 'text') {
    return true;
  }
  return (
    mode === 'condition' &&
    op === 'contains' &&
    (column.type === 'number' || column.type === 'date')
  );
}

export function prepareComparison(
  column: ColumnDef,
  predicate: Pick<ComparePredicate, 'op' | 'value' | 'value2'>,
  options: PrepareComparisonOptions = {},
): PreparedComparison {
  const locale = options.locale ?? DEFAULT_COMPARE_LOCALE;
  const mode = options.mode ?? 'filter';
  const value = predicate.value;
  const needle =
    usesTextNeedle(column, predicate.op, mode) && value !== undefined
      ? normalizeText(textOf(value), locale)
      : null;

  return {
    column,
    op: predicate.op,
    ...(value === undefined ? {} : { value }),
    ...(predicate.value2 === undefined ? {} : { value2: predicate.value2 }),
    needle,
    locale,
    mode,
  };
}

function equalsTyped(cell: Cell, value: Cell, column: ColumnDef): boolean {
  switch (column.type) {
    case 'number':
    case 'date':
      return typeof cell === 'number' && typeof value === 'number' && cell === value;
    case 'boolean':
      return typeof cell === 'boolean' && typeof value === 'boolean' && cell === value;
    case 'enum':
      return typeof cell === 'string' && typeof value === 'string' && cell === value;
    case 'text':
      // Text equality is normalized by the caller before this helper.
      return false;
  }
}

function compareNumericCell(cell: Cell, value: Cell): number | null {
  const left = numericOf(cell);
  const right = numericOf(value);
  if (left === null || right === null) {
    return null;
  }
  return left - right;
}

function compareTextOp(
  haystack: string,
  needle: string,
  op: 'contains' | 'startsWith' | 'endsWith',
): boolean {
  switch (op) {
    case 'contains':
      return haystack.includes(needle);
    case 'startsWith':
      return haystack.startsWith(needle);
    case 'endsWith':
      return haystack.endsWith(needle);
  }
}

/**
 * Evaluates one prepared comparison; never throws for a valid predicate shape.
 * Type mismatches simply do not match, matching the filter engine's contract.
 */
export function matchesPreparedComparison(cell: Cell, prepared: PreparedComparison): boolean {
  const { column, op } = prepared;

  if (op === 'isNull') {
    return isNullish(cell, column);
  }
  if (op === 'notNull') {
    return !isNullish(cell, column);
  }
  if (isNullish(cell, column)) {
    return false;
  }

  const value = prepared.value;
  if (value === undefined || value === null) {
    // Null is expressed with isNull/notNull, never with a value operator.
    return false;
  }

  const needle = prepared.needle ?? normalizeText(textOf(value), prepared.locale);

  switch (op) {
    case 'eq':
      return column.type === 'text'
        ? normalizeText(textOf(cell), prepared.locale) === needle
        : equalsTyped(cell, value, column);
    case 'neq':
      return column.type === 'text'
        ? normalizeText(textOf(cell), prepared.locale) !== needle
        : !equalsTyped(cell, value, column);
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      if (column.type === 'text') {
        return compareTextOp(normalizeText(textOf(cell), prepared.locale), needle, op);
      }
      if (
        prepared.mode === 'condition' &&
        op === 'contains' &&
        (column.type === 'number' || column.type === 'date')
      ) {
        // SPEC §10.4: number/date `contains` compares the stringified value.
        return normalizeText(textOf(cell), prepared.locale).includes(needle);
      }
      return false;
    case 'gt': {
      const compared = compareNumericCell(cell, value);
      return compared !== null && compared > 0;
    }
    case 'gte': {
      const compared = compareNumericCell(cell, value);
      return compared !== null && compared >= 0;
    }
    case 'lt': {
      const compared = compareNumericCell(cell, value);
      return compared !== null && compared < 0;
    }
    case 'lte': {
      const compared = compareNumericCell(cell, value);
      return compared !== null && compared <= 0;
    }
    case 'between': {
      const second = prepared.value2;
      if (second === undefined) {
        return false;
      }
      const firstNumber = numericOf(value);
      const secondNumber = numericOf(second);
      const current = numericOf(cell);
      if (firstNumber === null || secondNumber === null || current === null) {
        return false;
      }
      const lower = Math.min(firstNumber, secondNumber);
      const upper = Math.max(firstNumber, secondNumber);
      return current >= lower && current <= upper;
    }
  }
}
