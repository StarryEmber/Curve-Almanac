/**
 * Clipboard matrix parser (T2.4, SPEC §9.3).
 *
 * Excel puts a rectangular selection on the clipboard as TSV: tabs between
 * cells, CRLF between rows, and double quotes around cells that contain tabs,
 * newlines or quotes. SPEC §9.3 additionally asks for a CSV fallback when the
 * clipboard has a single column but contains commas (a common one-column copy
 * from other tools).
 *
 * The parser is deliberately pure: it takes the `text/plain` string and returns
 * a rectangular matrix of raw strings. Type coercion, validation and the actual
 * write happen later in app-core, so the clipboard never touches the store.
 */

import { createAppError } from '@curve/domain';
import type { AppError } from '@curve/domain';

import { BOM } from './jsonl';

/** Delimiter chosen for the pasted text. */
export type PasteDelimiter = 'tab' | 'comma';

export interface ClipboardMatrix {
  delimiter: PasteDelimiter;
  /** Rectangular matrix; every row has exactly `columns` entries. */
  cells: string[][];
  rows: number;
  columns: number;
}

export type ClipboardParseResult =
  | { readonly ok: true; readonly data: ClipboardMatrix }
  | { readonly ok: false; readonly error: AppError };

interface GridRows {
  rows: string[][];
}

type GridParse = { readonly ok: true; readonly data: GridRows } | { readonly ok: false };

/**
 * RFC-4180-style parser for one delimiter.
 *
 * Quoted fields may contain delimiters, CRLF and doubled quotes (`""`). A quote
 * in the middle of an unquoted field is treated literally (Excel never emits
 * that, but users sometimes paste hand-written data). An unterminated quoted
 * field is a hard error rather than a silent partial matrix.
 */
function parseGrid(text: string, delimiter: string): GridParse {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quotedField = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      field += character;
      continue;
    }

    if (character === '"' && field.length === 0 && !quotedField) {
      inQuotes = true;
      quotedField = true;
      continue;
    }

    if (character === delimiter) {
      row.push(field);
      field = '';
      quotedField = false;
      continue;
    }

    if (character === '\r' || character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      quotedField = false;
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      continue;
    }

    field += character;
  }

  if (inQuotes) {
    return { ok: false };
  }

  // A trailing line terminator does not create an extra row; an empty last field
  // after a delimiter does (`"a\t"` is two cells).
  if (field.length > 0 || row.length > 0 || quotedField) {
    row.push(field);
    rows.push(row);
  }

  return { ok: true, data: { rows } };
}

function maxColumns(rows: readonly string[][]): number {
  let columns = 0;
  for (const row of rows) {
    columns = Math.max(columns, row.length);
  }
  return columns;
}

function toMatrix(rows: readonly string[][], delimiter: PasteDelimiter): ClipboardMatrix {
  const columns = maxColumns(rows);
  if (columns === 0) {
    return { delimiter, cells: [], rows: 0, columns: 0 };
  }
  const cells = rows.map((row) =>
    row.length === columns ? [...row] : [...row, ...Array<string>(columns - row.length).fill('')],
  );
  return { delimiter, cells, rows: cells.length, columns };
}

function malformed(): ClipboardParseResult {
  return {
    ok: false,
    error: createAppError('E_IMPORT_FORMAT', 'The pasted text has an unterminated quoted field.'),
  };
}

/**
 * Parses `text/plain` clipboard content into a rectangular matrix.
 *
 * - a leading UTF-8 BOM is ignored;
 * - exactly one trailing CRLF/LF/CR is dropped (Excel appends one);
 * - tabs win when present; a one-column TSV that contains commas is retried as
 *   CSV and only replaces the result when it yields more than one column.
 */
export function parseClipboardText(text: string): ClipboardParseResult {
  let input = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  if (input.endsWith('\r\n')) {
    input = input.slice(0, -2);
  } else if (input.endsWith('\n') || input.endsWith('\r')) {
    input = input.slice(0, -1);
  }

  if (input.length === 0) {
    return { ok: true, data: { delimiter: 'tab', cells: [], rows: 0, columns: 0 } };
  }

  const tabbed = parseGrid(input, '\t');
  if (!tabbed.ok) {
    return malformed();
  }
  const tabMatrix = toMatrix(tabbed.data.rows, 'tab');
  if (tabMatrix.columns > 1 || !input.includes(',')) {
    return { ok: true, data: tabMatrix };
  }

  const comma = parseGrid(input, ',');
  if (!comma.ok) {
    return malformed();
  }
  const commaMatrix = toMatrix(comma.data.rows, 'comma');
  return { ok: true, data: commaMatrix.columns > 1 ? commaMatrix : tabMatrix };
}
