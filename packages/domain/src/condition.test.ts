import { describe, expect, it } from 'vitest';

import { createConditionalFormat, evaluateRules } from './condition';

import type { Cell, ColumnDef, CompareOp, ConditionalRule, FilterPredicate, Row } from './types';

const DAY = Date.UTC(2026, 0, 15, 12);

const COLUMNS: ColumnDef[] = [
  { id: 'col_text', key: 'text', label: 'Text', type: 'text', role: 'none' },
  { id: 'col_num', key: 'num', label: 'Num', type: 'number', role: 'y' },
  { id: 'col_date', key: 'date', label: 'Date', type: 'date', role: 'x' },
  { id: 'col_bool', key: 'bool', label: 'Bool', type: 'boolean', role: 'none' },
  {
    id: 'col_enum',
    key: 'enum',
    label: 'Enum',
    type: 'enum',
    role: 'none',
    enumOptions: [
      { value: 'open', label: 'Open' },
      { value: 'closed', label: 'Closed' },
    ],
  },
];

const ROW: Row = { id: 'row_1', values: ['Alpha', 42, DAY, true, 'open'] };
const NULL_ROW: Row = { id: 'row_2', values: ['', null, null, false, null] };

function compare(columnId: string, op: CompareOp, value?: Cell, value2?: Cell): FilterPredicate {
  return {
    kind: 'compare',
    columnId,
    op,
    ...(value === undefined ? {} : { value }),
    ...(value2 === undefined ? {} : { value2 }),
  };
}

function makeRule(
  id: string,
  when: FilterPredicate,
  target: ConditionalRule['target'] = { kind: 'row' },
  enabled = true,
): ConditionalRule {
  return { id, enabled, target, when, style: { background: '#fde2e2' } };
}

function matches(
  when: FilterPredicate,
  row: Row = ROW,
  target?: ConditionalRule['target'],
): boolean {
  return evaluateRules([makeRule('rule_test', when, target)], row, COLUMNS) !== null;
}

