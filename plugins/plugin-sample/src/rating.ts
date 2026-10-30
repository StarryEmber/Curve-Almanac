/**
 * `rating` semantic field type (T6.2, SPEC §14.2/§14.3).
 *
 * A rating is stored as a plain number from 1 to 5: the JSONL shape stays one of
 * the five builtin storage types (ADR-015). The field type only adds parsing,
 * validation, formatting (`★★★`) and comparison; it never changes the physical
 * cell form.
 */

import type { Cell, ColumnDef } from '@curve/domain';
import type { FieldTypeDef } from '@curve/plugin-sdk';

/** Reverse-domain id so a plugin contribution cannot shadow a builtin type. */
export const RATING_FIELD_TYPE_ID = 'com.curvealmanac.rating';

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** One star per rating point; the only user-visible formatting this plugin adds. */
export const RATING_STAR = '★';

export const RATING_INVALID_MESSAGE = `A rating must be a whole number from ${String(
  RATING_MIN,
)} to ${String(RATING_MAX)}.`;

export type RatingParseResult = { ok: true; value: Cell } | { ok: false; message: string };

/** True for the storable shape: an integer in `RATING_MIN`..`RATING_MAX`. */
export function isRatingValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= RATING_MIN &&
    value <= RATING_MAX
  );
}

/** `3` renders as `★★★`; `null` as an empty string (grid shows a blank cell). */
export function formatRating(value: Cell): string {
  if (isRatingValue(value)) {
    return RATING_STAR.repeat(value);
  }
  return value === null ? '' : String(value);
}

/**
 * Accepts integer text (surrounding whitespace allowed); empty text clears the
 * cell.
 *
 * Range is deliberately *not* enforced here: `0` and `6` parse as numbers and
 * are rejected by `validate`, so the grid reports "out of range" instead of a
 * type error. Non-numeric text is a type error.
 */
export function parseRatingText(raw: string): RatingParseResult {
  const text = raw.trim();
  if (text.length === 0) {
    return { ok: true, value: null };
  }
  if (/^[+-]?\d+$/.test(text)) {
    return { ok: true, value: Number(text) };
  }
  return { ok: false, message: RATING_INVALID_MESSAGE };
}

/** Nulls sort last in both directions, matching the table-engine sort (ADR-032). */
export function compareRatings(left: Cell, right: Cell): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

/** `required` still comes from the column definition, not from the plugin. */
export function validateRating(value: Cell, column: ColumnDef): string | null {
  if (value === null) {
    return column.required === true ? 'The rating is required.' : null;
  }
  return isRatingValue(value) ? null : RATING_INVALID_MESSAGE;
}

export const ratingFieldType: FieldTypeDef = {
  id: RATING_FIELD_TYPE_ID,
  label: 'Rating',
  storageType: 'number',
  parseText: parseRatingText,
  format: (value) => formatRating(value),
  validate: validateRating,
  compare: compareRatings,
  defaultWidth: 96,
};
