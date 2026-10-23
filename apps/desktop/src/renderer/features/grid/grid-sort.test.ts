import { describe, expect, it } from 'vitest';

import { toggleSort } from './grid-sort';

describe('toggleSort', () => {
  it('cycles a single column asc → desc → none', () => {
    const asc = toggleSort([], 'col_a', false);
    expect(asc).toEqual([{ columnId: 'col_a', direction: 'asc' }]);
    const desc = toggleSort(asc, 'col_a', false);
    expect(desc).toEqual([{ columnId: 'col_a', direction: 'desc' }]);
    expect(toggleSort(desc, 'col_a', false)).toEqual([]);
  });

  it('replaces other levels on a plain header click', () => {
    const current = [
      { columnId: 'col_a', direction: 'asc' as const },
      { columnId: 'col_b', direction: 'desc' as const },
    ];
    expect(toggleSort(current, 'col_c', false)).toEqual([{ columnId: 'col_c', direction: 'asc' }]);
    expect(toggleSort(current, 'col_b', false)).toEqual([{ columnId: 'col_b', direction: 'asc' }]);
  });

  it('adds, flips and removes levels with Shift', () => {
    const first = toggleSort([], 'col_a', true);
    expect(first).toEqual([{ columnId: 'col_a', direction: 'asc' }]);
    const second = toggleSort(first, 'col_b', true);
    expect(second).toEqual([
      { columnId: 'col_a', direction: 'asc' },
      { columnId: 'col_b', direction: 'asc' },
    ]);
    const third = toggleSort(second, 'col_b', true);
    expect(third).toEqual([
      { columnId: 'col_a', direction: 'asc' },
      { columnId: 'col_b', direction: 'desc' },
    ]);
    expect(toggleSort(third, 'col_b', true)).toEqual([{ columnId: 'col_a', direction: 'asc' }]);
  });

  it('caps multi-sort at three levels', () => {
    const current = [
      { columnId: 'col_a', direction: 'asc' as const },
      { columnId: 'col_b', direction: 'asc' as const },
      { columnId: 'col_c', direction: 'asc' as const },
    ];
    expect(toggleSort(current, 'col_d', true)).toEqual(current);
  });
});
