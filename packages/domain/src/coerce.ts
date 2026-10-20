import { MAX_CELL_TEXT_LENGTH } from './limits';

import type { CellResult, ColumnDef } from './types';

/**
 * Lenient conversion of untrusted user input (paste, CSV import, inline edit)
 * into the physical cell shape of a column (SPEC §8.1).
 *
 * Rules, in one place:
 * - empty / whitespace input clears the cell (`null`, or `""` for text) unless
 *   the column is `required`;
 * - numbers accept thousands separators (`"1,234.5"`) and must stay finite;
 * - dates accept `YYYY-MM-DD` (local midnight) or any string `Date.parse`
 *   understands, and numbers are taken as epoch milliseconds;
 * - booleans accept `true/false`, `1/0`, `是/否`;
 * - enums must match an `enumOptions[].value` (surrounding spaces are ignored).
 *
 * The function never throws: the caller gets a structured `CellResult`.
 */
export function coerceCell(raw: unknown, column: ColumnDef): CellResult {
  if (raw === null || raw === undefined) {
    return emptyCell(column);
  }

  switch (column.type) {
    case 'text':
      return coerceText(raw, column);
    case 'number':
      return coerceNumber(raw, column);
    case 'date':
      return coerceDate(raw, column);
    case 'boolean':
      return coerceBoolean(raw);
    case 'enum':
      return coerceEnum(raw, column);
  }
}

function emptyCell(column: ColumnDef): CellResult {
  if (column.required === true) {
    return { ok: false, code: 'E_REQUIRED', message: `column "${column.key}" is required` };
  }
  return { ok: true, value: column.type === 'text' ? '' : null };
}

function coerceText(raw: unknown, column: ColumnDef): CellResult {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return { ok: false, code: 'E_RANGE', message: 'text cells cannot hold a non-finite number' };
    }
    return { ok: true, value: String(raw) };
  }
  if (typeof raw === 'boolean') {
    return { ok: true, value: raw ? 'true' : 'false' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, code: 'E_TYPE', message: `column "${column.key}" expects text` };
  }
  if (raw.trim() === '') {
    return column.required === true
      ? { ok: false, code: 'E_REQUIRED', message: `column "${column.key}" is required` }
      : { ok: true, value: '' };
  }
  if (raw.length > MAX_CELL_TEXT_LENGTH) {
    return {
      ok: false,
      code: 'E_RANGE',
      message: `column "${column.key}" is limited to ${MAX_CELL_TEXT_LENGTH} characters`,
    };
  }
  return { ok: true, value: raw };
}

const GROUPED_NUMBER_PATTERN = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

function coerceNumber(raw: unknown, column: ColumnDef): CellResult {
  if (typeof raw === 'number') {
    return Number.isFinite(raw)
      ? { ok: true, value: raw }
      : {
          ok: false,
          code: 'E_RANGE',
          message: `column "${column.key}" must be a finite number`,
        };
  }
  if (typeof raw !== 'string') {
    return { ok: false, code: 'E_TYPE', message: `column "${column.key}" expects a number` };
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return emptyCell(column);
  }

  const normalized = GROUPED_NUMBER_PATTERN.test(trimmed) ? trimmed.replace(/,/g, '') : trimmed;
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    return {
      ok: false,
      code: 'E_TYPE',
      message: `column "${column.key}" expects a number, got "${trimmed}"`,
    };
  }
  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      code: 'E_RANGE',
      message: `column "${column.key}" must be a finite number`,
    };
  }
  return { ok: true, value: parsed };
}

function coerceDate(raw: unknown, column: ColumnDef): CellResult {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return {
        ok: false,
        code: 'E_RANGE',
        message: `column "${column.key}" must be a finite epoch timestamp`,
      };
    }
    if (!Number.isInteger(raw)) {
      return {
        ok: false,
        code: 'E_TYPE',
        message: `column "${column.key}" expects epoch milliseconds (integer)`,
      };
    }
    return { ok: true, value: raw };
  }
  if (typeof raw !== 'string') {
    return { ok: false, code: 'E_TYPE', message: `column "${column.key}" expects a date` };
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return emptyCell(column);
  }

  const timestamp = parseDateInput(trimmed);
  if (timestamp === null) {
    return {
      ok: false,
      code: 'E_TYPE',
      message: `column "${column.key}" expects a date, got "${trimmed}"`,
    };
  }
  return { ok: true, value: timestamp };
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateInput(value: string): number | null {
  // Never let `Date.parse` roll 2026-02-30 over to March: date-only input is
  // validated component by component.
  if (DATE_ONLY_PATTERN.test(value)) {
    return parseLocalDate(value);
  }
  return parseIsoDate(value);
}

/** `YYYY-MM-DD` is interpreted as local midnight (SPEC §8.1). */
function parseLocalDate(value: string): number | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const [, yearText, monthText, dayText] = match;
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    return null;
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  // Use setFullYear so years 0..99 are not mapped to 1900..1999.
  date.setFullYear(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

function parseIsoDate(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function coerceBoolean(raw: unknown): CellResult {
  if (typeof raw === 'boolean') {
    return { ok: true, value: raw };
  }
  if (typeof raw === 'number') {
    if (raw === 1) {
      return { ok: true, value: true };
    }
    if (raw === 0) {
      return { ok: true, value: false };
    }
    return {
      ok: false,
      code: 'E_TYPE',
      message: 'boolean cells accept only true/false/1/0/是/否',
    };
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === '是') {
      return { ok: true, value: true };
    }
    if (normalized === 'false' || normalized === '0' || normalized === '否') {
      return { ok: true, value: false };
    }
  }
  return {
    ok: false,
    code: 'E_TYPE',
    message: 'boolean cells accept only true/false/1/0/是/否',
  };
}

function coerceEnum(raw: unknown, column: ColumnDef): CellResult {
  if (typeof raw !== 'string') {
    return {
      ok: false,
      code: 'E_ENUM',
      message: `column "${column.key}" expects one of its enum values`,
    };
  }
  const options = column.enumOptions ?? [];
  if (options.length === 0) {
    return {
      ok: false,
      code: 'E_ENUM',
      message: `column "${column.key}" has no enum values defined`,
    };
  }
  const trimmed = raw.trim();
  const match = options.find((option) => option.value === trimmed);
  if (match === undefined) {
    return {
      ok: false,
      code: 'E_ENUM',
      message: `"${trimmed}" is not a value of column "${column.key}"`,
    };
  }
  return { ok: true, value: match.value };
}
