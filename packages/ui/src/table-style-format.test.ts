import { describe, expect, it } from 'vitest';

import { DEFAULT_TABLE_STYLE, createTableStyle } from '@curve/domain';
import type {
  Cell,
  ColumnDef,
  ColumnStyleOverride,
  ColumnType,
  ConditionalRule,
  ConditionalRuleMatch,
  Row,
  TableStyle,
} from '@curve/domain';

import {
  barRatioForValue,
  columnDisplayLabel,
  computeBarRanges,
  conditionalCellStyle,
  enumBadgeTone,
  formatStyledCellValue,
  presentStyledCell,
  resolveCellAlign,
  resolveCellRender,
} from './table-style-format';

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

function overrideFor(columnId: string, value: ColumnStyleOverride): TableStyle {
  return createTableStyle({
    name: 'Test style',
    columnOverrides: { [columnId]: value },
  });
}

const middayUtc = Date.UTC(2026, 0, 15, 12, 0, 0);

describe('formatStyledCellValue', () => {
  it('applies Intl grouping to numbers without a precision', () => {
    const number = column('number');

    expect(formatStyledCellValue(1234.5678, number, DEFAULT_TABLE_STYLE, { locale: 'en-US' })).toBe(
      '1,234.5678',
    );
    expect(formatStyledCellValue(1234.5, number, DEFAULT_TABLE_STYLE, { locale: 'zh-CN' })).toBe(
      '1,234.5',
    );
  });

  it('uses the column precision and then a style override precision', () => {
    const number = column('number', { precision: 2 });
    const style = overrideFor('col_test', {
      numberFormat: { style: 'decimal', digits: 1 },
    });

    expect(formatStyledCellValue(1234.5, number, DEFAULT_TABLE_STYLE, { locale: 'en-US' })).toBe(
      '1,234.50',
    );
    expect(formatStyledCellValue(1234.56, number, style, { locale: 'en-US' })).toBe('1,234.6');
  });

  it('renders percent and currency overrides', () => {
    const number = column('number');
    const percent = overrideFor('col_test', {
      numberFormat: { style: 'percent', digits: 1 },
    });
    const currency = overrideFor('col_test', {
      numberFormat: { style: 'currency', currency: 'USD', digits: 2 },
    });

    expect(formatStyledCellValue(0.256, number, percent, { locale: 'en-US' })).toBe('25.6%');
    expect(formatStyledCellValue(1234.5, number, currency, { locale: 'en-US' })).toBe('$1,234.50');
  });

  it('falls back to decimal formatting for an invalid currency instead of throwing', () => {
    const number = column('number');
    const currency = overrideFor('col_test', {
      numberFormat: { style: 'currency', currency: 'NOT-A-CURRENCY', digits: 2 },
    });

    expect(formatStyledCellValue(1234.5, number, currency, { locale: 'en-US' })).toBe('1,234.50');
  });

  it('renders empty and non-finite numbers without throwing', () => {
    const number = column('number');

    expect(formatStyledCellValue(null, number, DEFAULT_TABLE_STYLE)).toBe('');
    expect(formatStyledCellValue(Number.NaN, number, DEFAULT_TABLE_STYLE)).toBe('');
    expect(formatStyledCellValue('1234', number, DEFAULT_TABLE_STYLE)).toBe('1234');
  });

  it('formats dates in the locale and honours the date override', () => {
    const date = column('date');
    const dateTime = overrideFor('col_test', { dateFormat: 'date-time' });
    const iso = overrideFor('col_test', { dateFormat: 'iso' });

    expect(formatStyledCellValue(middayUtc, date, DEFAULT_TABLE_STYLE, { locale: 'en-US' })).toBe(
      '01/15/2026',
    );
    expect(formatStyledCellValue(middayUtc, date, DEFAULT_TABLE_STYLE, { locale: 'zh-CN' })).toBe(
      '2026/01/15',
    );
    expect(formatStyledCellValue(middayUtc, date, dateTime, { locale: 'en-US' })).toContain(
      '01/15/2026',
    );
    expect(formatStyledCellValue(middayUtc, date, iso, { locale: 'en-US' })).toBe(
      '2026-01-15T12:00:00.000Z',
    );
    expect(formatStyledCellValue(Number.NaN, date, DEFAULT_TABLE_STYLE)).toBe('');
  });

  it('localises booleans through the supplied labels', () => {
    const flag = column('boolean');

    expect(
      formatStyledCellValue(true, flag, DEFAULT_TABLE_STYLE, {
        trueLabel: '是',
        falseLabel: '否',
      }),
    ).toBe('是');
    expect(
      formatStyledCellValue(false, flag, DEFAULT_TABLE_STYLE, {
        trueLabel: '是',
        falseLabel: '否',
      }),
    ).toBe('否');
    expect(formatStyledCellValue(true, flag, DEFAULT_TABLE_STYLE)).toBe('true');
  });

  it('maps enum values to labels and keeps unknown values', () => {
    const status = column('enum', {
      enumOptions: [
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
      ],
    });

    expect(formatStyledCellValue('open', status, DEFAULT_TABLE_STYLE)).toBe('Open');
    expect(formatStyledCellValue('archived', status, DEFAULT_TABLE_STYLE)).toBe('archived');
  });

  it('delegates to a semantic field type when one is supplied (T6.2)', () => {
    const rating = column('number', { fieldTypeId: 'com.curvealmanac.rating' });
    const formatField = (value: Cell): string | null =>
      typeof value === 'number' ? '★'.repeat(value) : null;

    expect(
      formatStyledCellValue(3, rating, DEFAULT_TABLE_STYLE, { locale: 'en-US', formatField }),
    ).toBe('★★★');
    // A `null` return falls back to the storage-type formatting.
    expect(
      formatStyledCellValue('plain', rating, DEFAULT_TABLE_STYLE, { locale: 'en-US', formatField }),
    ).toBe('plain');
    expect(formatStyledCellValue(3, rating, DEFAULT_TABLE_STYLE, { locale: 'en-US' })).toBe('3');
    expect(formatStyledCellValue(null, rating, DEFAULT_TABLE_STYLE, { formatField })).toBe('');
  });

  it('does not mutate the column or the style when applying overrides', () => {
    const number = column('number', { label: 'Amount' });
    const style = overrideFor('col_test', {
      label: 'Total',
      width: 220,
      align: 'center',
      numberFormat: { style: 'decimal', digits: 3 },
    });
    const columnBefore = JSON.stringify(number);
    const styleBefore = JSON.stringify(style);

    expect(formatStyledCellValue(1234.5, number, style, { locale: 'en-US' })).toBe('1,234.500');
    expect(columnDisplayLabel(number, style)).toBe('Total');
    expect(resolveCellAlign(number, style)).toBe('center');
    expect(JSON.stringify(number)).toBe(columnBefore);
    expect(JSON.stringify(style)).toBe(styleBefore);
  });
});

