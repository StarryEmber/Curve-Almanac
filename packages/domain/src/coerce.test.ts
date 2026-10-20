import { describe, expect, it } from 'vitest';

import { coerceCell } from './coerce';

import type { Cell, ColumnDef, ColumnType } from './types';

function column(type: ColumnType, overrides: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: 'col_test',
    key: 'test',
    label: 'Test',
    type,
    role: 'none',
    ...overrides,
  };
}

function expectOk(result: ReturnType<typeof coerceCell>, value: Cell): void {
  expect(result).toEqual({ ok: true, value });
}

function expectError(result: ReturnType<typeof coerceCell>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
  }
}

describe('coerceCell — numbers', () => {
  const number = column('number');

  it('accepts plain and grouped decimals', () => {
    expectOk(coerceCell('1234.5', number), 1234.5);
    expectOk(coerceCell('1,234.5', number), 1234.5);
    expectOk(coerceCell('1,234,567', number), 1234567);
    expectOk(coerceCell('-1,234.25', number), -1234.25);
    expectOk(coerceCell(' 42 ', number), 42);
    expectOk(coerceCell(42.5, number), 42.5);
  });

  it('rejects malformed groups instead of collapsing commas', () => {
    expectError(coerceCell('1,23', number), 'E_TYPE');
    expectError(coerceCell('abc', number), 'E_TYPE');
  });

  it('rejects non-finite values', () => {
    expectError(coerceCell('Infinity', number), 'E_RANGE');
    expectError(coerceCell('NaN', number), 'E_TYPE');
    expectError(coerceCell(Number.POSITIVE_INFINITY, number), 'E_RANGE');
  });

  it('treats blank input as null unless the column is required', () => {
    expectOk(coerceCell('   ', number), null);
    expectOk(coerceCell(null, number), null);
    expectOk(coerceCell(undefined, number), null);
    expectError(coerceCell('', column('number', { required: true })), 'E_REQUIRED');
  });
});

describe('coerceCell — dates', () => {
  const date = column('date');

  it('parses date-only strings as local midnight', () => {
    const expected = new Date(2026, 0, 1).getTime();
    expectOk(coerceCell('2026-01-01', date), expected);
  });

  it('parses ISO date-times and epoch milliseconds', () => {
    expectOk(coerceCell('2026-01-01T08:00:00Z', date), Date.parse('2026-01-01T08:00:00Z'));
    expectOk(coerceCell(1735689600000, date), 1735689600000);
  });

  it('rejects impossible dates and non-integer timestamps', () => {
    expectError(coerceCell('2026-02-30', date), 'E_TYPE');
    expectError(coerceCell('2026-13-01', date), 'E_TYPE');
    expectError(coerceCell('not a date', date), 'E_TYPE');
    expectError(coerceCell(1.5, date), 'E_TYPE');
  });

  it('treats blank input as null unless required', () => {
    expectOk(coerceCell('  ', date), null);
    expectError(coerceCell('', column('date', { required: true })), 'E_REQUIRED');
  });
});

describe('coerceCell — booleans', () => {
  const boolean = column('boolean');

  it('accepts the documented spellings', () => {
    for (const truthy of ['true', 'TRUE', '1', '是', true, 1]) {
      expectOk(coerceCell(truthy, boolean), true);
    }
    for (const falsy of ['false', 'FALSE', '0', '否', false, 0]) {
      expectOk(coerceCell(falsy, boolean), false);
    }
  });

  it('rejects other values', () => {
    expectError(coerceCell('yes', boolean), 'E_TYPE');
    expectError(coerceCell('2', boolean), 'E_TYPE');
    expectError(coerceCell(2, boolean), 'E_TYPE');
  });
});

describe('coerceCell — enums and text', () => {
  const status = column('enum', {
    enumOptions: [
      { value: 'open', label: 'Open' },
      { value: 'closed', label: 'Closed' },
    ],
  });

  it('matches enum values, ignoring surrounding whitespace', () => {
    expectOk(coerceCell('open', status), 'open');
    expectOk(coerceCell('  closed ', status), 'closed');
    expectError(coerceCell('pending', status), 'E_ENUM');
    expectError(coerceCell(1, status), 'E_ENUM');
    expectError(coerceCell('open', column('enum')), 'E_ENUM');
  });

  it('converts numbers to text and clears blank text', () => {
    const text = column('text');
    expectOk(coerceCell(42, text), '42');
    expectOk(coerceCell(1.5, text), '1.5');
    expectOk(coerceCell(true, text), 'true');
    expectOk(coerceCell('hello', text), 'hello');
    expectOk(coerceCell('   ', text), '');
    expectOk(coerceCell(null, text), '');
    expectError(coerceCell('   ', column('text', { required: true })), 'E_REQUIRED');
  });

  it('rejects text above the cell limit', () => {
    expectError(coerceCell('a'.repeat(100_001), column('text')), 'E_RANGE');
  });

  it('rejects structured input', () => {
    expectError(coerceCell({ value: 1 }, column('text')), 'E_TYPE');
    expectError(coerceCell([1], column('number')), 'E_TYPE');
  });
});
