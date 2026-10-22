/**
 * CSV/JSON import parsing, sniffing, type inference and all-or-nothing row
 * planning (T2.5, SPEC §9.4).
 *
 * This module is pure: it works on strings and domain values, has no DOM or
 * Node dependencies and never touches a file. The renderer Worker decodes bytes
 * and calls it; the app-core command calls the same `planImport` again so a
 * stale preview can never commit rows the current schema would reject.
 */

import Papa from 'papaparse';

import {
  coerceCell,
  createAppError,
  createRowId,
  MAX_COLUMNS_PER_TABLE,
  parseColumnDef,
} from '@curve/domain';
import type { AppError, Cell, ColumnDef, Row, TableMeta, UuidFactory } from '@curve/domain';

import { MAX_ROWS_PER_TABLE } from './jsonl';

export type ImportDelimiter = ',' | ';' | '\t' | '|';
export type ImportFormat = 'csv' | 'json';
export type ImportMode = 'append' | 'replace';
export type ImportColumnType = 'text' | 'number' | 'date' | 'boolean';
export type ImportCellValue = string | number | boolean | null;

export const IMPORT_DELIMITERS: readonly ImportDelimiter[] = [',', ';', '\t', '|'];
export const IMPORT_TYPE_SAMPLE_SIZE = 1_000;
export const IMPORT_CONFIDENCE_THRESHOLD = 0.8;

export interface ImportedColumn {
  /** 0-based source column index. */
  index: number;
  name: string;
  type: ImportColumnType;
  /** 0..1 over the sampled non-empty values. */
  confidence: number;
  sampleSize: number;
}

export interface ParsedImportData {
  format: ImportFormat;
  delimiter?: ImportDelimiter;
  hasHeader: boolean;
  headers: string[];
  rows: ImportCellValue[][];
  totalRows: number;
  warnings: string[];
  columns: ImportedColumn[];
}

export interface CsvParseOptions {
  delimiter?: ImportDelimiter;
  hasHeader?: boolean;
  sampleSize?: number;
}

export interface CsvSniffResult {
  delimiter: ImportDelimiter;
  hasHeader: boolean;
}

export interface ImportTypeInference {
  type: ImportColumnType;
  confidence: number;
  sampleSize: number;
}

export interface ImportDataset {
  headers: string[];
  rows: readonly ImportCellValue[][];
  /** Present when the caller passes a full `ParsedImportData`; not required. */
  format?: ImportFormat;
  delimiter?: ImportDelimiter;
  hasHeader?: boolean;
  totalRows?: number;
  warnings?: string[];
  columns?: ImportedColumn[];
}

export type ImportTarget =
  | { kind: 'existing'; columnId: string }
  | { kind: 'new'; newColumnIndex: number }
  | { kind: 'ignore' };

export interface ImportColumnMapping {
  /** 0-based source column index. Exactly one mapping per source column. */
  sourceIndex: number;
  target: ImportTarget;
}

export interface ImportIssue {
  /** 1-based data row, excluding the header row (SPEC §8.2). */
  row: number;
  columnId?: string;
  columnName?: string;
  value: ImportCellValue;
  code:
    | 'E_TYPE'
    | 'E_REQUIRED'
    | 'E_DUPLICATE_KEY'
    | 'E_ENUM'
    | 'E_RANGE'
    | 'E_VALIDATION'
    | 'E_IMPORT_FORMAT';
  message: string;
}

export interface ImportStats {
  total: number;
  accepted: number;
  skipped: number;
}

export interface ImportPlanRequest {
  table: TableMeta;
  /** Existing rows; used for append key conflicts and the final row count. */
  rows: readonly Row[];
  /**
   * Optional compact summary for the Worker path, which must not receive the
   * whole existing table. Overrides `rows` for key conflicts/count when set.
   */
  existingKeys?: readonly Cell[];
  existingRowCount?: number;
  dataset: ImportDataset;
  mappings: readonly ImportColumnMapping[];
  /** New columns already validated by the form layer; appended to the schema. */
  newColumns?: readonly ColumnDef[];
  mode: ImportMode;
  /** When false, any issue fails the whole plan. */
  skipInvalid: boolean;
  uuid?: UuidFactory;
}

