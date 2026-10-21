/** Column width helpers for the data grid (T2.1, SPEC §9.1). */

import { formatCellValue } from '@curve/domain';
import type { Cell, ColumnDef, Row } from '@curve/domain';

export const MIN_COLUMN_WIDTH = 80;
export const MAX_COLUMN_WIDTH = 800;
export const DEFAULT_COLUMN_WIDTH = 160;
export const AUTOFIT_SAMPLE_ROWS = 200;

function clampWidth(value: number): number {
  return Math.min(Math.max(Math.round(value), MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
}

/** Fallback for environments without a canvas (unit tests, SSR). */
function approximateWidth(text: string): number {
  return text.length * 8 + 32;
}

/**
 * Measures a sensible column width from the header and the first rows.
 *
 * Sampling is capped so double-click autofit stays O(200) rather than walking a
 * 100k-row table; that is what keeps the interaction inside the frame budget.
 */
export function measureColumnWidth(
  column: ColumnDef,
  rows: readonly Row[],
  columnIndex: number,
  headerLabel: string,
): number {
  let widest = approximateWidth(headerLabel);

  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  const context = canvas?.getContext('2d') ?? null;
  const font =
    typeof getComputedStyle === 'function'
      ? getComputedStyle(document.documentElement).getPropertyValue('font-family')
      : '';
  if (context !== null) {
    context.font = `13px ${font.length > 0 ? font : 'sans-serif'}`;
  }

  const sample = rows.slice(0, AUTOFIT_SAMPLE_ROWS);
  for (const row of sample) {
    const value: Cell = row.values[columnIndex] ?? null;
    const text = formatCellValue(value, column);
    const width = context === null ? approximateWidth(text) : context.measureText(text).width;
    widest = Math.max(widest, width + 32);
  }
  return clampWidth(widest);
}

/** Left offsets for sticky columns; index beyond the frozen prefix is ignored. */
export function frozenOffsets(sizes: readonly number[], frozenCount: number): number[] {
  const offsets: number[] = [];
  let left = 0;
  for (let index = 0; index < sizes.length; index += 1) {
    if (index >= frozenCount) {
      offsets.push(0);
      continue;
    }
    offsets.push(left);
    left += sizes[index] ?? DEFAULT_COLUMN_WIDTH;
  }
  return offsets;
}
