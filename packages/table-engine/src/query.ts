/**
 * Pure filter/sort query engine (T2.6, SPEC §9.5, ADR-032).
 *
 * The renderer never evaluates a predicate in a component: the query worker
 * and the main-thread fallback both call these functions, so the 12 comparison
 * operators, null handling and sorting semantics have exactly one implementation.
 *
 * Rules (confirmed with the user before T2.6):
 * - text comparisons are case-insensitive using the active UI locale;
 * - `null` and `''` (text) never match value operators; use `isNull`/`notNull`;
 * - `between` is inclusive and accepts swapped bounds;
 * - nulls sort last in both directions, ties keep the physical row order;
 * - text sorting uses `Intl.Collator(locale, { numeric: true, sensitivity: 'variant' })`;
 * - enum sorting uses the option label, enum filtering compares the option value.
 */

import { createAppError, MAX_FILTER_CHILDREN, MAX_SORT_LEVELS, parseCell } from '@curve/domain';
import type {
  Cell,
  ColumnDef,
  CompareOp,
  FilterPredicate,
  Row,
  SortSpec,
  TableMeta,
  ValidationIssueCode,
} from '@curve/domain';

/** Locale used when a caller does not pass the workspace/UI locale. */
export const DEFAULT_QUERY_LOCALE = 'en-US';

/** Above this many rows the renderer runs the query in a dedicated Worker. */
export const QUERY_WORKER_ROW_THRESHOLD = 20_000;

export interface QueryOptions {
  /** BCP 47 locale for text matching and collation. */
  locale?: string;
}

export interface QueryRequest {
  filter?: FilterPredicate;
  /** At most `MAX_SORT_LEVELS` entries; validated by `queryRowIds`. */
  sort?: readonly SortSpec[];
}

export interface QueryResult {
  /** Visible row ids in display order. The caller maps them to its row array. */
  rowIds: string[];
  visibleRows: number;
}

export interface QueryIssue {
  path: string;
  code: ValidationIssueCode;
  message: string;
}

/** Pre-computed lookups shared by all rows of one table snapshot. */
export interface QueryContext {
  table: TableMeta;
  locale: string;
  columnIndex: ReadonlyMap<string, number>;
  collators: Map<string, Intl.Collator>;
  enumLabels: Map<string, ReadonlyMap<string, string>>;
}

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

const EQUALITY_OPERATORS: readonly CompareOp[] = Object.freeze(['eq', 'neq', 'isNull', 'notNull']);

/** Operators offered for a column type (the UI consumes this list). */
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

/** `isNull`/`notNull` do not take a value; every other operator needs one. */
export function compareOpNeedsValue(op: CompareOp): boolean {
  return op !== 'isNull' && op !== 'notNull';
}

/** `between` needs a second value. */
export function compareOpNeedsSecondValue(op: CompareOp): boolean {
  return op === 'between';
}

export function createQueryContext(table: TableMeta, options: QueryOptions = {}): QueryContext {
  const columnIndex = new Map<string, number>();
  const enumLabels = new Map<string, ReadonlyMap<string, string>>();
  table.columns.forEach((column, index) => {
    columnIndex.set(column.id, index);
    if (column.type === 'enum' && column.enumOptions !== undefined) {
      enumLabels.set(
        column.id,
        new Map(column.enumOptions.map((option) => [option.value, option.label])),
      );
    }
  });
  return {
    table,
    locale: options.locale ?? DEFAULT_QUERY_LOCALE,
    columnIndex,
    collators: new Map(),
    enumLabels,
  };
}