describe('conditional rules: comparison operators', () => {
  const cases: Array<[string, FilterPredicate, boolean]> = [
    ['text eq is case-insensitive', compare('col_text', 'eq', 'ALPHA'), true],
    ['text eq false', compare('col_text', 'eq', 'Beta'), false],
    ['text neq', compare('col_text', 'neq', 'Beta'), true],
    ['text neq false', compare('col_text', 'neq', 'alpha'), false],
    ['text contains', compare('col_text', 'contains', 'LP'), true],
    ['text contains false', compare('col_text', 'contains', 'zz'), false],
    ['text startsWith', compare('col_text', 'startsWith', 'al'), true],
    ['text startsWith false', compare('col_text', 'startsWith', 'ha'), false],
    ['text endsWith', compare('col_text', 'endsWith', 'ha'), true],
    ['text endsWith false', compare('col_text', 'endsWith', 'al'), false],
    ['text isNull false', compare('col_text', 'isNull'), false],
    ['text notNull', compare('col_text', 'notNull'), true],

    ['number eq', compare('col_num', 'eq', 42), true],
    ['number eq false', compare('col_num', 'eq', 41), false],
    ['number neq', compare('col_num', 'neq', 41), true],
    ['number neq false', compare('col_num', 'neq', 42), false],
    ['number gt', compare('col_num', 'gt', 41), true],
    ['number gt false', compare('col_num', 'gt', 42), false],
    ['number gte', compare('col_num', 'gte', 42), true],
    ['number gte false', compare('col_num', 'gte', 43), false],
    ['number lt', compare('col_num', 'lt', 43), true],
    ['number lt false', compare('col_num', 'lt', 42), false],
    ['number lte', compare('col_num', 'lte', 42), true],
    ['number lte false', compare('col_num', 'lte', 41), false],
    ['number between inclusive', compare('col_num', 'between', 42, 42), true],
    ['number between lower bound', compare('col_num', 'between', 42, 50), true],
    ['number between upper bound', compare('col_num', 'between', 1, 42), true],
    ['number between swapped bounds', compare('col_num', 'between', 50, 42), true],
    ['number between false', compare('col_num', 'between', 43, 50), false],
    ['number contains stringified', compare('col_num', 'contains', '4'), true],
    ['number contains false', compare('col_num', 'contains', '7'), false],
    ['number isNull false', compare('col_num', 'isNull'), false],
    ['number notNull', compare('col_num', 'notNull'), true],

    ['date eq', compare('col_date', 'eq', DAY), true],
    ['date eq false', compare('col_date', 'eq', DAY + 1), false],
    ['date neq', compare('col_date', 'neq', DAY + 1), true],
    ['date gt', compare('col_date', 'gt', DAY - 1), true],
    ['date gt false', compare('col_date', 'gt', DAY), false],
    ['date gte', compare('col_date', 'gte', DAY), true],
    ['date lt', compare('col_date', 'lt', DAY + 1), true],
    ['date lte', compare('col_date', 'lte', DAY), true],
    ['date between inclusive', compare('col_date', 'between', DAY, DAY), true],
    ['date between swapped', compare('col_date', 'between', DAY + 1, DAY), true],
    ['date contains stringified', compare('col_date', 'contains', String(DAY).slice(-3)), true],
    ['date isNull false', compare('col_date', 'isNull'), false],

    ['boolean eq', compare('col_bool', 'eq', true), true],
    ['boolean eq false', compare('col_bool', 'eq', false), false],
    ['boolean neq', compare('col_bool', 'neq', false), true],
    ['boolean isNull false', compare('col_bool', 'isNull'), false],
    ['boolean notNull', compare('col_bool', 'notNull'), true],
    ['boolean contains unsupported', compare('col_bool', 'contains', 'ru'), false],

    ['enum eq', compare('col_enum', 'eq', 'open'), true],
    ['enum eq false', compare('col_enum', 'eq', 'closed'), false],
    ['enum neq', compare('col_enum', 'neq', 'closed'), true],
    ['enum isNull false', compare('col_enum', 'isNull'), false],
    ['enum contains unsupported', compare('col_enum', 'contains', 'pe'), false],
  ];

  for (const [name, predicate, expected] of cases) {
    it(name, () => {
      expect(matches(predicate)).toBe(expected);
    });
  }

  it('treats null and empty text as null without throwing', () => {
    expect(matches(compare('col_text', 'isNull'), NULL_ROW)).toBe(true);
    expect(matches(compare('col_text', 'notNull'), NULL_ROW)).toBe(false);
    expect(matches(compare('col_text', 'eq', 'alpha'), NULL_ROW)).toBe(false);
    expect(matches(compare('col_num', 'isNull'), NULL_ROW)).toBe(true);
    expect(matches(compare('col_num', 'notNull'), NULL_ROW)).toBe(false);
    expect(matches(compare('col_num', 'between', 0, 10), NULL_ROW)).toBe(false);
    expect(matches(compare('col_enum', 'isNull'), NULL_ROW)).toBe(true);
    expect(matches(compare('col_enum', 'eq', 'open'), NULL_ROW)).toBe(false);
  });

  it('does not throw on type mismatches', () => {
    expect(matches(compare('col_num', 'eq', '42'))).toBe(false);
    expect(matches(compare('col_num', 'gt', '10'))).toBe(false);
    expect(matches(compare('col_num', 'between', 1, '9'))).toBe(false);
    expect(matches(compare('col_bool', 'eq', 'true'))).toBe(false);
    expect(matches(compare('col_enum', 'eq', 1))).toBe(false);
    expect(matches(compare('col_text', 'contains', null))).toBe(false);
    expect(matches(compare('col_num', 'contains', null))).toBe(false);
  });
});

