import { describe, expect, it } from 'vitest';

import type { ColumnDef } from '@curve/domain';

import {
  RATING_FIELD_TYPE_ID,
  RATING_INVALID_MESSAGE,
  RATING_MAX,
  RATING_MIN,
  compareRatings,
  formatRating,
  isRatingValue,
  parseRatingText,
  ratingFieldType,
  validateRating,
} from './rating';

function ratingColumn(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: 'col_rating',
    key: 'rating',
    label: 'Rating',
    type: 'number',
    role: 'none',
    fieldTypeId: RATING_FIELD_TYPE_ID,
    ...overrides,
  };
}

describe('isRatingValue', () => {
  it('accepts every whole star from 1 to 5', () => {
    for (let value = RATING_MIN; value <= RATING_MAX; value += 1) {
      expect(isRatingValue(value)).toBe(true);
    }
  });

  it('rejects out-of-range, fractional and non-number cells', () => {
    for (const value of [0, 6, -1, 3.5, Number.NaN, '3', null, undefined, true]) {
      expect(isRatingValue(value)).toBe(false);
    }
  });
});

describe('parseRatingText', () => {
  it('parses the canonical digits and trims whitespace', () => {
    expect(parseRatingText('3')).toEqual({ ok: true, value: 3 });
    expect(parseRatingText(' 5 ')).toEqual({ ok: true, value: 5 });
  });

  it('treats empty text as a cleared cell', () => {
    expect(parseRatingText('')).toEqual({ ok: true, value: null });
    expect(parseRatingText('   ')).toEqual({ ok: true, value: null });
  });

  it('parses out-of-range integers so validate can report a range issue', () => {
    expect(parseRatingText('0')).toEqual({ ok: true, value: 0 });
    expect(parseRatingText('6')).toEqual({ ok: true, value: 6 });
  });

  it('rejects fractional and arbitrary text with the shared message', () => {
    for (const raw of ['3.5', 'abc', '★★★★', '1e2']) {
      expect(parseRatingText(raw)).toEqual({ ok: false, message: RATING_INVALID_MESSAGE });
    }
  });
});

describe('formatRating', () => {
  it('renders one star per point', () => {
    expect(formatRating(1)).toBe('★');
    expect(formatRating(5)).toBe('★★★★★');
  });

  it('renders null as an empty string and keeps unexpected values readable', () => {
    expect(formatRating(null)).toBe('');
    expect(formatRating(3.5)).toBe('3.5');
    expect(formatRating('3')).toBe('3');
  });
});

describe('validateRating', () => {
  it('accepts in-range values and empty optional cells', () => {
    expect(validateRating(3, ratingColumn())).toBeNull();
    expect(validateRating(null, ratingColumn())).toBeNull();
  });

  it('requires a value for a required column', () => {
    expect(validateRating(null, ratingColumn({ required: true }))).toBe('The rating is required.');
  });

  it('rejects values outside 1..5', () => {
    expect(validateRating(0, ratingColumn())).toBe(RATING_INVALID_MESSAGE);
    expect(validateRating(6, ratingColumn())).toBe(RATING_INVALID_MESSAGE);
    expect(validateRating(2.5, ratingColumn())).toBe(RATING_INVALID_MESSAGE);
  });
});

describe('compareRatings', () => {
  it('orders numbers ascending and keeps equal values at 0', () => {
    expect(compareRatings(2, 4)).toBeLessThan(0);
    expect(compareRatings(4, 2)).toBeGreaterThan(0);
    expect(compareRatings(3, 3)).toBe(0);
  });

  it('sorts nulls last, like the table-engine sort semantics', () => {
    expect(compareRatings(null, 3)).toBeGreaterThan(0);
    expect(compareRatings(3, null)).toBeLessThan(0);
    expect(compareRatings(null, null)).toBe(0);
  });
});

describe('ratingFieldType', () => {
  it('declares a namespaced id, a number storage type and a usable width', () => {
    expect(ratingFieldType.id).toBe(RATING_FIELD_TYPE_ID);
    expect(ratingFieldType.id).not.toBe('number');
    expect(ratingFieldType.storageType).toBe('number');
    expect(ratingFieldType.label.length).toBeGreaterThan(0);
    expect(ratingFieldType.defaultWidth).toBeGreaterThan(0);
  });

  it('keeps the JSONL cell shape a plain number', () => {
    const parsed = ratingFieldType.parseText('4');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(typeof parsed.value).toBe('number');
    }
  });
});
