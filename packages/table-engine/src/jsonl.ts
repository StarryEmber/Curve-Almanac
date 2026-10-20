/**
 * JSONL row codec (SPEC §7.3).
 *
 * The on-disk shape is `{"id":"row_<uuid>","v":[...]}` with `v` ordered like
 * `TableMeta.columns`. That is *not* the domain `Row` shape (`{id, values}`),
 * so this module is the only place allowed to translate between them.
 *
 * Everything here is pure: no Node, Electron, DOM or chart imports. The main
 * process uses `countJsonlRows` for the SPEC §7.5 row-count repair; the
 * renderer Worker uses `decodeJsonl`/`encodeJsonl` for the real work.
 */

import { createAppError, isId, parseCell } from '@curve/domain';
import type { AppError, Row, TableMeta, ValidationIssueCode } from '@curve/domain';

/** UTF-8 BOM, which SPEC §7.3 forbids in table files. */
export const BOM = '\uFEFF';

/** SPEC §7.3: one line may not exceed 8 MB. */
export const MAX_JSONL_LINE_BYTES = 8 * 1024 * 1024;

/** SPEC §2.2: a table file may not exceed 256 MB. */
export const MAX_TABLE_FILE_BYTES = 256 * 1024 * 1024;

/** SPEC §2.2: hard cap per table; imports above it are refused. */
export const MAX_ROWS_PER_TABLE = 200_000;

/**
 * Issue codes a JSONL read can produce. Cell issues reuse the domain codes so
 * the UI can show the same message as for a paste; file-level problems use the
 * two table codes from SPEC §18.
 */
export type JsonlIssueCode = ValidationIssueCode | 'E_TABLE_PARSE' | 'E_TABLE_LIMIT';

export interface JsonlIssue {
  /** 1-based line number inside the file. */
  line: number;
  /** Set when the problem belongs to one cell. */
  columnId?: string;
  code: JsonlIssueCode;
  /** Always starts with `line <n>: ` so a bare log line stays actionable. */
  message: string;
}

export interface JsonlDecodeStats {
  /** Content lines examined (blank lines count, the trailing newline does not). */
  total: number;
  accepted: number;
  skipped: number;
}

export interface JsonlDecodeResult {
  /** Rows that passed every check, in file order. */
  rows: Row[];
  /** Every rejected line, in file order. Empty means the file is clean. */
  issues: JsonlIssue[];
  stats: JsonlDecodeStats;
}

export interface JsonlEncodeResult {
  jsonl: string;
  /** UTF-8 bytes the string occupies on disk. */
  bytes: number;
}

/**
 * Exact UTF-8 byte length of a string.
 *
 * Hand written instead of `TextEncoder` so this package stays free of DOM and
 * Node type libraries (SPEC §4.2) and so the hot encoding path does not
 * allocate a `Uint8Array` per line.
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // Valid surrogate pair: one 4-byte code point.
        bytes += 4;
        index += 1;
      } else {
        // Lone high surrogate: encoded as U+FFFD (3 bytes).
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function lineOf(number: number, detail: string): string {
  return `line ${number}: ${detail}`;
}

function pushIssue(
  issues: JsonlIssue[],
  line: number,
  code: JsonlIssueCode,
  detail: string,
  columnId?: string,
): void {
  issues.push(
    columnId === undefined
      ? { line, code, message: lineOf(line, detail) }
      : { line, code, columnId, message: lineOf(line, detail) },
  );
}

/**
 * Iterates the physical lines of a JSONL document without allocating an array
 * of every line.
 *
 * A final empty segment (the newline-terminated file case) is not a line. A
 * blank line in the middle *is* a line and is reported by `decodeJsonl`.
 */
