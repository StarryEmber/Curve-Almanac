import { describe, expect, it } from 'vitest';

import type { FilterPredicate, ViewDef } from '@curve/domain';

import { createDuplicateTableView, duplicateViewTitle } from './view-copy';

const source: ViewDef = {
  id: 'viw_source',
  kind: 'table',
  refId: 'tbl_source',
  title: 'Sensors',
  tableView: {
    tableId: 'tbl_source',
    styleId: 'builtin.report-light',
    columnOrder: ['col_a', 'col_b'],
    widths: { col_a: 120 },
    hiddenColumnIds: ['col_b'],
    sort: [{ columnId: 'col_a', direction: 'desc' }],
    filter: {
      kind: 'all',
      children: [{ kind: 'compare', columnId: 'col_a', op: 'gt', value: 10 }],
    },
    frozenColumnCount: 1,
  },
};

describe('duplicateViewTitle', () => {
  it('uses a stable suffix and skips existing titles', () => {
    expect(duplicateViewTitle('Sensors', [])).toBe('Sensors (2)');
    expect(duplicateViewTitle('Sensors', ['Sensors (2)'])).toBe('Sensors (3)');
    expect(duplicateViewTitle('Sensors (2)', ['Sensors (2)'])).toBe('Sensors (3)');
    expect(duplicateViewTitle('  ', [])).toBe('View (2)');
  });
});

describe('createDuplicateTableView', () => {
  it('copies the table view state without sharing mutable arrays', () => {
    const copy = createDuplicateTableView({
      source,
      existingTitles: ['Sensors'],
      uuid: () => 'copy',
    });
    expect(copy.id).toBe('viw_copy');
    expect(copy.title).toBe('Sensors (2)');
    expect(copy.tableView).toEqual(source.tableView);
    expect(copy.tableView).not.toBe(source.tableView);
    expect(copy.tableView?.columnOrder).not.toBe(source.tableView?.columnOrder);
    expect(copy.tableView?.widths).not.toBe(source.tableView?.widths);
    expect(copy.tableView?.sort).not.toBe(source.tableView?.sort);
    expect(copy.tableView?.filter).not.toBe(source.tableView?.filter);
    const original = source.tableView?.filter as FilterPredicate;
    const copied = copy.tableView?.filter as FilterPredicate;
    expect(copied).toEqual(original);
    copy.tableView?.columnOrder.push('col_c');
    if (copy.tableView?.widths !== undefined) {
      copy.tableView.widths.col_a = 200;
    }
    if (copy.tableView?.sort !== undefined) {
      copy.tableView.sort[0] = { columnId: 'col_b', direction: 'asc' };
    }
    expect(source.tableView?.columnOrder).toEqual(['col_a', 'col_b']);
    expect(source.tableView?.widths).toEqual({ col_a: 120 });
    expect(source.tableView?.sort).toEqual([{ columnId: 'col_a', direction: 'desc' }]);
  });

  it('rejects chart views and missing tableView state', () => {
    expect(() =>
      createDuplicateTableView({
        source: { id: 'viw_chart', kind: 'chart', refId: 'cht_chart', title: 'Chart' },
        existingTitles: [],
      }),
    ).toThrow(/Only table views/);
    expect(() =>
      createDuplicateTableView({
        source: { id: 'viw_bad', kind: 'table', refId: 'tbl_source', title: 'Bad' },
        existingTitles: [],
      }),
    ).toThrow(/Only table views/);
  });
});
