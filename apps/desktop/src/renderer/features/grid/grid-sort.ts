import { MAX_SORT_LEVELS } from '@curve/domain';
import type { SortSpec } from '@curve/domain';

/**
 * Header-click sorting state machine (T2.6).
 *
 * Plain click owns the whole sort: asc → desc → none. Shift+click toggles an
 * additional level (max 3) so a third/fourth click on the same column walks
 * asc → desc → removed without disturbing the other levels.
 */

export function toggleSort(
  current: readonly SortSpec[],
  columnId: string,
  additive: boolean,
): SortSpec[] {
  const index = current.findIndex((spec) => spec.columnId === columnId);
  const existing = index >= 0 ? current[index] : undefined;

  if (!additive) {
    if (current.length === 1 && existing !== undefined) {
      return existing.direction === 'asc' ? [{ columnId, direction: 'desc' }] : [];
    }
    return [{ columnId, direction: 'asc' }];
  }

  if (existing !== undefined) {
    if (existing.direction === 'asc') {
      return current.map((spec, position) =>
        position === index ? { columnId, direction: 'desc' } : spec,
      );
    }
    return current.filter((_spec, position) => position !== index);
  }
  if (current.length >= MAX_SORT_LEVELS) {
    return [...current];
  }
  return [...current, { columnId, direction: 'asc' }];
}
