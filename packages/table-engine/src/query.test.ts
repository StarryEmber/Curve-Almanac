import { describe, expect, it } from 'vitest';

import type {
  ColumnDef,
  CompareOp,
  FilterPredicate,
  Row,
  SortSpec,
  TableMeta,
} from '@curve/domain';

import {
  DEFAULT_QUERY_LOCALE,
  allowedCompareOps,
  applyFilter,
  applySort,
  compareOpNeedsSecondValue,
  compareOpNeedsValue,
  createQueryContext,
  matchesFilterPredicate,
  queryRowIds,
  queryRowIdsWithContext,
  validateFilterPredicate,
  validateSortSpecs,
} from './query';

const columns: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'none' },
  { id: 'col_n', key: 'n', label: 'N', type: 'number', role: 'none' },
  { id: 'col_d', key: 'd', label: 'D', type: 'date', role: 'none' },
  { id: 'col_b', key: 'b', label: 'B', type: 'boolean', role: 'none' },
  {
    id: 'col_e',
    key: 'e',
    label: 'E',
    type: 'enum',
    role: 'none',
    enumOptions: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ],
  },
  { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'none' },
];

const table: TableMeta = {
  id: 'tbl_query',
  name: 'Query',
  file: 'tables/tbl_query.jsonl',
  schemaVersion: 1,
  columns,
  primaryKey: 'col_id',
  rowCount: 6,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function row(
  id: string,
  values: [string, string, number | null, number | null, boolean | null, string | null, string],
): Row {
  return { id, values };
}

const rows: Row[] = [
  row('row_1', ['row_1', 'Alpha', 10, 1_000, true, 'a', 'north']),
  row('row_2', ['row_2', 'beta', 20, 2_000, false, 'b', 'south']),
  row('row_3', ['row_3', 'Gamma', 30, 3_000, null, null, 'north']),
  row('row_4', ['row_4', 'delta', null, null, true, 'a', 'south']),
  row('row_5', ['row_5', 'epsilon', 10, 5_000, false, 'b', 'north']),
  row('row_6', ['row_6', 'Zeta', 40, 1_000, true, null, '']),
];

const compare = (
  columnId: string,
  op: CompareOp,
  value?: unknown,
  value2?: unknown,
): FilterPredicate => ({
  kind: 'compare',
  columnId,
  op,
  ...(value === undefined ? {} : { value: value as null | string | number | boolean }),
  ...(value2 === undefined ? {} : { value2: value2 as null | string | number | boolean }),
});

const ids = (result: readonly Row[]): string[] => result.map((entry) => entry.id);

describe('allowedCompareOps', () => {
  it('maps each column type to the confirmed operator whitelist', () => {
    expect([...allowedCompareOps(columns[0] as ColumnDef)]).toEqual([
      'eq',
      'neq',
      'contains',
      'startsWith',
      'endsWith',
      'isNull',
      'notNull',
    ]);
    expect([...allowedCompareOps(columns[2] as ColumnDef)]).toEqual([
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'between',
      'isNull',
      'notNull',
    ]);
    expect([...allowedCompareOps(columns[4] as ColumnDef)]).toEqual([
      'eq',
      'neq',
      'isNull',
      'notNull',
    ]);
    expect([...allowedCompareOps(columns[5] as ColumnDef)]).toEqual([
      'eq',
      'neq',
      'isNull',
      'notNull',
    ]);
  });

  it('reports operator arity', () => {
    expect(compareOpNeedsValue('eq')).toBe(true);
    expect(compareOpNeedsValue('isNull')).toBe(false);
    expect(compareOpNeedsValue('notNull')).toBe(false);
    expect(compareOpNeedsSecondValue('between')).toBe(true);
    expect(compareOpNeedsSecondValue('eq')).toBe(false);
  });
});

describe('validateFilterPredicate', () => {
  it('accepts a valid nested predicate', () => {
    const filter: FilterPredicate = {
      kind: 'all',
      children: [
        compare('col_n', 'gt', 10),
        {
          kind: 'any',
          children: [compare('col_name', 'contains', 'a'), compare('col_b', 'eq', true)],
        },
      ],
    };
    expect(validateFilterPredicate(table, filter)).toEqual([]);
  });

  it('rejects unknown columns', () => {
    const issues = validateFilterPredicate(table, compare('col_ghost', 'eq', 'x'));
    expect(issues[0]?.path).toBe('filter');
    expect(issues[0]?.message).toContain('unknown column');
  });

  it('rejects operators that do not apply to the column type', () => {
    const issues = validateFilterPredicate(table, compare('col_name', 'gt', 'x'));
    expect(issues[0]?.code).toBe('E_VALIDATION');
    expect(issues[0]?.message).toContain('not supported');
  });

  it('rejects missing and extra values', () => {
    expect(validateFilterPredicate(table, compare('col_n', 'gt'))[0]?.code).toBe('E_VALIDATION');
    expect(validateFilterPredicate(table, compare('col_n', 'isNull', 1))[0]?.code).toBe(
      'E_VALIDATION',
    );
    expect(validateFilterPredicate(table, compare('col_n', 'between', 1))[0]?.path).toBe(
      'filter.value2',
    );
    expect(validateFilterPredicate(table, compare('col_n', 'gt', 1, 2))[0]?.path).toBe(
      'filter.value2',
    );
  });

  it('rejects values of the wrong physical type', () => {
    expect(validateFilterPredicate(table, compare('col_n', 'eq', 'ten'))[0]?.code).toBe('E_TYPE');
    expect(validateFilterPredicate(table, compare('col_d', 'eq', 1.5))[0]?.code).toBe('E_TYPE');
    expect(validateFilterPredicate(table, compare('col_e', 'eq', 'c'))[0]?.code).toBe('E_ENUM');
    expect(validateFilterPredicate(table, compare('col_b', 'eq', 'true'))[0]?.code).toBe('E_TYPE');
  });

  it('rejects an empty text value because empty text is null', () => {
    const issues = validateFilterPredicate(table, compare('col_name', 'eq', ''));
    expect(issues[0]?.message).toContain('isNull');
  });

  it('enforces the group child limits and non-empty groups', () => {
    expect(validateFilterPredicate(table, { kind: 'all', children: [] })[0]?.code).toBe(
      'E_VALIDATION',
    );
    const tooMany: FilterPredicate = {
      kind: 'any',
      children: Array.from({ length: 21 }, () => compare('col_n', 'gt', 1)),
    };
    expect(validateFilterPredicate(table, tooMany)[0]?.code).toBe('E_RANGE');
  });
});

describe('validateSortSpecs', () => {
  it('accepts up to three known, unique columns', () => {
    const sort: SortSpec[] = [
      { columnId: 'col_n', direction: 'asc' },
      { columnId: 'col_d', direction: 'desc' },
      { columnId: 'col_id', direction: 'asc' },
    ];
    expect(validateSortSpecs(table, sort)).toEqual([]);
  });

  it('rejects too many levels, unknown columns and duplicates', () => {
    const four: SortSpec[] = [
      { columnId: 'col_n', direction: 'asc' },
      { columnId: 'col_d', direction: 'asc' },
      { columnId: 'col_id', direction: 'asc' },
      { columnId: 'col_name', direction: 'asc' },
    ];
    expect(validateSortSpecs(table, four)[0]?.code).toBe('E_RANGE');
    expect(validateSortSpecs(table, [{ columnId: 'col_ghost', direction: 'asc' }])[0]?.code).toBe(
      'E_VALIDATION',
    );
    expect(
      validateSortSpecs(table, [
        { columnId: 'col_n', direction: 'asc' },
        { columnId: 'col_n', direction: 'desc' },
      ])[0]?.code,
    ).toBe('E_DUPLICATE_KEY');
  });
});

describe('filter operators', () => {
  it('matches text case-insensitively', () => {
    expect(ids(applyFilter(rows, table, compare('col_name', 'eq', 'ALPHA')))).toEqual(['row_1']);
    expect(ids(applyFilter(rows, table, compare('col_name', 'neq', 'alpha')))).toEqual([
      'row_2',
      'row_3',
      'row_4',
      'row_5',
      'row_6',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_name', 'contains', 'TA')))).toEqual([
      'row_2',
      'row_4',
      'row_6',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_name', 'startsWith', 'a')))).toEqual([
      'row_1',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_name', 'endsWith', 'a')))).toEqual([
      'row_1',
      'row_2',
      'row_3',
      'row_4',
      'row_6',
    ]);
  });

  it('treats null and empty text as null and never matches value operators', () => {
    expect(ids(applyFilter(rows, table, compare('col_site', 'isNull')))).toEqual(['row_6']);
    expect(ids(applyFilter(rows, table, compare('col_site', 'notNull')))).toEqual([
      'row_1',
      'row_2',
      'row_3',
      'row_4',
      'row_5',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_site', 'eq', 'north')))).toEqual([
      'row_1',
      'row_3',
      'row_5',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_site', 'neq', 'north')))).toEqual([
      'row_2',
      'row_4',
    ]);
  });

  it('compares numbers and dates numerically including between bounds', () => {
    expect(ids(applyFilter(rows, table, compare('col_n', 'gt', 20)))).toEqual(['row_3', 'row_6']);
    expect(ids(applyFilter(rows, table, compare('col_n', 'gte', 20)))).toEqual([
      'row_2',
      'row_3',
      'row_6',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_n', 'lt', 20)))).toEqual(['row_1', 'row_5']);
    expect(ids(applyFilter(rows, table, compare('col_n', 'lte', 20)))).toEqual([
      'row_1',
      'row_2',
      'row_5',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_n', 'between', 10, 20)))).toEqual([
      'row_1',
      'row_2',
      'row_5',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_n', 'between', 20, 10)))).toEqual([
      'row_1',
      'row_2',
      'row_5',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_d', 'gte', 3_000)))).toEqual([
      'row_3',
      'row_5',
    ]);
  });

  it('excludes null from number operators', () => {
    expect(ids(applyFilter(rows, table, compare('col_n', 'gt', 0)))).toEqual([
      'row_1',
      'row_2',
      'row_3',
      'row_5',
      'row_6',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_n', 'isNull')))).toEqual(['row_4']);
    expect(ids(applyFilter(rows, table, compare('col_n', 'notNull')))).toEqual([
      'row_1',
      'row_2',
      'row_3',
      'row_5',
      'row_6',
    ]);
  });

  it('supports boolean and enum equality', () => {
    expect(ids(applyFilter(rows, table, compare('col_b', 'eq', true)))).toEqual([
      'row_1',
      'row_4',
      'row_6',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_b', 'neq', true)))).toEqual([
      'row_2',
      'row_5',
    ]);
    expect(ids(applyFilter(rows, table, compare('col_e', 'eq', 'a')))).toEqual(['row_1', 'row_4']);
    expect(ids(applyFilter(rows, table, compare('col_e', 'isNull')))).toEqual(['row_3', 'row_6']);
  });

  it('supports all/any combinations', () => {
    const filter: FilterPredicate = {
      kind: 'all',
      children: [
        compare('col_site', 'eq', 'north'),
        {
          kind: 'any',
          children: [compare('col_n', 'gt', 20), compare('col_b', 'eq', true)],
        },
      ],
    };
    expect(ids(applyFilter(rows, table, filter))).toEqual(['row_1', 'row_3']);
  });
});

describe('sorting', () => {
  it('sorts numbers and keeps nulls last in both directions', () => {
    expect(ids(applySort(rows, table, [{ columnId: 'col_n', direction: 'asc' }]))).toEqual([
      'row_1',
      'row_5',
      'row_2',
      'row_3',
      'row_6',
      'row_4',
    ]);
    expect(ids(applySort(rows, table, [{ columnId: 'col_n', direction: 'desc' }]))).toEqual([
      'row_6',
      'row_3',
      'row_2',
      'row_1',
      'row_5',
      'row_4',
    ]);
  });

  it('sorts text with a numeric-aware collator', () => {
    const customRows: Row[] = [
      row('row_1', ['row_1', 'item10', 1, 1, true, 'a', 'north']),
      row('row_2', ['row_2', 'item2', 2, 2, true, 'a', 'north']),
      row('row_3', ['row_3', 'Item1', 3, 3, true, 'a', 'north']),
      row('row_4', ['row_4', 'item1', 4, 4, true, 'a', 'north']),
    ];
    const sorted = ids(applySort(customRows, table, [{ columnId: 'col_name', direction: 'asc' }]));
    expect(new Set(sorted.slice(0, 2))).toEqual(new Set(['row_3', 'row_4']));
    expect(sorted.slice(2)).toEqual(['row_2', 'row_1']);
  });

  it('matches numeric collation for natural keys and unsafe fallbacks', () => {
    const cases: string[][] = [
      ['item10', 'item2', 'item3', 'item20', 'a1', 'a10', 'a2'],
      ['-2', '-10', '1', '0'],
      ['北京', '上海', '广州', '深圳'],
    ];
    for (const values of cases) {
      const customRows: Row[] = values.map((value, index) =>
        row(`row_${String(index + 1)}`, [
          `row_${String(index + 1)}`,
          value,
          index,
          index,
          true,
          'a',
          'north',
        ]),
      );
      const expected = [...customRows]
        .sort((left, right) =>
          new Intl.Collator('en-US', { numeric: true, sensitivity: 'variant' }).compare(
            String(left.values[1]),
            String(right.values[1]),
          ),
        )
        .map((entry) => entry.id);
      expect(
        ids(applySort(customRows, table, [{ columnId: 'col_name', direction: 'asc' }])),
      ).toEqual(expected);
    }
  });

  it('sorts dates, booleans and enum labels', () => {
    expect(ids(applySort(rows, table, [{ columnId: 'col_d', direction: 'asc' }]))).toEqual([
      'row_1',
      'row_6',
      'row_2',
      'row_3',
      'row_5',
      'row_4',
    ]);
    expect(ids(applySort(rows, table, [{ columnId: 'col_b', direction: 'asc' }]))).toEqual([
      'row_2',
      'row_5',
      'row_1',
      'row_4',
      'row_6',
      'row_3',
    ]);
    expect(ids(applySort(rows, table, [{ columnId: 'col_e', direction: 'asc' }]))).toEqual([
      'row_1',
      'row_4',
      'row_2',
      'row_5',
      'row_3',
      'row_6',
    ]);
  });

  it('applies three levels and keeps ties stable', () => {
    const sort: SortSpec[] = [
      { columnId: 'col_n', direction: 'asc' },
      { columnId: 'col_site', direction: 'desc' },
      { columnId: 'col_name', direction: 'asc' },
    ];
    expect(ids(applySort(rows, table, sort))).toEqual([
      'row_1',
      'row_5',
      'row_2',
      'row_3',
      'row_6',
      'row_4',
    ]);
  });

  it('falls through equal values to the next sort level', () => {
    const sorted = applySort(rows, table, [
      { columnId: 'col_n', direction: 'asc' },
      { columnId: 'col_name', direction: 'desc' },
    ]);
    expect(ids(sorted)).toEqual(['row_5', 'row_1', 'row_2', 'row_3', 'row_6', 'row_4']);
  });
});

describe('queryRowIds', () => {
  it('filters then sorts and returns display ids', () => {
    const result = queryRowIds(rows, table, {
      filter: compare('col_site', 'eq', 'north'),
      sort: [{ columnId: 'col_n', direction: 'desc' }],
    });
    expect(result).toEqual({ rowIds: ['row_3', 'row_1', 'row_5'], visibleRows: 3 });
  });

  it('returns the physical order when there is no filter or sort', () => {
    expect(queryRowIds(rows, table, { sort: [] }).rowIds).toEqual(rows.map((entry) => entry.id));
  });

  it('rejects an invalid query before touching rows', () => {
    expect(() =>
      queryRowIds(rows, table, { sort: [{ columnId: 'col_ghost', direction: 'asc' }] }),
    ).toThrow(/unknown column/);
  });

  it('supports an explicit locale and a pre-built context', () => {
    const context = createQueryContext(table, { locale: 'zh-CN' });
    const result = queryRowIdsWithContext(rows, context, {
      filter: compare('col_name', 'contains', 'ALPHA'),
    });
    expect(result.rowIds).toEqual(['row_1']);
  });

  it('evaluates a single row for the paste stale-filter guard', () => {
    const context = createQueryContext(table);
    const first = rows[0] as Row;
    expect(matchesFilterPredicate(first, context, compare('col_site', 'eq', 'north'))).toBe(true);
    expect(matchesFilterPredicate(first, context, compare('col_site', 'eq', 'south'))).toBe(false);
  });

  it('uses the default locale when none is supplied', () => {
    expect(DEFAULT_QUERY_LOCALE).toBe('en-US');
    expect(queryRowIds(rows, table, { filter: compare('col_name', 'eq', 'BETA') }).rowIds).toEqual([
      'row_2',
    ]);
  });
});