describe('column presentation', () => {
  it('right-aligns numbers and dates, left-aligns other types', () => {
    expect(resolveCellAlign(column('number'), DEFAULT_TABLE_STYLE)).toBe('right');
    expect(resolveCellAlign(column('date'), DEFAULT_TABLE_STYLE)).toBe('right');
    expect(resolveCellAlign(column('text'), DEFAULT_TABLE_STYLE)).toBe('left');
    expect(resolveCellAlign(column('boolean'), DEFAULT_TABLE_STYLE)).toBe('left');
    expect(resolveCellAlign(column('enum'), DEFAULT_TABLE_STYLE)).toBe('left');
  });

  it('lets an override choose the alignment and label', () => {
    const text = column('text', { label: 'Name' });
    const style = overrideFor('col_test', { align: 'center', label: 'Label' });

    expect(resolveCellAlign(text, style)).toBe('center');
    expect(columnDisplayLabel(text, style)).toBe('Label');
    expect(columnDisplayLabel(column('text'), DEFAULT_TABLE_STYLE)).toBe('Test');
  });

  it('resolves render modes from the column type and override', () => {
    expect(resolveCellRender(column('enum'), DEFAULT_TABLE_STYLE)).toBe('badge');
    expect(resolveCellRender(column('number'), DEFAULT_TABLE_STYLE)).toBe('text');

    const numberBar = overrideFor('col_test', { cellRender: 'bar' });
    const enumText = overrideFor('col_test', { cellRender: 'text' });
    const textBadge = overrideFor('col_test', { cellRender: 'badge' });
    const textBar = overrideFor('col_test', { cellRender: 'bar' });

    expect(resolveCellRender(column('number'), numberBar)).toBe('bar');
    expect(resolveCellRender(column('enum'), enumText)).toBe('text');
    expect(resolveCellRender(column('text'), textBadge)).toBe('text');
    expect(resolveCellRender(column('text'), textBar)).toBe('text');
  });

  it('ignores overrides for unknown column ids', () => {
    const style = overrideFor('col_other', { label: 'Other', align: 'right' });

    expect(columnDisplayLabel(column('text'), style)).toBe('Test');
    expect(resolveCellAlign(column('text'), style)).toBe('left');
  });
});