export interface ImportPlanSuccess {
  readonly ok: true;
  /** Only the imported rows; append is performed by `table.import`. */
  rows: Row[];
  newColumns: ColumnDef[];
  stats: ImportStats;
  issues: ImportIssue[];
  totalIssues: number;
  finalRowCount: number;
}

export interface ImportPlanFailure {
  readonly ok: false;
  error: AppError;
  issues: ImportIssue[];
  totalIssues: number;
  stats: ImportStats;
}

export type ImportPlan = ImportPlanSuccess | ImportPlanFailure;

interface TargetColumn {
  column: ColumnDef;
  index: number;
  sourceIndex: number;
}

interface CellKind {
  kind: 'empty' | ImportColumnType;
}

const NUMBER_COLUMN = {
  id: 'col_number',
  key: 'number',
  label: 'number',
  type: 'number',
  role: 'none',
} satisfies ColumnDef;

const DATE_COLUMN = {
  id: 'col_date',
  key: 'date',
  label: 'date',
  type: 'date',
  role: 'none',
} satisfies ColumnDef;

const BOOLEAN_TOKENS = new Set(['true', 'false', '是', '否']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+Z-]+)?$/;

function isBlank(value: ImportCellValue | Cell | undefined): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function isBooleanToken(value: ImportCellValue): boolean {
  if (typeof value === 'boolean') {
    return true;
  }
  return typeof value === 'string' && BOOLEAN_TOKENS.has(value.trim().toLowerCase());
}

function isDateToken(value: ImportCellValue): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return DATE_PATTERN.test(trimmed) && coerceCell(trimmed, DATE_COLUMN).ok;
}

function isNumberToken(value: ImportCellValue): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  return coerceCell(value, NUMBER_COLUMN).ok;
}

function cellKind(value: ImportCellValue): CellKind {
  if (isBlank(value)) {
    return { kind: 'empty' };
  }
  if (isBooleanToken(value)) {
    return { kind: 'boolean' };
  }
  if (isDateToken(value)) {
    return { kind: 'date' };
  }
  if (isNumberToken(value)) {
    return { kind: 'number' };
  }
  return { kind: 'text' };
}

function emptyCell(column: ColumnDef): Cell {
  return column.type === 'text' ? '' : null;
}

function normalizeHeaders(raw: readonly string[]): { headers: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const used = new Set<string>();
  const headers: string[] = [];

  raw.forEach((value, index) => {
    const base = value.trim().length === 0 ? `column_${String(index + 1)}` : value.trim();
    let candidate = base.slice(0, 80);
    let suffix = 2;
    while (used.has(candidate)) {
      const suffixText = `_${String(suffix)}`;
      candidate = `${base.slice(0, Math.max(1, 80 - suffixText.length))}${suffixText}`;
      suffix += 1;
    }
    if (candidate !== base) {
      warnings.push(`duplicate header "${base}" was renamed to "${candidate}"`);
    }
    used.add(candidate);
    headers.push(candidate);
  });

  return { headers, warnings };
}

function sampleRowsForSniffing(text: string): string[][] {
  return Papa.parse<string[]>(text.slice(0, 64 * 1024), {
    header: false,
    skipEmptyLines: false,
    dynamicTyping: false,
  }).data;
}

