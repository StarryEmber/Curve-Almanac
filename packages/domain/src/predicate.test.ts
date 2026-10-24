import { describe, expect, it } from 'vitest';

import {
  allowedCompareOps,
  conditionCompareOps,
  matchesPreparedComparison,
  prepareComparison,
} from './predicate';

import type { ColumnDef } from './types';

const TEXT: ColumnDef = {
  id: 'col_text',
  key: 'text',
  label: 'Text',
  type: 'text',
  role: 'none',
};

const NUMBER: ColumnDef = {
  id: 'col_num',
  key: 'num',
  label: 'Num',
  type: 'number',
  role: 'y',
};

const BOOLEAN: ColumnDef = {
  id: 'col_bool',
  key: 'bool',
  label: 'Bool',
  type: 'boolean',
  role: 'none',
};

describe('shared comparison semantics', () => {
  it('keeps the filter whitelist and adds number/date contains for conditions', () => {
    expect(allowedCompareOps(NUMBER)).not.toContain('contains');
    expect(conditionCompareOps(NUMBER)).toContain('contains');
    expect(conditionCompareOps(TEXT)).toEqual(allowedCompareOps(TEXT));
    expect(conditionCompareOps(BOOLEAN)).toEqual(allowedCompareOps(BOOLEAN));
  });

  it('matches text case-insensitively with the active locale', () => {
    const contains = prepareComparison(TEXT, { op: 'contains', value: 'LP' });
    expect(matchesPreparedComparison('alpha', contains)).toBe(true);
    expect(matchesPreparedComparison('beta', contains)).toBe(false);

    const starts = prepareComparison(TEXT, { op: 'startsWith', value: 'AL' });
    expect(matchesPreparedComparison('Alpha', starts)).toBe(true);
  });

  it('only stringifies number/date for contains in condition mode', () => {
    const filterCompare = prepareComparison(NUMBER, { op: 'contains', value: '4' });
    expect(matchesPreparedComparison(42, filterCompare)).toBe(false);

    const conditionCompare = prepareComparison(
      NUMBER,
      { op: 'contains', value: '4' },
      { mode: 'condition' },
    );
    expect(matchesPreparedComparison(42, conditionCompare)).toBe(true);
    expect(matchesPreparedComparison(50, conditionCompare)).toBe(false);

    const starts = prepareComparison(
      NUMBER,
      { op: 'startsWith', value: '4' },
      { mode: 'condition' },
    );
    expect(matchesPreparedComparison(42, starts)).toBe(false);
  });

  it('treats null and empty text as null and never matches value operators', () => {
    const eq = prepareComparison(TEXT, { op: 'eq', value: 'alpha' });
    expect(matchesPreparedComparison(null, eq)).toBe(false);
    expect(matchesPreparedComparison('', eq)).toBe(false);

    const isNull = prepareComparison(TEXT, { op: 'isNull' });
    expect(matchesPreparedComparison('', isNull)).toBe(true);
    expect(matchesPreparedComparison('alpha', isNull)).toBe(false);
  });

  it('includes both between bounds and accepts swapped bounds', () => {
    const between = prepareComparison(NUMBER, { op: 'between', value: 42, value2: 42 });
    expect(matchesPreparedComparison(42, between)).toBe(true);

    const swapped = prepareComparison(NUMBER, { op: 'between', value: 50, value2: 40 });
    expect(matchesPreparedComparison(40, swapped)).toBe(true);
    expect(matchesPreparedComparison(50, swapped)).toBe(true);
    expect(matchesPreparedComparison(39, swapped)).toBe(false);
    expect(matchesPreparedComparison(51, swapped)).toBe(false);
  });

  it('does not throw on type mismatches', () => {
    const eq = prepareComparison(NUMBER, { op: 'eq', value: '42' });
    expect(matchesPreparedComparison(42, eq)).toBe(false);

    const gt = prepareComparison(NUMBER, { op: 'gt', value: '10' });
    expect(matchesPreparedComparison(42, gt)).toBe(false);

    const between = prepareComparison(NUMBER, { op: 'between', value: 1, value2: '9' });
    expect(matchesPreparedComparison(5, between)).toBe(false);
  });
});