describe('bar ranges', () => {
  function row(id: string, value: Cell): Row {
    return { id, values: [value] };
  }

  const number = column('number', { id: 'col_value', key: 'value', label: 'Value' });
  const style = overrideFor('col_value', { cellRender: 'bar' });

  it('computes min/max over finite numeric values', () => {
    const rows = [
      row('row_a', -5),
      row('row_b', 20),
      row('row_c', null),
      row('row_d', '10'),
      row('row_e', Number.NaN),
    ];

    expect(computeBarRanges(rows, [number], style)).toEqual({
      col_value: { min: -5, max: 20 },
    });
  });

  it('returns no range for columns without numeric values', () => {
    expect(computeBarRanges([row('row_a', null)], [number], style)).toEqual({});
  });

  it('normalises values, clamps and returns 0 for a flat range', () => {
    const range = { min: 10, max: 30 };

    expect(barRatioForValue(10, range)).toBe(0);
    expect(barRatioForValue(20, range)).toBe(0.5);
    expect(barRatioForValue(30, range)).toBe(1);
    expect(barRatioForValue(40, range)).toBe(1);
    expect(barRatioForValue(0, range)).toBe(0);
    expect(barRatioForValue(10, { min: 10, max: 10 })).toBe(0);
    expect(barRatioForValue(null, range)).toBeNull();
    expect(barRatioForValue('10', range)).toBeNull();
  });

  it('only prepares ranges for supported bar columns', () => {
    const text = column('text', { id: 'col_text', key: 'text', label: 'Text' });
    const textStyle = overrideFor('col_text', { cellRender: 'bar' });

    expect(computeBarRanges([row('row_a', 'x')], [text], textStyle)).toEqual({});
    expect(computeBarRanges([row('row_a', 1)], [number], DEFAULT_TABLE_STYLE)).toEqual({});
  });
});

describe('enumBadgeTone', () => {
  it('is deterministic, bounded and spread across tones', () => {
    const values = ['open', 'closed', 'paused', 'archived', 'draft', 'ready'];
    const tones = values.map((value) => enumBadgeTone(value));

    expect(tones.every((tone) => tone >= 0 && tone <= 3)).toBe(true);
    expect(enumBadgeTone('open')).toBe(enumBadgeTone('open'));
    expect(new Set(tones).size).toBeGreaterThan(1);
  });
});

describe('presentStyledCell', () => {
  it('bundles text, alignment and decoration for a bar cell', () => {
    const number = column('number', { id: 'col_value', key: 'value', label: 'Value' });
    const style = overrideFor('col_value', { cellRender: 'bar', align: 'center' });

    expect(
      presentStyledCell(
        20,
        number,
        style,
        { col_value: { min: 10, max: 30 } },
        { locale: 'en-US' },
      ),
    ).toEqual({
      text: '20',
      align: 'center',
      render: 'bar',
      barRatio: 0.5,
      badgeTone: null,
    });
  });

  it('bundles a badge tone for an enum cell', () => {
    const status = column('enum', {
      id: 'col_status',
      key: 'status',
      label: 'Status',
      enumOptions: [{ value: 'open', label: 'Open' }],
    });

    const presented = presentStyledCell('open', status, DEFAULT_TABLE_STYLE, {});

    expect(presented.text).toBe('Open');
    expect(presented.render).toBe('badge');
    expect(presented.badgeTone).toBe(enumBadgeTone('open'));
    expect(presented.barRatio).toBeNull();
  });
});

describe('conditionalCellStyle', () => {
  const rule: ConditionalRule = {
    id: 'rule_hot',
    enabled: true,
    label: 'Hot',
    target: { kind: 'row' },
    when: { kind: 'compare', columnId: 'col_value', op: 'gt', value: 30 },
    style: {
      background: '#fde2e2',
      foreground: '#a40000',
      bold: true,
      italic: true,
      icon: 'warning',
    },
  };
  const match: ConditionalRuleMatch = { rule, target: 'row', columnId: null };

  it('copies the matched rule style for the cell', () => {
    expect(conditionalCellStyle(match)).toEqual({
      ruleId: 'rule_hot',
      label: 'Hot',
      background: '#fde2e2',
      foreground: '#a40000',
      bold: true,
      italic: true,
      icon: 'warning',
    });
  });

  it('omits the icon for everything but the first visible row cell', () => {
    expect(conditionalCellStyle(match, { includeIcon: false })).toEqual({
      ruleId: 'rule_hot',
      label: 'Hot',
      background: '#fde2e2',
      foreground: '#a40000',
      bold: true,
      italic: true,
    });
  });

  it('returns null when no rule matched', () => {
    expect(conditionalCellStyle(null)).toBeNull();
  });
});