function delimiterScore(rows: readonly string[][], delimiter: ImportDelimiter): number {
  const counts = rows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => row.length)
    .filter((count) => count > 1);
  if (counts.length === 0) {
    return 0;
  }

  const frequencies = new Map<number, number>();
  for (const count of counts) {
    frequencies.set(count, (frequencies.get(count) ?? 0) + 1);
  }
  let modal = 0;
  let modalCount = 0;
  for (const [count, frequency] of frequencies) {
    if (frequency > modalCount || (frequency === modalCount && count > modal)) {
      modal = count;
      modalCount = frequency;
    }
  }
  const stability = modalCount / counts.length;
  if (stability < 0.8) {
    return 0;
  }
  // Prefer a stable, wide parse with more evidence (rows sharing the modal
  // width). Without the row count, a quoted comma inside a semicolon file can
  // produce one wide row and beat the real delimiter.
  return (
    modal * 1_000 +
    modalCount * 100 +
    Math.round(stability * 100) * 10 -
    IMPORT_DELIMITERS.indexOf(delimiter)
  );
}

/**
 * Detects the delimiter from the first 20 records and guesses whether the first
 * row is a header. Both results are advisory; the wizard always lets the user
 * override them and reparse without rereading the file.
 */
export function sniffCsv(text: string): CsvSniffResult {
  const sample = sampleRowsForSniffing(text.replace(/^\uFEFF/, ''));
  let delimiter: ImportDelimiter = ',';
  let best = 0;
  for (const candidate of IMPORT_DELIMITERS) {
    const parsed = Papa.parse<string[]>(text.slice(0, 64 * 1024), {
      delimiter: candidate,
      header: false,
      skipEmptyLines: false,
      dynamicTyping: false,
      preview: 20,
    }).data;
    const score = delimiterScore(parsed, candidate);
    if (score > best) {
      best = score;
      delimiter = candidate;
    }
  }

  return { delimiter, hasHeader: detectHeader(sample) };
}

function detectHeader(rows: readonly string[][]): boolean {
  const first = rows[0];
  if (first === undefined || first.length === 0) {
    return false;
  }
  if (
    first.some((value) => {
      const kind = cellKind(value).kind;
      return kind !== 'text' && kind !== 'empty';
    })
  ) {
    return false;
  }

  const body = rows.slice(1, 21).filter((row) => row.some((cell) => cell.trim().length > 0));
  if (body.length === 0) {
    return true;
  }

  for (let columnIndex = 0; columnIndex < first.length; columnIndex += 1) {
    const kinds = body
      .map((row) => row[columnIndex] ?? '')
      .filter((value) => !isBlank(value))
      .map((value) => cellKind(value).kind);
    if (kinds.length === 0) {
      continue;
    }
    const nonText = kinds.filter((kind) => kind !== 'text').length;
    if (nonText / kinds.length >= 0.5) {
      return true;
    }
  }

  // All-text data is ambiguous. The confirmed T2.5 policy is to keep the
  // conventional "first row is a header" default; the preview makes it visible
  // and one toggle restores the first row.
  return true;
}