function collatorFor(context: QueryContext, columnId: string, numeric: boolean): Intl.Collator {
  const cacheKey = `${columnId}:${numeric ? 'numeric' : 'text'}`;
  const existing = context.collators.get(cacheKey);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Intl.Collator(context.locale, {
    numeric,
    sensitivity: 'variant',
  });
  context.collators.set(cacheKey, created);
  return created;
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

function validateFilterValue(
  value: Cell | undefined,
  column: ColumnDef,
  path: string,
): QueryIssue[] {
  if (value === null || value === undefined) {
    return [
      {
        path,
        code: 'E_VALIDATION',
        message: `operator on column "${column.key}" needs a value`,
      },
    ];
  }
  const parsed = parseCell(value, column);
  if (!parsed.ok) {
    return [{ path, code: parsed.code, message: parsed.message }];
  }
  if (column.type === 'text' && value === '') {
    return [
      {
        path,
        code: 'E_VALIDATION',
        message: `empty text is null; use isNull on column "${column.key}"`,
      },
    ];
  }
  return [];
}

function walkFilter(
  table: TableMeta,
  predicate: FilterPredicate,
  path: string,
  issues: QueryIssue[],
): void {
  if (predicate.kind !== 'compare') {
    if (predicate.children.length === 0) {
      issues.push({
        path,
        code: 'E_VALIDATION',
        message: 'a filter group needs at least one child',
      });
    }
    if (predicate.children.length > MAX_FILTER_CHILDREN) {
      issues.push({
        path,
        code: 'E_RANGE',
        message: `a filter group may contain at most ${String(MAX_FILTER_CHILDREN)} children`,
      });
    }
    predicate.children.forEach((child, index) => {
      walkFilter(table, child, `${path}.children[${index}]`, issues);
    });
    return;
  }

  const column = table.columns.find((candidate) => candidate.id === predicate.columnId);
  if (column === undefined) {
    issues.push({
      path,
      code: 'E_VALIDATION',
      message: `filter references unknown column "${predicate.columnId}"`,
    });
    return;
  }
  const allowed = allowedCompareOps(column);
  if (!allowed.includes(predicate.op)) {
    issues.push({
      path: `${path}.op`,
      code: 'E_VALIDATION',
      message: `operator "${predicate.op}" is not supported for ${column.type} column "${column.key}"`,
    });
    return;
  }

  if (compareOpNeedsValue(predicate.op)) {
    issues.push(...validateFilterValue(predicate.value, column, `${path}.value`));
    if (compareOpNeedsSecondValue(predicate.op)) {
      issues.push(...validateFilterValue(predicate.value2, column, `${path}.value2`));
    } else if (predicate.value2 !== undefined) {
      issues.push({
        path: `${path}.value2`,
        code: 'E_VALIDATION',
        message: `operator "${predicate.op}" does not take a second value`,
      });
    }
  } else if (predicate.value !== undefined || predicate.value2 !== undefined) {
    issues.push({
      path,
      code: 'E_VALIDATION',
      message: `operator "${predicate.op}" does not take a value`,
    });
  }
}

/** Structural and type validation for a persisted/UI-built predicate. */
export function validateFilterPredicate(
  table: TableMeta,
  predicate: FilterPredicate,
): QueryIssue[] {
  const issues: QueryIssue[] = [];
  walkFilter(table, predicate, 'filter', issues);
  return issues;
}

/** Structural validation for the sort levels of one view. */
export function validateSortSpecs(table: TableMeta, sort: readonly SortSpec[]): QueryIssue[] {
  const issues: QueryIssue[] = [];
  if (sort.length > MAX_SORT_LEVELS) {
    issues.push({
      path: 'sort',
      code: 'E_RANGE',
      message: `at most ${String(MAX_SORT_LEVELS)} sort levels are allowed`,
    });
  }
  const seen = new Set<string>();
  sort.forEach((spec, index) => {
    if (!table.columns.some((column) => column.id === spec.columnId)) {
      issues.push({
        path: `sort[${index}].columnId`,
        code: 'E_VALIDATION',
        message: `sort references unknown column "${spec.columnId}"`,
      });
    }
    if (seen.has(spec.columnId)) {
      issues.push({
        path: `sort[${index}].columnId`,
        code: 'E_DUPLICATE_KEY',
        message: `column "${spec.columnId}" appears more than once in the sort`,
      });
    }
    seen.add(spec.columnId);
  });
  return issues;
}

function equalsCell(cell: Cell, value: Cell, column: ColumnDef, locale: string): boolean {
  switch (column.type) {
    case 'text':
      return normalizeText(textOf(cell), locale) === normalizeText(textOf(value), locale);
    case 'number':
    case 'date':
      return typeof cell === 'number' && typeof value === 'number' && cell === value;
    case 'boolean':
      return typeof cell === 'boolean' && typeof value === 'boolean' && cell === value;
    case 'enum':
      return typeof cell === 'string' && typeof value === 'string' && cell === value;
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
  cell: Cell,
  value: Cell,
  op: 'contains' | 'startsWith' | 'endsWith',
  locale: string,
): boolean {
  const haystack = normalizeText(textOf(cell), locale);
  const needle = normalizeText(textOf(value), locale);
  switch (op) {
    case 'contains':
      return haystack.includes(needle);
    case 'startsWith':
      return haystack.startsWith(needle);
    case 'endsWith':
      return haystack.endsWith(needle);
  }
}

function matchesCompare(
  row: Row,
  context: QueryContext,
  predicate: Extract<FilterPredicate, { kind: 'compare' }>,
): boolean {
  const index = context.columnIndex.get(predicate.columnId);
  if (index === undefined) {
    return false;
  }
  const column = context.table.columns[index];
  if (column === undefined) {
    return false;
  }
  const cell = row.values[index] ?? null;

  if (predicate.op === 'isNull') {
    return isNullish(cell, column);
  }
  if (predicate.op === 'notNull') {
    return !isNullish(cell, column);
  }
  if (isNullish(cell, column)) {
    return false;
  }

  const value = predicate.value;
  if (value === undefined) {
    return false;
  }

  switch (predicate.op) {
    case 'eq':
      return equalsCell(cell, value, column, context.locale);
    case 'neq':
      return !equalsCell(cell, value, column, context.locale);
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      return column.type === 'text'
        ? compareTextOp(cell, value, predicate.op, context.locale)
        : false;
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
      const second = predicate.value2;
      if (second === undefined) {
        return false;
      }
      const first = numericOf(value);
      const last = numericOf(second);
      const current = numericOf(cell);
      if (first === null || last === null || current === null) {
        return false;
      }
      const lower = Math.min(first, last);
      const upper = Math.max(first, last);
      return current >= lower && current <= upper;
    }
  }
}

/** Evaluates a predicate for one row; never throws for a valid shape. */
export function matchesFilterPredicate(
  row: Row,
  context: QueryContext,
  predicate: FilterPredicate,
): boolean {
  if (predicate.kind === 'compare') {
    return matchesCompare(row, context, predicate);
  }
  if (predicate.kind === 'any') {
    return predicate.children.some((child) => matchesFilterPredicate(row, context, child));
  }
  return predicate.children.every((child) => matchesFilterPredicate(row, context, child));
}

function filterRows(
  rows: readonly Row[],
  context: QueryContext,
  predicate: FilterPredicate,
): readonly Row[] {
  return rows.filter((row) => matchesFilterPredicate(row, context, predicate));
}

/**
 * Natural-sort key used to keep numeric-aware text sorting fast.
 *
 * `Intl.Collator(numeric: true)` is correct but ~500ms for 100k random text
 * values (ICU compares digit sequences on every comparison). Padding each digit
 * run to 12 characters and comparing the keys with `numeric: false` gives the
 * same order for normal text while meeting the 400ms budget. Values where the
 * shortcut is unsafe (signed numbers, >12-digit runs) fall back to the literal
 * `numeric: true` collator.
 */
const NATURAL_SORT_WIDTH = 12;
const LONG_DIGIT_RUN = /\d{13,}/;

function naturalSortKey(value: string): string {
  return value.replace(/\d+/g, (digits) => digits.padStart(NATURAL_SORT_WIDTH, '0'));
}

interface SortPlan {
  index: number;
  column: ColumnDef;
  direction: 'asc' | 'desc';
  /** Plain base keys are used for ASCII text; non-ASCII falls back to collation. */
  mode: 'plain' | 'collator' | 'raw';
  collator: Intl.Collator | null;
  keys: readonly string[] | null;
  baseKeys: readonly string[] | null;
}

function buildSortPlans(
  rows: readonly Row[],
  context: QueryContext,
  sort: readonly SortSpec[],
): SortPlan[] {
  const plans: SortPlan[] = [];
  for (const spec of sort) {
    const index = context.columnIndex.get(spec.columnId);
    if (index === undefined) {
      continue;
    }
    const column = context.table.columns[index];
    if (column === undefined) {
      continue;
    }
    const plan: SortPlan = {
      index,
      column,
      direction: spec.direction,
      mode: 'raw',
      collator: null,
      keys: null,
      baseKeys: null,
    };
    if (column.type === 'text' || column.type === 'enum') {
      const labels = column.type === 'enum' ? context.enumLabels.get(column.id) : undefined;
      const keys: string[] = [];
      let usable = true;
      let ascii = true;
      let hasUppercase = false;
      for (const row of rows) {
        const cell = row.values[index] ?? null;
        const source =
          column.type === 'enum' ? (labels?.get(textOf(cell)) ?? textOf(cell)) : textOf(cell);
        if (/(^|[\s(=,])[+-]\d/.test(source) || LONG_DIGIT_RUN.test(source)) {
          usable = false;
          break;
        }
        if (!/^[\u0000-\u007f]*$/.test(source)) {
          ascii = false;
        }
        if (/[A-Z]/.test(source)) {
          hasUppercase = true;
        }
        keys.push(isNullish(cell, column) ? '' : naturalSortKey(source));
      }
      if (usable) {
        plan.keys = keys;
        if (ascii) {
          plan.mode = 'plain';
          plan.baseKeys = hasUppercase ? keys.map((key) => key.toLowerCase()) : keys;
          plan.collator = collatorFor(context, column.id, false);
        } else {
          plan.mode = 'collator';
          plan.collator = collatorFor(context, column.id, false);
        }
      } else {
        plan.mode = 'raw';
        plan.collator = collatorFor(context, column.id, true);
      }
    }
    plans.push(plan);
  }
  return plans;
}

function compareKeys(plan: SortPlan, leftIndex: number, rightIndex: number): number {
  if (plan.collator === null || plan.keys === null) {
    return 0;
  }
  if (plan.mode === 'plain' && plan.baseKeys !== null) {
    const leftBase = plan.baseKeys[leftIndex] ?? '';
    const rightBase = plan.baseKeys[rightIndex] ?? '';
    if (leftBase < rightBase) {
      return -1;
    }
    if (leftBase > rightBase) {
      return 1;
    }
    return plan.collator.compare(plan.keys[leftIndex] ?? '', plan.keys[rightIndex] ?? '');
  }
  if (plan.mode === 'collator') {
    return plan.collator.compare(plan.keys[leftIndex] ?? '', plan.keys[rightIndex] ?? '');
  }
  return 0;
}

function compareRows(
  leftIndex: number,
  rightIndex: number,
  rows: readonly Row[],
  context: QueryContext,
  plans: readonly SortPlan[],
): number {
  const left = rows[leftIndex];
  const right = rows[rightIndex];
  if (left === undefined || right === undefined) {
    return leftIndex - rightIndex;
  }
  for (const plan of plans) {
    const column = plan.column;
    const first = left.values[plan.index] ?? null;
    const second = right.values[plan.index] ?? null;
    const firstNull = isNullish(first, column);
    const secondNull = isNullish(second, column);
    if (firstNull && secondNull) {
      continue;
    }
    // Nulls sort last in both directions (SPEC §9.5 / confirmed decision).
    if (firstNull) {
      return 1;
    }
    if (secondNull) {
      return -1;
    }

    let compared = 0;
    switch (column.type) {
      case 'text':
        compared =
          plan.mode === 'raw'
            ? (plan.collator?.compare(textOf(first), textOf(second)) ?? 0)
            : compareKeys(plan, leftIndex, rightIndex);
        break;
      case 'number':
      case 'date': {
        const leftNumber = numericOf(first);
        const rightNumber = numericOf(second);
        if (leftNumber !== null && rightNumber !== null) {
          compared = leftNumber - rightNumber;
        }
        break;
      }
      case 'boolean':
        compared = (first === true ? 1 : 0) - (second === true ? 1 : 0);
        break;
      case 'enum':
        if (plan.mode === 'raw') {
          const labels = context.enumLabels.get(column.id);
          compared =
            plan.collator?.compare(
              labels?.get(textOf(first)) ?? textOf(first),
              labels?.get(textOf(second)) ?? textOf(second),
            ) ?? 0;
        } else {
          compared = compareKeys(plan, leftIndex, rightIndex);
        }
        break;
    }
    if (compared !== 0) {
      return plan.direction === 'desc' ? -compared : compared;
    }
  }
  return 0;
}

function sortRows(
  rows: readonly Row[],
  context: QueryContext,
  sort: readonly SortSpec[],
): readonly Row[] {
  if (sort.length === 0 || rows.length <= 1) {
    return rows;
  }
  const plans = buildSortPlans(rows, context, sort);
  const order = rows.map((_row, index) => index);
  order.sort((left, right) => {
    const compared = compareRows(left, right, rows, context, plans);
    // Stable tie-break: physical row order stays the final order.
    return compared === 0 ? left - right : compared;
  });
  return order.map((index) => rows[index] as Row);
}

/** Public filter helper for tests and non-worker callers. */
export function applyFilter(
  rows: readonly Row[],
  table: TableMeta,
  predicate: FilterPredicate,
  options: QueryOptions = {},
): Row[] {
  return [...filterRows(rows, createQueryContext(table, options), predicate)];
}

/** Public sort helper for tests and non-worker callers. */
export function applySort(
  rows: readonly Row[],
  table: TableMeta,
  sort: readonly SortSpec[],
  options: QueryOptions = {},
): Row[] {
  return [...sortRows(rows, createQueryContext(table, options), sort)];
}

function assertValidQuery(table: TableMeta, request: QueryRequest): void {
  const issues: QueryIssue[] = [];
  if (request.filter !== undefined) {
    issues.push(...validateFilterPredicate(table, request.filter));
  }
  issues.push(...validateSortSpecs(table, request.sort ?? []));
  if (issues.length > 0) {
    const first = issues[0];
    throw createAppError('E_VALIDATION', first?.message ?? 'The view query is invalid.', {
      detail: `${first?.path ?? 'query'}:${String(issues.length)}`,
    });
  }
}

/** Runs a validated filter + sort over one table snapshot. */
export function queryRowIdsWithContext(
  rows: readonly Row[],
  context: QueryContext,
  request: QueryRequest,
): QueryResult {
  assertValidQuery(context.table, request);
  const filtered = request.filter === undefined ? rows : filterRows(rows, context, request.filter);
  const sorted = sortRows(filtered, context, request.sort ?? []);
  return { rowIds: sorted.map((row) => row.id), visibleRows: sorted.length };
}

/** Builds a context and runs the query; convenience for the renderer fallback. */
export function queryRowIds(
  rows: readonly Row[],
  table: TableMeta,
  request: QueryRequest,
  options: QueryOptions = {},
): QueryResult {
  return queryRowIdsWithContext(rows, createQueryContext(table, options), request);
}
