import { describe, expect, it } from 'vitest';

import type { ColumnDef, Row } from '@curve/domain';

import { frozenOffsets, measureColumnWidth } from './grid-sizing';

const column: ColumnDef = {
  id: 'col_1',
  key: 'id',
  label: 'Identifier',
  type: 'text',
  role: 'none',
};

function rows(count: number, textLength: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row_${String(index)}`,
    values: ['x'.repeat(textLength)],
  }));
}

describe('measureColumnWidth', () => {
  it('clamps between 80 and 800 and samples at most 200 rows', () => {
    expect(measureColumnWidth(column, [], 0, 'ID')).toBeGreaterThanOrEqual(80);
    expect(measureColumnWidth(column, rows(1000, 200), 0, 'ID')).toBeLessThanOrEqual(800);
    expect(measureColumnWidth(column, rows(10, 40), 0, 'ID')).toBeGreaterThan(80);
  });

  it('measures the style-aware formatted text', () => {
    const data = rows(3, 1);
    const short = measureColumnWidth(column, data, 0, 'ID');
    const wide = measureColumnWidth(column, data, 0, 'ID', {
      formatValue: () => 'x'.repeat(60),
    });

    expect(wide).toBeGreaterThan(short);
    expect(wide).toBeLessThanOrEqual(800);
  });
});

describe('frozenOffsets', () => {
  it('returns cumulative left offsets only for the frozen prefix', () => {
    expect(frozenOffsets([100, 150, 200], 2)).toEqual([0, 100, 0]);
    expect(frozenOffsets([100, 150, 200], 0)).toEqual([0, 0, 0]);
    expect(frozenOffsets([100, 150, 200], 3)).toEqual([0, 100, 250]);
  });
});
