import { describe, expect, it } from 'vitest';

import type { TableViewState } from '@curve/domain';

import {
  insertColumnIntoView,
  removeColumnFromFilter,
  removeColumnFromView,
  reorderViewColumns,
} from './column-views';

function makeView(overrides: Partial<TableViewState> = {}): TableViewState {
  return {
    tableId: 'tbl_1',
    styleId: 'builtin.report-light',
    columnOrder: ['col_id', 'col_time', 'col_value'],
    widths: { col_time: 160, col_value: 120 },
    hiddenColumnIds: ['col_time'],
    sort: [
      { columnId: 'col_time', direction: 'asc' },
      { columnId: 'col_value', direction: 'desc' },
    ],
    frozenColumnCount: 2,
    ...overrides,
  };
}

describe('removeColumnFromFilter', () => {
  it('drops a compare node and keeps the remaining children', () => {
    const filter = {
      kind: 'all' as const,
      children: [
        { kind: 'compare' as const, columnId: 'col_time', op: 'gt' as const, value: 0 },
        { kind: 'compare' as const, columnId: 'col_value', op: 'lt' as const, value: 100 },
      ],
    };

    expect(removeColumnFromFilter(filter, 'col_time')).toEqual({
      kind: 'all',
      children: [{ kind: 'compare', columnId: 'col_value', op: 'lt', value: 100 }],
    });
  });

  it('removes nested groups that become empty', () => {
    const filter = {
      kind: 'any' as const,
      children: [
        {
          kind: 'all' as const,
          children: [
            { kind: 'compare' as const, columnId: 'col_gone', op: 'eq' as const, value: 'x' },
          ],
        },
        { kind: 'compare' as const, columnId: 'col_value', op: 'gt' as const, value: 0 },
      ],
    };

    expect(removeColumnFromFilter(filter, 'col_gone')).toEqual({
      kind: 'any',
      children: [{ kind: 'compare', columnId: 'col_value', op: 'gt', value: 0 }],
    });
  });

  it('returns undefined when the whole predicate disappears', () => {
    expect(
      removeColumnFromFilter(
        { kind: 'compare', columnId: 'col_gone', op: 'eq', value: 'x' },
        'col_gone',
      ),
    ).toBeUndefined();
  });
});

describe('removeColumnFromView', () => {
  it('cleans order, widths, hidden ids, sort and filter', () => {
    const view = makeView({
      filter: {
        kind: 'all',
        children: [
          { kind: 'compare', columnId: 'col_time', op: 'gt', value: 0 },
          { kind: 'compare', columnId: 'col_value', op: 'lt', value: 100 },
        ],
      },
    });

    const next = removeColumnFromView(view, 'col_time');
    expect(next.columnOrder).toEqual(['col_id', 'col_value']);
    expect(next.widths).toEqual({ col_value: 120 });
    expect(next.hiddenColumnIds).toEqual([]);
    expect(next.sort).toEqual([{ columnId: 'col_value', direction: 'desc' }]);
    expect(next.filter).toEqual({
      kind: 'all',
      children: [{ kind: 'compare', columnId: 'col_value', op: 'lt', value: 100 }],
    });
    // col_time was the second visible column and sat inside the frozen range.
    expect(next.frozenColumnCount).toBe(1);
  });

  it('drops the filter key entirely when it becomes empty', () => {
    const view = makeView({
      filter: { kind: 'compare', columnId: 'col_time', op: 'eq', value: 0 },
    });

    const next = removeColumnFromView(view, 'col_time');
    expect(next).not.toHaveProperty('filter');
  });

  it('does not change frozen count when the deleted column was not frozen', () => {
    const next = removeColumnFromView(makeView({ frozenColumnCount: 1 }), 'col_value');
    expect(next.frozenColumnCount).toBe(1);
  });
});

describe('insertColumnIntoView and reorderViewColumns', () => {
  it('inserts at a bounded position', () => {
    expect(insertColumnIntoView(makeView(), 'col_note', 1).columnOrder).toEqual([
      'col_id',
      'col_note',
      'col_time',
      'col_value',
    ]);
    expect(insertColumnIntoView(makeView(), 'col_note', 99).columnOrder).toEqual([
      'col_id',
      'col_time',
      'col_value',
      'col_note',
    ]);
  });

  it('replaces the order without touching other view state', () => {
    const view = makeView();
    const next = reorderViewColumns(view, ['col_value', 'col_time', 'col_id']);

    expect(next.columnOrder).toEqual(['col_value', 'col_time', 'col_id']);
    expect(next.widths).toEqual(view.widths);
    expect(next.hiddenColumnIds).toEqual(view.hiddenColumnIds);
    expect(next.frozenColumnCount).toBe(view.frozenColumnCount);
  });
});