export function parseCsv(text: string, options: CsvParseOptions = {}): ParsedImportData {
  const clean = text.replace(/^\uFEFF/, '');
  if (clean.trim().length === 0) {
    throw createAppError('E_IMPORT_FORMAT', 'The CSV file is empty.');
  }

  const sniffed = sniffCsv(clean);
  const delimiter = options.delimiter ?? sniffed.delimiter;
  const hasHeader = options.hasHeader ?? sniffed.hasHeader;
  const parsed = Papa.parse<string[]>(clean, {
    delimiter,
    header: false,
    skipEmptyLines: false,
    dynamicTyping: false,
  });

  const quoteError = parsed.errors.find((error) => error.code === 'MissingQuotes');
  if (quoteError !== undefined) {
    throw createAppError('E_IMPORT_FORMAT', 'The CSV file has an unclosed quote.', {
      detail: quoteError.message,
    });
  }

  const matrix = parsed.data.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (matrix.length === 0) {
    throw createAppError('E_IMPORT_FORMAT', 'The CSV file has no rows.');
  }

  const warnings: string[] = [];
  let headers: string[];
  let rows: ImportCellValue[][];
  if (hasHeader) {
    const first = matrix[0] ?? [];
    const normalized = normalizeHeaders(first);
    headers = normalized.headers;
    warnings.push(...normalized.warnings);
    rows = matrix.slice(1);
  } else {
    headers = Array.from(
      { length: matrix[0]?.length ?? 0 },
      (_, index) => `column_${String(index + 1)}`,
    );
    rows = matrix;
  }

  if (headers.length === 0) {
    throw createAppError('E_IMPORT_FORMAT', 'The CSV file has no columns.');
  }

  return {
    format: 'csv',
    delimiter,
    hasHeader,
    headers,
    rows,
    totalRows: rows.length,
    warnings,
    columns: buildImportColumns(headers, rows, options.sampleSize),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNestedValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

export function parseJson(text: string): ParsedImportData {
  const clean = text.replace(/^\uFEFF/, '');
  if (clean.trim().length === 0) {
    throw createAppError('E_IMPORT_FORMAT', 'The JSON file is empty.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw createAppError('E_IMPORT_FORMAT', 'The JSON file is not valid JSON.');
  }

  const source = Array.isArray(parsed)
    ? parsed
    : isPlainObject(parsed) && Array.isArray(parsed['rows'])
      ? parsed['rows']
      : null;
  if (source === null) {
    throw createAppError(
      'E_IMPORT_FORMAT',
      'JSON must be an object array or an object with a "rows" array.',
    );
  }
  if (source.length === 0) {
    throw createAppError('E_IMPORT_FORMAT', 'The JSON file has no rows.');
  }

  const keys = new Set<string>();
  const objects: Record<string, unknown>[] = [];
  source.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      throw createAppError('E_IMPORT_FORMAT', 'Every JSON row must be an object.', {
        detail: `row=${String(index + 1)}`,
      });
    }
    for (const [key, value] of Object.entries(entry)) {
      if (isNestedValue(value)) {
        throw createAppError(
          'E_IMPORT_FORMAT',
          'Nested objects and arrays are not supported by the JSON importer.',
          { detail: `row=${String(index + 1)} key=${key}` },
        );
      }
      keys.add(key);
    }
    objects.push(entry);
  });

  const headers = [...keys];
  const rows: ImportCellValue[][] = objects.map((entry) =>
    headers.map((key) => {
      const value = entry[key];
      if (value === undefined || value === null) {
        return null;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
      }
      return null;
    }),
  );

  return {
    format: 'json',
    hasHeader: true,
    headers,
    rows,
    totalRows: rows.length,
    warnings: [],
    columns: buildImportColumns(headers, rows),
  };
}

function inferOne(
  values: readonly ImportCellValue[],
  predicate: (value: ImportCellValue) => boolean,
): number {
  if (values.length === 0) {
    return 0;
  }
  return values.filter(predicate).length / values.length;
}

export function inferColumnType(
  input: readonly ImportCellValue[],
  sampleSize = IMPORT_TYPE_SAMPLE_SIZE,
): ImportTypeInference {
  const values: ImportCellValue[] = [];
  for (const value of input) {
    if (values.length >= sampleSize) {
      break;
    }
    if (!isBlank(value)) {
      values.push(value);
    }
  }
  if (values.length === 0) {
    return { type: 'text', confidence: 0, sampleSize: 0 };
  }

  const candidates: Array<{ type: ImportColumnType; confidence: number }> = [
    { type: 'boolean', confidence: inferOne(values, isBooleanToken) },
    { type: 'date', confidence: inferOne(values, isDateToken) },
    { type: 'number', confidence: inferOne(values, isNumberToken) },
  ];
  let best = candidates[0];
  for (const candidate of candidates) {
    if (candidate.confidence > (best?.confidence ?? 0)) {
      best = candidate;
    }
  }
  if (best === undefined || best.confidence < IMPORT_CONFIDENCE_THRESHOLD) {
    return {
      type: 'text',
      confidence: best === undefined ? 0 : 1 - best.confidence,
      sampleSize: values.length,
    };
  }
  return { type: best.type, confidence: best.confidence, sampleSize: values.length };
}

