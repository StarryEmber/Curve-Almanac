import { describe, expect, it } from 'vitest';

import type { ConditionalRule, FilterPredicate, TableMeta } from '@curve/domain';

import {
  buildConditionalPredicate,
  conditionPredicateFromRule,
  createConditionalPredicateDraft,
  createConditionDraft,
  defaultConditionalOperator,
} from './condition-builder';

const table: TableMeta = {
  id: 'tbl_1',
  name: 'Readings',
  file: 'tables/tbl_1.jsonl',
  schemaVersion: 1,
  columns: [
    { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
    { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    { id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'x' },
    {
      id: 'col_status',
      key: 'status',
      label: 'Status',
      type: 'enum',
      role: 'none',
      enumOptions: [
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
      ],
    },
  ],
  primaryKey: 'col_id',
  rowCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('conditional predicate builder', () => {
  it('starts with the first column and a condition-safe operator', () => {
    const draft = createConditionalPredicateDraft(table);
    expect(draft.mode).toBe('all');
    expect(draft.groups).toHaveLength(1);
    expect(draft.groups[0]?.conditions).toHaveLength(1);
    expect(draft.groups[0]?.conditions[0]?.columnId).toBe('col_id');
    expect(defaultConditionalOperator(table.columns[0]!)).toBe('eq');
  });

  it('builds a numeric contains condition that the filter whitelist does not allow', () => {
    const draft = createConditionalPredicateDraft(table);
    const condition = createConditionDraft(table, 'col_value');
    condition.op = 'contains';
    condition.value = '12';
    draft.groups = [{ mode: 'all', conditions: [condition] }];

    const result = buildConditionalPredicate(table, draft);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.predicate).toEqual({
        kind: 'all',
        children: [{ kind: 'compare', columnId: 'col_value', op: 'contains', value: 12 }],
      });
    }
  });

  it('builds a two-level all/any predicate', () => {
    const open = createConditionDraft(table, 'col_status');
    open.op = 'eq';
    open.value = 'open';
    const value = createConditionDraft(table, 'col_value');
    value.op = 'gt';
    value.value = '30';

    const result = buildConditionalPredicate(table, {
      mode: 'any',
      groups: [
        { mode: 'all', conditions: [open, value] },
        { mode: 'all', conditions: [createConditionDraft(table, 'col_day')] },
      ],
    });
    // The date draft starts with an empty value, so this must fail.
    expect(result.ok).toBe(false);

    const valid = buildConditionalPredicate(table, {
      mode: 'any',
      groups: [
        { mode: 'all', conditions: [open, value] },
        {
          mode: 'all',
          conditions: [{ ...createConditionDraft(table, 'col_value'), op: 'isNull' }],
        },
      ],
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.predicate.kind).toBe('any');
      if (valid.predicate.kind === 'any') {
        expect(valid.predicate.children).toHaveLength(2);
      }
    }
  });

  it('reports unsupported operators and invalid values with a readable issue', () => {
    const condition = createConditionDraft(table, 'col_status');
    condition.op = 'gt';
    condition.value = 'open';
    const result = buildConditionalPredicate(table, {
      mode: 'all',
      groups: [{ mode: 'all', conditions: [condition] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.reason).toBe('unsupported-operator');
    }

    const value = createConditionDraft(table, 'col_value');
    value.op = 'gt';
    value.value = 'not-a-number';
    const invalid = buildConditionalPredicate(table, {
      mode: 'all',
      groups: [{ mode: 'all', conditions: [value] }],
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues[0]?.reason).toBe('invalid-type');
    }
  });

  it('round-trips a two-level rule predicate', () => {
    const when: FilterPredicate = {
      kind: 'any',
      children: [
        {
          kind: 'all',
          children: [
            { kind: 'compare', columnId: 'col_value', op: 'gt', value: 30 },
            { kind: 'compare', columnId: 'col_status', op: 'eq', value: 'open' },
          ],
        },
        {
          kind: 'all',
          children: [{ kind: 'compare', columnId: 'col_id', op: 'contains', value: 'a' }],
        },
      ],
    };
    const draft = conditionPredicateFromRule(when, table);
    expect(draft).not.toBeNull();
    if (draft === null) {
      return;
    }
    expect(draft.mode).toBe('any');
    expect(draft.groups).toHaveLength(2);
    const rebuilt = buildConditionalPredicate(table, draft);
    expect(rebuilt.ok).toBe(true);
    if (rebuilt.ok) {
      expect(rebuilt.predicate).toEqual(when);
    }
  });

  it('detects a predicate deeper than two levels and missing columns', () => {
    const deep: FilterPredicate = {
      kind: 'all',
      children: [
        {
          kind: 'any',
          children: [
            {
              kind: 'all',
              children: [{ kind: 'compare', columnId: 'col_value', op: 'gt', value: 1 }],
            },
          ],
        },
      ],
    };
    expect(conditionPredicateFromRule(deep, table)).toBeNull();

    const missing: ConditionalRule['when'] = {
      kind: 'all',
      children: [{ kind: 'compare', columnId: 'col_missing', op: 'eq', value: 'x' }],
    };
    expect(conditionPredicateFromRule(missing, table)).toBeNull();
  });

  it('does not mutate the source rule predicate while editing', () => {
    const rule: ConditionalRule = {
      id: 'rule_1',
      enabled: true,
      target: { kind: 'row' },
      when: { kind: 'compare', columnId: 'col_value', op: 'gt', value: 30 },
      style: { bold: true },
    };
    const draft = conditionPredicateFromRule(rule.when, table);
    expect(draft).not.toBeNull();
    if (draft === null) {
      return;
    }
    draft.groups[0]!.conditions[0]!.value = '99';
    expect(rule.when).toEqual({
      kind: 'compare',
      columnId: 'col_value',
      op: 'gt',
      value: 30,
    });
  });
});