describe('conditional rules: ordering, targets and missing columns', () => {
  it('returns the first matching rule in array order', () => {
    const first = makeRule('rule_first', compare('col_num', 'gt', 10));
    const second = makeRule('rule_second', compare('col_num', 'gt', 20));
    expect(evaluateRules([first, second], ROW, COLUMNS)?.rule.id).toBe('rule_first');
  });

  it('skips disabled rules', () => {
    const disabled = makeRule('rule_disabled', compare('col_num', 'gt', 0), undefined, false);
    const enabled = makeRule('rule_enabled', compare('col_num', 'gt', 40));
    expect(evaluateRules([disabled, enabled], ROW, COLUMNS)?.rule.id).toBe('rule_enabled');
  });

  it('applies a cell rule only to its column while a row rule covers the rest', () => {
    const cellRule = makeRule('rule_cell', compare('col_num', 'gt', 10), {
      kind: 'cell',
      columnId: 'col_num',
    });
    const rowRule = makeRule('rule_row', compare('col_num', 'gt', 0));
    const evaluated = createConditionalFormat([cellRule, rowRule], COLUMNS).evaluateRow(ROW);

    expect(evaluated.rowRule?.rule.id).toBe('rule_row');
    expect(evaluated.cellRule('col_num')?.rule.id).toBe('rule_cell');
    expect(evaluated.cellRule('col_text')?.rule.id).toBe('rule_row');
  });

  it('lets an earlier row rule win over a later cell rule', () => {
    const rowRule = makeRule('rule_row', compare('col_num', 'gt', 0));
    const cellRule = makeRule('rule_cell', compare('col_num', 'gt', 10), {
      kind: 'cell',
      columnId: 'col_num',
    });
    const evaluated = createConditionalFormat([rowRule, cellRule], COLUMNS).evaluateRow(ROW);

    expect(evaluated.cellRule('col_num')?.rule.id).toBe('rule_row');
  });

  it('ignores predicates that reference missing columns', () => {
    expect(matches(compare('col_missing', 'eq', 'x'))).toBe(false);

    const any: FilterPredicate = {
      kind: 'any',
      children: [compare('col_missing', 'eq', 'x'), compare('col_num', 'gt', 40)],
    };
    expect(matches(any)).toBe(true);

    const all: FilterPredicate = {
      kind: 'all',
      children: [compare('col_missing', 'eq', 'x'), compare('col_num', 'gt', 40)],
    };
    expect(matches(all)).toBe(true);

    const allMissing: FilterPredicate = {
      kind: 'all',
      children: [compare('col_missing', 'eq', 'x')],
    };
    expect(matches(allMissing)).toBe(false);
  });

  it('ignores a cell rule whose target column is missing', () => {
    const missingTarget = makeRule('rule_missing_target', compare('col_num', 'gt', 0), {
      kind: 'cell',
      columnId: 'col_missing',
    });
    const rowRule = makeRule('rule_row', compare('col_num', 'gt', 0));
    const evaluated = createConditionalFormat([missingTarget, rowRule], COLUMNS).evaluateRow(ROW);

    expect(evaluated.cellRule('col_num')?.rule.id).toBe('rule_row');
  });

  it('returns null for an empty rule set', () => {
    expect(evaluateRules([], ROW, COLUMNS)).toBeNull();
    expect(createConditionalFormat([], COLUMNS).evaluateRow(ROW).cellRule('col_num')).toBeNull();
  });
});

describe('conditional rules: performance', () => {
  it('evaluates 50 rules over 100 rows within the 16ms budget', () => {
    const rules = Array.from({ length: 50 }, (_, index) =>
      makeRule(`rule_${String(index)}`, compare('col_num', index % 2 === 0 ? 'gte' : 'lt', index)),
    );
    const format = createConditionalFormat(rules, COLUMNS);

    const run = (): void => {
      for (let index = 0; index < 100; index += 1) {
        const evaluated = format.evaluateRow(ROW);
        if (evaluated.rowRule === null) {
          throw new Error('the benchmark rule set never matched');
        }
      }
    };

    run();
    const samples = [0, 1, 2].map(() => {
      const started = Date.now();
      run();
      return Date.now() - started;
    });

    expect(Math.min(...samples)).toBeLessThanOrEqual(16);
  });
});
