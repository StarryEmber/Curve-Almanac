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
  /**
   * T2.7: `matchesCompare` runs once per row, so the column lookup and the
   * normalized comparison value are resolved once per predicate instead of
   * 100k times (the text value was re-normalized for every row before).
   */
  compareCache: WeakMap<object, PreparedCompare>;
}

export interface PreparedCompare {
  index: number;
  column: ColumnDef;
  /** Locale-normalized text value for eq/neq/contains/startsWith/endsWith. */
  needle: string | null;
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
    compareCache: new WeakMap(),
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

function equalsNormalizedText(cell: Cell, needle: string, locale: string): boolean {
  return normalizeText(textOf(cell), locale) === needle;
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
  needle: string,
  op: 'contains' | 'startsWith' | 'endsWith',
  locale: string,
): boolean {
  const haystack = normalizeText(textOf(cell), locale);
  switch (op) {
    case 'contains':
      return haystack.includes(needle);
    case 'startsWith':
      return haystack.startsWith(needle);
    case 'endsWith':
      return haystack.endsWith(needle);
  }
}

function prepareCompare(
  context: QueryContext,
  predicate: Extract<FilterPredicate, { kind: 'compare' }>,
): PreparedCompare | null {
  const cached = context.compareCache.get(predicate);
  if (cached !== undefined) {
    return cached;
  }
  const index = context.columnIndex.get(predicate.columnId);
  if (index === undefined) {
    return null;
  }
  const column = context.table.columns[index];
  if (column === undefined) {
    return null;
  }
  const value = predicate.value;
  const needle =
    column.type === 'text' && value !== undefined
      ? normalizeText(textOf(value), context.locale)
      : null;
  const prepared: PreparedCompare = { index, column, needle };
  context.compareCache.set(predicate, prepared);
  return prepared;
}

function matchesCompare(
  row: Row,
  context: QueryContext,
  predicate: Extract<FilterPredicate, { kind: 'compare' }>,
): boolean {
  const prepared = prepareCompare(context, predicate);
  if (prepared === null) {
    return false;
  }
  const { column } = prepared;
  const cell = row.values[prepared.index] ?? null;

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
  const needle = prepared.needle ?? normalizeText(textOf(value), context.locale);

  switch (predicate.op) {
    case 'eq':
      return column.type === 'text'
        ? equalsNormalizedText(cell, needle, context.locale)
        : equalsCell(cell, value, column, context.locale);
    case 'neq':
      return column.type === 'text'
        ? !equalsNormalizedText(cell, needle, context.locale)
        : !equalsCell(cell, value, column, context.locale);
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      return column.type === 'text'
        ? compareTextOp(cell, needle, predicate.op, context.locale)
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
  /** Natural keys (plain/collator) or raw/label strings (raw) for text/enum. */
  keys: readonly string[] | null;
  baseKeys: readonly string[] | null;
  /** T2.7: per-row flags/values so comparisons never touch row objects again. */
  nulls: Uint8Array;
  numbers: Float64Array | null;
  neutrals: Uint8Array | null;
  booleans: Uint8Array | null;
}

const ASCII_ONLY = /^[\u0000-\u007f]*$/;
const UPPERCASE = /[A-Z]/;
const DIGIT_RUN = /\d/;
const UNSAFE_DIGITS = /(^|[\s(=,])[+-]\d/;

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
    const nulls = new Uint8Array(rows.length);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const cell = rows[rowIndex]?.values[index] ?? null;
      nulls[rowIndex] = isNullish(cell, column) ? 1 : 0;
    }
    const plan: SortPlan = {
      index,
      column,
      direction: spec.direction,
      mode: 'raw',
      collator: null,
      keys: null,
      baseKeys: null,
      nulls,
      numbers: null,
      neutrals: null,
      booleans: null,
    };

    if (column.type === 'text' || column.type === 'enum') {
      const labels = column.type === 'enum' ? context.enumLabels.get(column.id) : undefined;
      const sources: string[] = new Array<string>(rows.length);
      let usable = true;
      let ascii = true;
      let hasUppercase = false;
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const cell = rows[rowIndex]?.values[index] ?? null;
        const source =
          column.type === 'enum' ? (labels?.get(textOf(cell)) ?? textOf(cell)) : textOf(cell);
        sources[rowIndex] = source;
        if (usable && (UNSAFE_DIGITS.test(source) || LONG_DIGIT_RUN.test(source))) {
          usable = false;
        }
        if (ascii && !ASCII_ONLY.test(source)) {
          ascii = false;
        }
        if (!hasUppercase && UPPERCASE.test(source)) {
          hasUppercase = true;
        }
      }
      if (usable && ascii) {
        const keys = new Array<string>(rows.length);
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const source = sources[rowIndex] ?? '';
          keys[rowIndex] = DIGIT_RUN.test(source) ? naturalSortKey(source) : source;
        }
        plan.keys = keys;
        plan.collator = collatorFor(context, column.id, false);
        plan.mode = 'plain';
        plan.baseKeys = hasUppercase ? keys.map((key) => key.toLowerCase()) : keys;
      } else {
        // T2.7: non-ASCII text now uses the literal `numeric: true` collator on
        // the raw value instead of a zero-padded natural key. That is exactly
        // the reference semantics from ADR-032 and avoids the padding cost on
        // CJK values ("站点-北京-0" -> a 12-character digit run): measured
        // 100k CJK sort went from ~1.1s to ~0.65s. The unsafe-digit check above
        // only gates the ASCII fast path now.
        plan.mode = 'raw';
        plan.keys = sources;
        plan.collator = collatorFor(context, column.id, true);
      }
    } else if (column.type === 'number' || column.type === 'date') {
      const numbers = new Float64Array(rows.length);
      const neutrals = new Uint8Array(rows.length);
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        if (nulls[rowIndex] === 1) {
          continue;
        }
        const numeric = numericOf(rows[rowIndex]?.values[index] ?? null);
        if (numeric === null) {
          neutrals[rowIndex] = 1;
        } else {
          numbers[rowIndex] = numeric;
        }
      }
      plan.numbers = numbers;
      plan.neutrals = neutrals;
    } else {
      const booleans = new Uint8Array(rows.length);
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        booleans[rowIndex] = rows[rowIndex]?.values[index] === true ? 1 : 0;
      }
      plan.booleans = booleans;
    }
    plans.push(plan);
  }
  return plans;
}

