import { describe, expect, it } from 'vitest';

import type { ColumnDef, FilterPredicate, TableMeta } from '@curve/domain';

import {
  buildFilterPredicate,
  createEmptyFilterDraft,
  dateFilterInputValue,
  filterDraftFromPredicate,
} from './filter-builder';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

const COLUMNS: ColumnDef[] = [
  column({ id: 'col_id', key: 'id', type: 'text', required: true }),
  column({ id: 'col_name', key: 'name', type: 'text' }),
  column({ id: 'col_n', key: 'n', type: 'number' }),
  column({ id: 'col_d', key: 'd', type: 'date' }),
  column({ id: 'col_b', key: 'b', type: 'boolean' }),
  column({
    id: 'col_e',
    key: 'e',
    type: 'enum',
    enumOptions: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ],
  }),
];

const TABLE: TableMeta = {
  id: 'tbl_filter',
  name: 'Filter',
  file: 'tables/tbl_filter.jsonl',
  schemaVersion: 1,
  columns: COLUMNS,
  primaryKey: 'col_id',
  rowCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('filter-builder', () => {
  it('starts with the first column and its first operator', () => {
    expect(createEmptyFilterDraft(TABLE)).toEqual({
      mode: 'all',
      conditions: [{ columnId: 'col_id', op: 'eq', value: '' }],
    });
  });

  it('clears the filter when there are no conditions', () => {
    expect(buildFilterPredicate(TABLE, { mode: 'any', conditions: [] })).toEqual({ ok: true });
  });

  it('builds typed values with the shared coercion rules', () => {
    const result = buildFilterPredicate(TABLE, {
      mode: 'any',
      conditions: [
        { columnId: 'col_name', op: 'contains', value: ' Alpha ' },
        { columnId: 'col_n', op: 'between', value: '1,000', value2: '2000' },
        { columnId: 'col_d', op: 'gte', value: '2026-02-03' },
        { columnId: 'col_b', op: 'eq', value: 'true' },
        { columnId: 'col_e', op: 'eq', value: 'b' },
        { columnId: 'col_n', op: 'isNull', value: 'ignored' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.filter === undefined || result.filter.kind === 'compare') {
      return;
    }
    expect(result.filter.kind).toBe('any');
    const children = result.filter.children;
    expect(children).toHaveLength(6);
    expect(children[0]).toEqual({
      kind: 'compare',
      columnId: 'col_name',
      op: 'contains',
      value: ' Alpha ',
    });
    expect(children[1]).toMatchObject({ op: 'between', value: 1000, value2: 2000 });
    expect(children[2]).toMatchObject({ op: 'gte', value: new Date(2026, 1, 3).getTime() });
    expect(children[3]).toEqual({ kind: 'compare', columnId: 'col_b', op: 'eq', value: true });
    expect(children[4]).toEqual({ kind: 'compare', columnId: 'col_e', op: 'eq', value: 'b' });
    expect(children[5]).toEqual({ kind: 'compare', columnId: 'col_n', op: 'isNull' });
  });

  it('reports missing and invalid values without building a partial filter', () => {
    const missing = buildFilterPredicate(TABLE, {
      mode: 'all',
      conditions: [
        { columnId: 'col_n', op: 'gt', value: '' },
        { columnId: 'col_n', op: 'between', value: '1', value2: '' },
      ],
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.issues.map((issue) => issue.reason)).toEqual(['missing-value', 'missing-value']);

    const invalid = buildFilterPredicate(TABLE, {
      mode: 'all',
      conditions: [
        { columnId: 'col_n', op: 'gt', value: 'ten' },
        { columnId: 'col_e', op: 'eq', value: 'c' },
      ],
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) {
      return;
    }
    expect(invalid.issues.map((issue) => issue.reason)).toEqual(['invalid-type', 'invalid-enum']);
  });

  it('rejects unknown columns, unsupported operators and more than 20 conditions', () => {
    const unknown = buildFilterPredicate(TABLE, {
      mode: 'all',
      conditions: [{ columnId: 'col_ghost', op: 'eq', value: 'x' }],
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.issues[0]?.reason).toBe('missing-column');
    }

    const unsupported = buildFilterPredicate(TABLE, {
      mode: 'all',
      conditions: [{ columnId: 'col_name', op: 'gt', value: 'x' }],
    });
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) {
      expect(unsupported.issues[0]?.reason).toBe('unsupported-operator');
    }

    const tooMany = buildFilterPredicate(TABLE, {
      mode: 'all',
      conditions: Array.from({ length: 21 }, () => ({
        columnId: 'col_n',
        op: 'gt' as const,
        value: '1',
      })),
    });
    expect(tooMany).toEqual({
      ok: false,
      issues: [
        {
          index: -1,
          field: 'group',
          reason: 'limit',
          message: 'a filter may contain at most 20 conditions',
        },
      ],
    });
  });

  it('round-trips a flat predicate into a draft', () => {
    const filter: FilterPredicate = {
      kind: 'any',
      children: [
        { kind: 'compare', columnId: 'col_name', op: 'contains', value: 'x' },
        { kind: 'compare', columnId: 'col_n', op: 'between', value: 1, value2: 2 },
        { kind: 'compare', columnId: 'col_d', op: 'gte', value: new Date(2026, 1, 3).getTime() },
        { kind: 'compare', columnId: 'col_b', op: 'eq', value: false },
        { kind: 'compare', columnId: 'col_e', op: 'eq', value: 'a' },
        { kind: 'compare', columnId: 'col_n', op: 'isNull' },
      ],
    };
    expect(filterDraftFromPredicate(TABLE, filter)).toEqual({
      mode: 'any',
      conditions: [
        { columnId: 'col_name', op: 'contains', value: 'x' },
        { columnId: 'col_n', op: 'between', value: '1', value2: '2' },
        { columnId: 'col_d', op: 'gte', value: '2026-02-03' },
        { columnId: 'col_b', op: 'eq', value: 'false' },
        { columnId: 'col_e', op: 'eq', value: 'a' },
        { columnId: 'col_n', op: 'isNull', value: '' },
      ],
    });
  });

  it('returns null for nested filters instead of flattening them', () => {
    const nested: FilterPredicate = {
      kind: 'all',
      children: [
        {
          kind: 'any',
          children: [{ kind: 'compare', columnId: 'col_n', op: 'gt', value: 1 }],
        },
      ],
    };
    expect(filterDraftFromPredicate(TABLE, nested)).toBeNull();
    expect(
      filterDraftFromPredicate(TABLE, { kind: 'compare', columnId: 'col_n', op: 'eq', value: 1 }),
    ).toMatchObject({ mode: 'all', conditions: [{ columnId: 'col_n', op: 'eq', value: '1' }] });
  });

  it('formats date filter inputs from local midnight', () => {
    expect(dateFilterInputValue(new Date(2026, 1, 3).getTime())).toBe('2026-02-03');
  });
});