function forEachLine(text: string, visit: (line: string, lineNumber: number) => boolean): void {
  let start = 0;
  let lineNumber = 1;
  for (;;) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(start, end);
    if (newline === -1 && line.length === 0) {
      return;
    }
    if (!visit(line, lineNumber)) {
      return;
    }
    if (newline === -1) {
      return;
    }
    start = newline + 1;
    lineNumber += 1;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Counts the rows a valid JSONL file would contain (SPEC §7.5 hint repair).
 *
 * Deliberately cheap: no `JSON.parse`, no per-cell work. The open path only
 * needs the count; structural and type validation belong to `decodeJsonl`,
 * which runs in the Worker when the table is actually opened.
 */
export function countJsonlRows(jsonl: string): number {
  if (jsonl === '') {
    return 0;
  }
  let count = 0;
  let start = 0;
  for (;;) {
    const newline = jsonl.indexOf('\n', start);
    const end = newline === -1 ? jsonl.length : newline;
    if (end > start) {
      count += 1;
    }
    if (newline === -1) {
      return count;
    }
    start = newline + 1;
  }
}

/** True for an empty file (valid) or a file whose last byte is `\n`. */
export function hasTrailingNewline(jsonl: string): boolean {
  return jsonl.length === 0 || jsonl.endsWith('\n');
}

/**
 * Decodes a table file into rows plus per-line issues (SPEC §7.3, §8.2).
 *
 * Bad lines are reported and skipped individually; decoding never throws and
 * never silently drops a line. The caller decides whether issues are fatal
 * (`toJsonlAppError`) or a skip-and-import decision.
 */
export function decodeJsonl(jsonl: string, table: TableMeta): JsonlDecodeResult {
  const issues: JsonlIssue[] = [];
  const rows: Row[] = [];
  const columns = table.columns;
  const seen = new Set<string>();
  let total = 0;
  let accepted = 0;
  let skipped = 0;

  let text = jsonl;
  if (text.startsWith(BOM)) {
    pushIssue(issues, 1, 'E_TABLE_PARSE', 'UTF-8 BOM is not allowed (SPEC §7.3)');
    text = text.slice(1);
  }

  if (text.length > 0) {
    forEachLine(text, (line, lineNumber) => {
      total += 1;

      if (accepted >= MAX_ROWS_PER_TABLE) {
        pushIssue(
          issues,
          lineNumber,
          'E_TABLE_LIMIT',
          `a table may not exceed ${MAX_ROWS_PER_TABLE} rows (SPEC §2.2)`,
        );
        skipped += 1;
        return false;
      }

      if (line.length === 0) {
        pushIssue(
          issues,
          lineNumber,
          'E_TABLE_PARSE',
          'blank line (SPEC §7.3 requires one row per line)',
        );
        skipped += 1;
        return true;
      }
      if (line.endsWith('\r')) {
        pushIssue(
          issues,
          lineNumber,
          'E_TABLE_PARSE',
          'line ends with CR; table files must use LF (SPEC §7.3)',
        );
        skipped += 1;
        return true;
      }
      if (line.length > MAX_JSONL_LINE_BYTES) {
        pushIssue(issues, lineNumber, 'E_TABLE_PARSE', `line exceeds the 8 MB limit (SPEC §7.3)`);
        skipped += 1;
        return true;
      }
      // Worst case is 3 UTF-8 bytes per UTF-16 code unit, so only lines that
      // could actually exceed 8 MB pay for an exact byte count.
      if (line.length * 3 > MAX_JSONL_LINE_BYTES && utf8ByteLength(line) > MAX_JSONL_LINE_BYTES) {
        pushIssue(issues, lineNumber, 'E_TABLE_PARSE', `line exceeds the 8 MB limit (SPEC §7.3)`);
        skipped += 1;
        return true;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        pushIssue(
          issues,
          lineNumber,
          'E_TABLE_PARSE',
          'invalid JSON (truncated or malformed line)',
        );
        skipped += 1;
        return true;
      }

      if (!isPlainObject(parsed)) {
        pushIssue(issues, lineNumber, 'E_TABLE_PARSE', 'expected a JSON object');
        skipped += 1;
        return true;
      }

      const keys = Object.keys(parsed);
      if (keys.length !== 2 || !('id' in parsed) || !('v' in parsed)) {
        pushIssue(
          issues,
          lineNumber,
          'E_TABLE_PARSE',
          'expected exactly {"id":...,"v":[...]} (SPEC §7.3 forbids other shapes)',
        );
        skipped += 1;
        return true;
      }

      const id = parsed['id'];
      if (typeof id !== 'string' || !isId('row', id)) {
        pushIssue(issues, lineNumber, 'E_TABLE_PARSE', 'row id must match "row_<id>"');
        skipped += 1;
        return true;
      }
      if (seen.has(id)) {
        pushIssue(issues, lineNumber, 'E_DUPLICATE_KEY', `duplicate row id "${id}"`);
        skipped += 1;
        return true;
      }

      const values = parsed['v'];
      if (!Array.isArray(values)) {
        pushIssue(issues, lineNumber, 'E_TABLE_PARSE', '"v" must be an array');
        skipped += 1;
        return true;
      }
      if (values.length !== columns.length) {
        pushIssue(
          issues,
          lineNumber,
          'E_TABLE_PARSE',
          `expected ${columns.length} cells but found ${values.length}`,
        );
        skipped += 1;
        return true;
      }

      let cellIssues = 0;
      const cells: Row['values'] = [];
      // `entries()` keeps the index paired with a defined column, so there is
      // no unreachable `undefined` branch under `noUncheckedIndexedAccess`.
      for (const [index, column] of columns.entries()) {
        const result = parseCell(values[index], column);
        if (result.ok) {
          cells.push(result.value);
        } else {
          cellIssues += 1;
          pushIssue(issues, lineNumber, result.code, result.message, column.id);
        }
      }
      if (cellIssues > 0) {
        skipped += 1;
        return true;
      }

      seen.add(id);
      rows.push({ id, values: cells });
      accepted += 1;
      return true;
    });
  }

  return { rows, issues, stats: { total, accepted, skipped } };
}

/**
 * Encodes a row set as JSONL without materialising the whole document twice.
 *
 * An empty row set is zero bytes (SPEC §7.3: an empty table is an empty file).
 */
export function encodeJsonl(rows: readonly Row[]): string {
  if (rows.length === 0) {
    return '';
  }
  const parts: string[] = [];
  for (const row of rows) {
    parts.push(JSON.stringify({ id: row.id, v: row.values }), '\n');
  }
  return parts.join('');
}

/**
 * `encodeJsonl` plus the exact UTF-8 byte length, computed per line so the
 * caller never allocates a second copy of the whole document.
 */
export function encodeJsonlWithStats(rows: readonly Row[]): JsonlEncodeResult {
  if (rows.length === 0) {
    return { jsonl: '', bytes: 0 };
  }
  const parts: string[] = [];
  let bytes = 0;
  for (const row of rows) {
    const line = JSON.stringify({ id: row.id, v: row.values });
    parts.push(line, '\n');
    bytes += utf8ByteLength(line) + 1;
  }
  return { jsonl: parts.join(''), bytes };
}

/**
 * Turns the first blocking issue into the SPEC §18 envelope.
 *
 * Returns `null` for a clean decode. `detail` carries up to ten line-numbered
 * messages, which is what the UI shows and what the log keeps.
 */
export function toJsonlAppError(result: JsonlDecodeResult): AppError | null {
  const { issues } = result;
  if (issues.length === 0) {
    return null;
  }
  const limited = issues.some((issue) => issue.code === 'E_TABLE_LIMIT');
  const shown = issues.slice(0, 10).map((issue) => issue.message);
  const rest = issues.length - shown.length;
  const detail = rest > 0 ? `${shown.join('; ')}; … (${rest} more)` : shown.join('; ');
  return createAppError(
    limited ? 'E_TABLE_LIMIT' : 'E_TABLE_PARSE',
    `The table data contains ${issues.length} invalid line(s).`,
    { detail },
  );
}

/**
 * Write-path guard (TASKS T1.3 step 4): row count and byte limit from SPEC §2.2.
 *
 * The caller supplies the byte count because computing it is platform-specific
 * (Node's `Buffer.byteLength` in main, `encodeJsonlWithStats` in the Worker).
 */
export function tableWriteLimitError(input: { rowCount: number; bytes: number }): AppError | null {
  if (input.rowCount > MAX_ROWS_PER_TABLE) {
    return createAppError('E_TABLE_LIMIT', `A table may not exceed ${MAX_ROWS_PER_TABLE} rows.`, {
      detail: `rowCount=${input.rowCount}`,
    });
  }
  if (input.bytes > MAX_TABLE_FILE_BYTES) {
    return createAppError('E_TABLE_LIMIT', 'A table file may not exceed 256 MB.', {
      detail: `bytes=${input.bytes}`,
    });
  }
  return null;
}