function compareTextPlan(plan: SortPlan, leftIndex: number, rightIndex: number): number {
  const keys = plan.keys;
  const collator = plan.collator;
  if (keys === null || collator === null) {
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
    return collator.compare(keys[leftIndex] ?? '', keys[rightIndex] ?? '');
  }
  return collator.compare(keys[leftIndex] ?? '', keys[rightIndex] ?? '');
}

/**
 * Compares two row indexes using the pre-computed plan arrays.
 *
 * T2.7 (ADR-033): the previous version read both row objects and called
 * `isNullish`/`textOf`/`numericOf` on every comparison. On 100k rows that random
 * object access dominated text sorts; the plan now holds typed arrays and keys,
 * so the comparator stays inside contiguous buffers.
 */
function compareRows(leftIndex: number, rightIndex: number, plans: readonly SortPlan[]): number {
  for (const plan of plans) {
    const firstNull = plan.nulls[leftIndex] === 1;
    const secondNull = plan.nulls[rightIndex] === 1;
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
    switch (plan.column.type) {
      case 'text':
      case 'enum':
        compared = compareTextPlan(plan, leftIndex, rightIndex);
        break;
      case 'number':
      case 'date': {
        if (
          plan.neutrals !== null &&
          (plan.neutrals[leftIndex] === 1 || plan.neutrals[rightIndex] === 1)
        ) {
          break;
        }
        compared = (plan.numbers?.[leftIndex] ?? 0) - (plan.numbers?.[rightIndex] ?? 0);
        break;
      }
      case 'boolean':
        compared = (plan.booleans?.[leftIndex] ?? 0) - (plan.booleans?.[rightIndex] ?? 0);
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
    const compared = compareRows(left, right, plans);
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
