import { describe, expect, it } from 'vitest';

import type { ColumnDef, TableMeta, TableViewState } from '@curve/domain';

import { assertValidTableView, validateTableViewState } from './view-state';

const columns: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_n', key: 'n', label: 'N', type: 'number', role: 'none' },
  { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'none' },
];

const table: TableMeta = {
  id: 'tbl_view',
  name: 'View',
  file: 'tables/tbl_view.jsonl',
  schemaVersion: 1,
  columns,
  primaryKey: 'col_id',
  rowCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function view(overrides: Partial<TableViewState> = {}): TableViewState {
  return {
    tableId: table.id,
    styleId: 'builtin.report-light',
    columnOrder: columns.map((column) => column.id),
    widths: {},
    hiddenColumnIds: [],
    sort: [],
    frozenColumnCount: 0,
    ...overrides,
  };
}

describe('validateTableViewState', () => {
  it('accepts a valid view with a filter, sort, width and hidden column', () => {
    const state = view({
      hiddenColumnIds: ['col_name'],
      widths: { col_n: 120 },
      sort: [{ columnId: 'col_n', direction: 'desc' }],
      filter: { kind: 'compare', columnId: 'col_id', op: 'contains', value: 'a' },
    });
    expect(validateTableViewState(table, state)).toEqual([]);
  });

  it('rejects invalid sort levels', () => {
    const issues = validateTableViewState(
      table,
      view({
        sort: [
          { columnId: 'col_n', direction: 'asc' },
          { columnId: 'col_n', direction: 'desc' },
        ],
      }),
    );
    expect(issues[0]?.code).toBe('E_DUPLICATE_KEY');

    const four = validateTableViewState(
      table,
      view({
        sort: ['col_n', 'col_name', 'col_id', 'col_name'].map((columnId) => ({
          columnId,
          direction: 'asc' as const,
        })),
      }),
    );
    expect(four.some((issue) => issue.code === 'E_RANGE')).toBe(true);
  });

  it('rejects invalid filters through the query engine rules', () => {
    expect(
      validateTableViewState(
        table,
        view({ filter: { kind: 'compare', columnId: 'col_ghost', op: 'eq', value: 'x' } }),
      )[0]?.code,
    ).toBe('E_VALIDATION');
    expect(
      validateTableViewState(
        table,
        view({ filter: { kind: 'compare', columnId: 'col_name', op: 'gt', value: 'x' } }),
      )[0]?.message,
    ).toContain('not supported');
  });

  it('rejects hidden/width references outside columnOrder', () => {
    expect(validateTableViewState(table, view({ hiddenColumnIds: ['col_ghost'] }))[0]?.code).toBe(
      'E_VALIDATION',
    );
    expect(
      validateTableViewState(table, view({ hiddenColumnIds: ['col_n', 'col_n'] }))[0]?.code,
    ).toBe('E_DUPLICATE_KEY');
    expect(validateTableViewState(table, view({ widths: { col_ghost: 100 } }))[0]?.code).toBe(
      'E_VALIDATION',
    );
    expect(validateTableViewState(table, view({ frozenColumnCount: 4 }))[0]?.code).toBe('E_RANGE');
  });

  it('throws a structured E_VALIDATION error', () => {
    expect(() =>
      assertValidTableView(table, view({ filter: { kind: 'all', children: [] } })),
    ).toThrow(/at least one child/);
  });
});