export function buildImportColumns(
  headers: readonly string[],
  rows: readonly ImportCellValue[][],
  sampleSize = IMPORT_TYPE_SAMPLE_SIZE,
): ImportedColumn[] {
  return headers.map((name, index) => {
    const values = rows.slice(0, sampleSize).map((row) => row[index] ?? null);
    const inferred = inferColumnType(values, sampleSize);
    return {
      index,
      name,
      type: inferred.type,
      confidence: inferred.confidence,
      sampleSize: inferred.sampleSize,
    };
  });
}

function issue(
  issues: ImportIssue[],
  row: number,
  code: ImportIssue['code'],
  message: string,
  value: ImportCellValue,
  column?: ColumnDef,
): void {
  issues.push({
    row,
    code,
    message,
    value,
    ...(column === undefined ? {} : { columnId: column.id, columnName: column.key }),
  });
}

/** Cell validation codes are not all public AppError codes (E_REQUIRED etc.). */
function appErrorCode(code: ImportIssue['code']): AppError['code'] {
  switch (code) {
    case 'E_TYPE':
    case 'E_DUPLICATE_KEY':
    case 'E_VALIDATION':
    case 'E_IMPORT_FORMAT':
      return code;
    case 'E_REQUIRED':
    case 'E_ENUM':
    case 'E_RANGE':
      return 'E_VALIDATION';
  }
}

function validateNewColumns(table: TableMeta, newColumns: readonly ColumnDef[]): AppError | null {
  if (table.columns.length + newColumns.length > MAX_COLUMNS_PER_TABLE) {
    return createAppError(
      'E_TABLE_LIMIT',
      `A table may not exceed ${String(MAX_COLUMNS_PER_TABLE)} columns.`,
      { detail: `columns=${String(table.columns.length + newColumns.length)}` },
    );
  }

  const ids = new Set(table.columns.map((column) => column.id));
  const keys = new Set(table.columns.map((column) => column.key));
  for (const candidate of newColumns) {
    const parsed = parseColumnDef(candidate);
    if (!parsed.ok) {
      return createAppError('E_VALIDATION', 'A new import column definition is invalid.', {
        detail: parsed.issues[0]?.message,
      });
    }
    if (parsed.data.required === true) {
      return createAppError(
        'E_VALIDATION',
        'Columns created by an import must not be required; existing rows cannot supply the value.',
        { detail: `column=${parsed.data.id}` },
      );
    }
    if (ids.has(parsed.data.id) || keys.has(parsed.data.key)) {
      return createAppError('E_DUPLICATE_KEY', 'A new import column id or key is already used.');
    }
    ids.add(parsed.data.id);
    keys.add(parsed.data.key);
  }
  return null;
}

function failure(error: AppError, issues: ImportIssue[], stats: ImportStats): ImportPlanFailure {
  return { ok: false, error, issues, totalIssues: issues.length, stats };
}

/**
 * Validates the mapped dataset and returns only the rows that would be
 * imported. It does not mutate the table or touch existing rows: the command
 * owns the atomic append/replace and the view column-order sync.
 */
