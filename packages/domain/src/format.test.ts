import { describe, expect, it } from 'vitest';

import { formatCellValue } from './format';

import type { ColumnDef, ColumnType } from './types';

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

describe('formatCellValue', () => {
  it('renders null as an empty string', () => {
    expect(formatCellValue(null, column('number'))).toBe('');
  });

  it('applies number precision and grouping', () => {
    const price = column('number', { precision: 2 });
    expect(formatCellValue(1234.5, price, { locale: 'en-US' })).toBe('1,234.50');
    expect(formatCellValue(0, price, { locale: 'en-US' })).toBe('0.00');
  });

  it('keeps full precision when the column has none', () => {
    expect(formatCellValue(1234.5678, column('number'))).toBe('1234.5678');
  });

  it('renders dates in the requested format', () => {
    const date = column('date');
    const middayUtc = Date.UTC(2026, 0, 15, 12, 0, 0);
    expect(formatCellValue(middayUtc, date, { dateFormat: 'iso' })).toBe(
      '2026-01-15T12:00:00.000Z',
    );
    expect(formatCellValue(middayUtc, date, { locale: 'en-US' })).toBe('01/15/2026');
    expect(formatCellValue(middayUtc, date, { locale: 'en-US', dateFormat: 'date-time' })).toMatch(
      /^01\/15\/2026/,
    );
    expect(formatCellValue(middayUtc, date, { locale: 'en-US', dateFormat: 'time' })).toMatch(
      /^\d{2}:\d{2}:\d{2}[\s\u202f]?(AM|PM)$/,
    );
  });

  it('renders booleans through provided labels', () => {
    const flag = column('boolean');
    expect(formatCellValue(true, flag)).toBe('true');
    expect(formatCellValue(false, flag)).toBe('false');
    expect(formatCellValue(true, flag, { trueLabel: '是', falseLabel: '否' })).toBe('是');
    expect(formatCellValue(false, flag, { trueLabel: '是', falseLabel: '否' })).toBe('否');
  });

  it('maps enum values to labels and falls back to the raw value', () => {
    const status = column('enum', {
      enumOptions: [
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
      ],
    });
    expect(formatCellValue('open', status)).toBe('Open');
    expect(formatCellValue('archived', status)).toBe('archived');
  });

  it('renders text and unexpected physical shapes defensively', () => {
    expect(formatCellValue('abc', column('text'))).toBe('abc');
    expect(formatCellValue(42, column('text'))).toBe('42');
    expect(formatCellValue('1234', column('number'))).toBe('1234');
    expect(formatCellValue(Number.NaN, column('number'))).toBe('');
    expect(formatCellValue(Number.NaN, column('date'), { dateFormat: 'iso' })).toBe('');
  });
});
