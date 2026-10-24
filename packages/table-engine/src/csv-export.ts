/**
 * RFC 4180 CSV export primitives (T3.6, SPEC §9.6, ADR-039).
 *
 * This module is pure: it has no DOM, Node or UI dependency. The renderer owns
 * the display formatter (`formatStyledCellValue` from `@curve/ui`) and passes it
 * in, so the CSV layer never grows a second formatting implementation.
 */

import type { Cell, ColumnDef, Row } from '@curve/domain';

/** Excel needs the BOM to detect UTF-8; it must appear exactly once. */
export const CSV_BOM = '\uFEFF';

/** RFC 4180 line ending; Excel accepts it on every platform. */
export const CSV_CRLF = '\r\n';

/** Rows per chunk sent over IPC. Chunks never split a row. */
export const CSV_CHUNK_ROWS = 1_000;

/** Longest table-name portion of the suggested file name. */
export const CSV_FILE_BASE_MAX_LENGTH = 80;

export type CsvValueMode = 'display' | 'raw';

/**
 * One exported column. `valueIndex` points into `Row.values` (schema order),
 * which lets the caller export a subset/reordered view of the table.
 */
export interface CsvExportColumn {
  column: ColumnDef;
  valueIndex: number;
  /** Header text before RFC 4180 quoting. */
  header: string;
}

export interface CsvExportOptions {
  columns: readonly CsvExportColumn[];
  rows: readonly Row[];
  /** Maps one stored cell to its exported text (raw or display). */
  formatCell: (value: Cell, column: ColumnDef) => string;
  chunkRows?: number;
}

export interface CsvChunk {
  /** BOM+header for the first chunk, complete data rows afterwards. */
  text: string;
  /** Number of data rows in this chunk (0 for the header chunk). */
  rows: number;
}

const ILLEGAL_FILE_CHARS = /[<>:"/\\|?*]/g;
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function removeControlCharacters(text: string): string {
  let result = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x20) {
      result += character;
    }
  }
  return result;
}

function stripTrailingDotsAndSpaces(text: string): string {
  return text.replace(/[. ]+$/u, '');
}

/**
 * Quotes one field only when RFC 4180 requires it. Leading/trailing whitespace
 * is quoted too so Excel does not trim user data on open.
 */
export function escapeCsvField(text: string): string {
  if (text.length === 0) {
    return '';
  }
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** The stored value, without localisation or style overrides. */
export function rawCsvCellText(value: Cell, column: ColumnDef): string {
  if (value === null) {
    return '';
  }
  if (column.type === 'boolean' && typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

/**
 * Cleans a table name for use as the file-name prefix. Invalid characters are
 * replaced (not silently dropped), trailing dots/spaces removed and long names
 * truncated by code point so emoji are not split.
 */
export function sanitizeCsvFileNameBase(tableName: string): string {
  const normalized = removeControlCharacters(tableName.normalize('NFC'))
    .replace(ILLEGAL_FILE_CHARS, '_')
    .replace(/\s+/gu, ' ')
    .trim();
  const truncated = Array.from(stripTrailingDotsAndSpaces(normalized))
    .slice(0, CSV_FILE_BASE_MAX_LENGTH)
    .join('');
  const base = stripTrailingDotsAndSpaces(truncated);
  if (base.length === 0) {
    return 'export';
  }
  if (WINDOWS_RESERVED_NAMES.has(base.toUpperCase())) {
    return `_${base}`;
  }
  return base;
}

/** `<table>-<yyyyMMdd-HHmm>.csv`, using the machine's local time. */
export function csvExportFileName(tableName: string, now: Date): string {
  const stamp = `${String(now.getFullYear()).padStart(4, '0')}${pad2(
    now.getMonth() + 1,
  )}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `${sanitizeCsvFileNameBase(tableName)}-${stamp}.csv`;
}

/**
 * Yields the BOM+header first, then complete-row chunks. A chunk boundary can
 * never split a quoted field because rows are built before the yield.
 */
export function* encodeCsvChunks(options: CsvExportOptions): Generator<CsvChunk> {
  const chunkRows = options.chunkRows ?? CSV_CHUNK_ROWS;
  if (!Number.isInteger(chunkRows) || chunkRows < 1) {
    throw new RangeError('CSV chunk size must be a positive integer.');
  }

  const header = options.columns.map((entry) => escapeCsvField(entry.header)).join(',');
  yield { text: `${CSV_BOM}${header}${CSV_CRLF}`, rows: 0 };

  let lines: string[] = [];
  for (const row of options.rows) {
    const fields = options.columns.map((entry) =>
      escapeCsvField(options.formatCell(row.values[entry.valueIndex] ?? null, entry.column)),
    );
    lines.push(`${fields.join(',')}${CSV_CRLF}`);
    if (lines.length >= chunkRows) {
      yield { text: lines.join(''), rows: lines.length };
      lines = [];
    }
  }
  if (lines.length > 0) {
    yield { text: lines.join(''), rows: lines.length };
  }
}