export function planImport(request: ImportPlanRequest): ImportPlan {
  const { table, dataset, mode, skipInvalid } = request;
  const newColumns = [...(request.newColumns ?? [])];
  const newColumnError = validateNewColumns(table, newColumns);
  if (newColumnError !== null) {
    return failure(newColumnError, [], { total: dataset.rows.length, accepted: 0, skipped: 0 });
  }

  const targetColumns = [...table.columns, ...newColumns];
  const targetIndexById = new Map(targetColumns.map((column, index) => [column.id, index]));
  const sourceSeen = new Set<number>();
  const usedTargets = new Set<number>();
  const usedNewColumns = new Set<number>();
  const targets: TargetColumn[] = [];

  for (const mapping of request.mappings) {
    if (
      !Number.isInteger(mapping.sourceIndex) ||
      mapping.sourceIndex < 0 ||
      mapping.sourceIndex >= dataset.headers.length ||
      sourceSeen.has(mapping.sourceIndex)
    ) {
      return failure(
        createAppError('E_VALIDATION', 'The import mapping has an invalid source column.'),
        [],
        { total: dataset.rows.length, accepted: 0, skipped: 0 },
      );
    }
    sourceSeen.add(mapping.sourceIndex);
    const target = mapping.target;
    if (target.kind === 'ignore') {
      continue;
    }
    if (target.kind === 'existing') {
      const index = targetIndexById.get(target.columnId);
      if (index === undefined) {
        return failure(
          createAppError('E_VALIDATION', 'An import target column does not exist.'),
          [],
          { total: dataset.rows.length, accepted: 0, skipped: 0 },
        );
      }
      const column = targetColumns[index];
      if (
        column === undefined ||
        table.columns.some((entry) => entry.id === target.columnId) === false
      ) {
        return failure(
          createAppError('E_VALIDATION', 'An import target column does not exist.'),
          [],
          { total: dataset.rows.length, accepted: 0, skipped: 0 },
        );
      }
      if (usedTargets.has(index)) {
        return failure(
          createAppError('E_VALIDATION', 'Two source columns cannot map to one target column.'),
          [],
          { total: dataset.rows.length, accepted: 0, skipped: 0 },
        );
      }
      usedTargets.add(index);
      targets.push({ column, index, sourceIndex: mapping.sourceIndex });
      continue;
    }

    const newIndex = target.newColumnIndex;
    if (
      !Number.isInteger(newIndex) ||
      newIndex < 0 ||
      newIndex >= newColumns.length ||
      usedNewColumns.has(newIndex)
    ) {
      return failure(
        createAppError('E_VALIDATION', 'The import mapping has an invalid new column.'),
        [],
        { total: dataset.rows.length, accepted: 0, skipped: 0 },
      );
    }
    const column = newColumns[newIndex];
    const index = table.columns.length + newIndex;
    if (column === undefined) {
      return failure(
        createAppError('E_VALIDATION', 'The import mapping has an invalid new column.'),
        [],
        { total: dataset.rows.length, accepted: 0, skipped: 0 },
      );
    }
    usedNewColumns.add(newIndex);
    usedTargets.add(index);
    targets.push({ column, index, sourceIndex: mapping.sourceIndex });
  }

  if (sourceSeen.size !== dataset.headers.length) {
    return failure(
      createAppError('E_VALIDATION', 'Every source column needs exactly one import mapping.'),
      [],
      { total: dataset.rows.length, accepted: 0, skipped: 0 },
    );
  }
  if (usedNewColumns.size !== newColumns.length) {
    return failure(
      createAppError('E_VALIDATION', 'Every new import column must be mapped to a source column.'),
      [],
      { total: dataset.rows.length, accepted: 0, skipped: 0 },
    );
  }

  const keyIndex = targetColumns.findIndex((column) => column.id === table.primaryKey);
  const keyColumn = targetColumns[keyIndex];
  if (keyColumn === undefined || keyColumn.type !== 'text') {
    return failure(
      createAppError('E_WS_INVALID_MANIFEST', 'The table primary key must be a text column.'),
      [],
      { total: dataset.rows.length, accepted: 0, skipped: 0 },
    );
  }

  const existingKeys = new Set<Cell>();
  const usedRowIds = new Set<string>();
  if (mode === 'append') {
    if (request.existingKeys !== undefined) {
      for (const key of request.existingKeys) {
        if (!isBlank(key)) {
          existingKeys.add(key);
        }
      }
    } else {
      for (const row of request.rows) {
        usedRowIds.add(row.id);
        const key = row.values[keyIndex] ?? null;
        if (!isBlank(key)) {
          existingKeys.add(key);
        }
      }
    }
  }

  const mappedIndices = new Set(targets.map((target) => target.index));
  const requiredUnmapped = targetColumns
    .map((column, index) => ({ column, index }))
    .filter(
      ({ column, index }) =>
        column.required === true && column.id !== table.primaryKey && !mappedIndices.has(index),
    );

  const issues: ImportIssue[] = [];
  const rows: Row[] = [];
  const uuid = request.uuid;
  const usedKeys = new Set<Cell>(existingKeys);
  let accepted = 0;
  let skipped = 0;

  const nextRowId = (): string => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const id = createRowId(uuid);
      if (!usedRowIds.has(id)) {
        usedRowIds.add(id);
        return id;
      }
    }
    throw createAppError('E_UNKNOWN', 'Could not generate a unique row id for the import.');
  };

  for (let rowIndex = 0; rowIndex < dataset.rows.length; rowIndex += 1) {
    const sourceRow = dataset.rows[rowIndex] ?? [];
    const rowNumber = rowIndex + 1;
    if (sourceRow.length !== dataset.headers.length) {
      issue(
        issues,
        rowNumber,
        'E_IMPORT_FORMAT',
        `expected ${String(dataset.headers.length)} fields but found ${String(sourceRow.length)}`,
        '',
      );
      skipped += 1;
      continue;
    }

    const values = targetColumns.map(emptyCell);
    let invalid = false;
    for (const target of targets) {
      const raw = sourceRow[target.sourceIndex] ?? null;
      if (target.column.id === table.primaryKey && isBlank(raw)) {
        continue;
      }
      const coerced = coerceCell(raw, target.column);
      if (!coerced.ok) {
        issue(issues, rowNumber, coerced.code, coerced.message, raw, target.column);
        invalid = true;
        continue;
      }
      values[target.index] = coerced.value;
    }

    for (const { column } of requiredUnmapped) {
      issue(
        issues,
        rowNumber,
        'E_REQUIRED',
        `column "${column.key}" is required and has no source mapping`,
        '',
        column,
      );
      invalid = true;
    }

    if (invalid) {
      skipped += 1;
      continue;
    }

    const rowId = nextRowId();
    if (isBlank(values[keyIndex])) {
      values[keyIndex] = rowId;
    }
    const key = values[keyIndex] ?? null;
    if (!isBlank(key) && usedKeys.has(key)) {
      issue(
        issues,
        rowNumber,
        'E_DUPLICATE_KEY',
        `The primary key value is already used by another row: ${String(key)}`,
        String(key),
        keyColumn,
      );
      skipped += 1;
      continue;
    }
    if (!isBlank(key)) {
      usedKeys.add(key);
    }

    rows.push({ id: rowId, values });
    accepted += 1;
  }

  const stats: ImportStats = {
    total: dataset.rows.length,
    accepted,
    skipped,
  };
  if (issues.length > 0 && !skipInvalid) {
    const first = issues[0];
    return failure(
      createAppError(
        appErrorCode(first?.code ?? 'E_VALIDATION'),
        'The import contains invalid rows. Choose "skip invalid rows" or cancel.',
        { detail: `issues=${String(issues.length)}` },
      ),
      issues,
      stats,
    );
  }
  if (accepted === 0) {
    return failure(
      createAppError('E_VALIDATION', 'The import would not add any valid rows.'),
      issues,
      stats,
    );
  }

  const finalRowCount =
    mode === 'append' ? (request.existingRowCount ?? request.rows.length) + accepted : accepted;
  if (finalRowCount > MAX_ROWS_PER_TABLE) {
    return failure(
      createAppError(
        'E_TABLE_LIMIT',
        `A table may not exceed ${String(MAX_ROWS_PER_TABLE)} rows.`,
        { detail: `rowCount=${String(finalRowCount)} max=${String(MAX_ROWS_PER_TABLE)}` },
      ),
      issues,
      stats,
    );
  }

  return {
    ok: true,
    rows,
    newColumns,
    stats,
    issues,
    totalIssues: issues.length,
    finalRowCount,
  };
}
