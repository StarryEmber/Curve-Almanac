import { describe, expect, it } from 'vitest';

import {
  planColumnAdd,
  planColumnDelete,
  planColumnReorder,
  planColumnUpdate,
  planPrimaryKeyChange,
} from './column-ops';

import type { ColumnChangePlan } from './column-ops';
import type { ColumnDef, Row, TableMeta } from './types';

const TIMESTAMP = '2026-10-20T05:00:00.000Z';

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Readings',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
      { id: 'col_time', key: 'time', label: 'Time', type: 'date', role: 'x' },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    ],
    primaryKey: 'col_id',
    rowCount: 2,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function makeRows(): Row[] {
  return [
    { id: 'row_1', values: ['a', 1_735_689_600_000, 21.5] },
    { id: 'row_2', values: ['b', 1_735_689_660_000, 23.1] },
  ];
}

function unwrap(plan: ColumnChangePlan): Extract<ColumnChangePlan, { ok: true }> {
  if (!plan.ok) {
    throw new Error(`expected an ok plan, got ${plan.error.code}: ${plan.error.message}`);
  }
  return plan;
}

function failure(plan: ColumnChangePlan): Extract<ColumnChangePlan, { ok: false }> {
  if (plan.ok) {
    throw new Error('expected a failed plan');
  }
  return plan;
}

function column(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: 'col_note',
    key: 'note',
    label: 'Note',
    type: 'text',
    role: 'none',
    ...overrides,
  };
}

function hundredColumnTable(): TableMeta {
  const columns: ColumnDef[] = [
    { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  ];
  for (let index = 1; index < 100; index += 1) {
    columns.push({
      id: `col_${String(index)}`,
      key: `field_${String(index)}`,
      label: `Field ${String(index)}`,
      type: 'text',
      role: 'none',
    });
  }
  return makeTable({ columns, primaryKey: 'col_id', rowCount: 0 });
}

describe('planColumnAdd', () => {
  it('appends a column and fills existing rows with null without touching row count', () => {
    const rows = makeRows();
    const plan = unwrap(planColumnAdd(makeTable(), rows, column()));

    expect(plan.table.columns.map((entry) => entry.id)).toEqual([
      'col_id',
      'col_time',
      'col_value',
      'col_note',
    ]);
    expect(plan.rows.map((row) => row.values)).toEqual([
      ['a', 1_735_689_600_000, 21.5, null],
      ['b', 1_735_689_660_000, 23.1, null],
    ]);
    expect(plan.table.rowCount).toBe(2);
    expect(plan.affectedRows).toBe(2);
    expect(plan.convertedCells).toBe(0);
    // The source rows stay untouched (plans never mutate their inputs).
    expect(rows[0]?.values).toHaveLength(3);
  });

  it('inserts the new value at the requested index', () => {
    const plan = unwrap(planColumnAdd(makeTable(), makeRows(), column(), 1));

    expect(plan.table.columns[1]?.id).toBe('col_note');
    expect(plan.rows[0]?.values).toEqual(['a', null, 1_735_689_600_000, 21.5]);
  });

  it('rejects the 101st column', () => {
    const plan = failure(planColumnAdd(hundredColumnTable(), [], column()));

    expect(plan.error.code).toBe('E_VALIDATION');
    expect(plan.error.detail).toContain('100');
    expect(plan.failures).toEqual([]);
  });

  it('rejects duplicate ids and keys', () => {
    const duplicateId = failure(
      planColumnAdd(makeTable(), makeRows(), column({ id: 'col_value' })),
    );
    expect(duplicateId.error.code).toBe('E_DUPLICATE_KEY');

    const duplicateKey = failure(planColumnAdd(makeTable(), makeRows(), column({ key: 'value' })));
    expect(duplicateKey.error.code).toBe('E_DUPLICATE_KEY');
  });

  it('rejects an invalid column definition', () => {
    const plan = failure(planColumnAdd(makeTable(), makeRows(), column({ key: '9bad' })));

    expect(plan.error.code).toBe('E_VALIDATION');
    expect(plan.error.detail).toContain('key');
  });

  it('rejects a required column on a non-empty table but allows it on an empty one', () => {
    const nonEmpty = failure(planColumnAdd(makeTable(), makeRows(), column({ required: true })));
    expect(nonEmpty.error.code).toBe('E_VALIDATION');

    const empty = unwrap(planColumnAdd(makeTable({ rowCount: 0 }), [], column({ required: true })));
    expect(empty.table.columns).toHaveLength(4);
  });

  it('rejects an out-of-range insertion index', () => {
    expect(failure(planColumnAdd(makeTable(), makeRows(), column(), 4)).error.code).toBe(
      'E_VALIDATION',
    );
    expect(failure(planColumnAdd(makeTable(), makeRows(), column(), -1)).error.code).toBe(
      'E_VALIDATION',
    );
  });
});

describe('planColumnDelete', () => {
  it('removes the column and the matching value from every row', () => {
    const rows = makeRows();
    const plan = unwrap(planColumnDelete(makeTable(), rows, 'col_time'));

    expect(plan.table.columns.map((entry) => entry.id)).toEqual(['col_id', 'col_value']);
    expect(plan.rows.map((row) => row.values)).toEqual([
      ['a', 21.5],
      ['b', 23.1],
    ]);
    expect(plan.affectedRows).toBe(2);
    expect(rows[0]?.values).toHaveLength(3);
  });

  it('refuses to delete the primary key or an unknown column', () => {
    expect(failure(planColumnDelete(makeTable(), makeRows(), 'col_id')).error.code).toBe(
      'E_VALIDATION',
    );
    expect(failure(planColumnDelete(makeTable(), makeRows(), 'col_missing')).error.code).toBe(
      'E_VALIDATION',
    );
  });
});

describe('planColumnUpdate', () => {
  function textAmountTable(): TableMeta {
    return makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_amount', key: 'amount', label: 'Amount', type: 'text', role: 'y' },
      ],
    });
  }

  function textAmountRows(): Row[] {
    return [
      { id: 'row_1', values: ['a', '1,234.5'] },
      { id: 'row_2', values: ['b', ''] },
      { id: 'row_3', values: ['c', null] },
    ];
  }

  it('converts existing cells when the type changes', () => {
    const plan = unwrap(
      planColumnUpdate(
        textAmountTable(),
        textAmountRows(),
        column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number', role: 'y' }),
      ),
    );

    expect(plan.table.columns[1]?.type).toBe('number');
    expect(plan.rows.map((row) => row.values[1])).toEqual([1234.5, null, null]);
    // "1,234.5" -> 1234.5 and "" -> null both rewrite the stored value.
    expect(plan.convertedCells).toBe(2);
  });

  it('preserves nulls instead of turning them into empty strings', () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
      ],
    });
    const plan = unwrap(
      planColumnUpdate(
        table,
        [{ id: 'row_1', values: ['a', null] }],
        column({ id: 'col_value', key: 'value', label: 'Value', type: 'text', role: 'y' }),
      ),
    );

    expect(plan.rows[0]?.values[1]).toBeNull();
    expect(plan.convertedCells).toBe(0);
  });

  it('fails as a whole and reports the first 100 rows when conversion fails', () => {
    const rows: Row[] = [];
    for (let index = 0; index < 150; index += 1) {
      rows.push({ id: `row_${String(index)}`, values: [`id-${String(index)}`, 'not a number'] });
    }
    const plan = failure(
      planColumnUpdate(
        textAmountTable(),
        rows,
        column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number', role: 'y' }),
      ),
    );

    expect(plan.error.code).toBe('E_TYPE');
    expect(plan.failures).toHaveLength(100);
    expect(plan.totalFailures).toBe(150);
    expect(plan.failures[0]).toMatchObject({
      rowNumber: 1,
      rowId: 'row_0',
      value: 'not a number',
      code: 'E_TYPE',
    });
    expect(plan).not.toHaveProperty('rows');
  });

  it('rejects enabling required when existing cells are blank', () => {
    const plan = failure(
      planColumnUpdate(
        textAmountTable(),
        textAmountRows(),
        column({
          id: 'col_amount',
          key: 'amount',
          label: 'Amount',
          type: 'text',
          role: 'y',
          required: true,
        }),
      ),
    );

    expect(plan.error.code).toBe('E_VALIDATION');
    expect(plan.failures.map((entry) => entry.rowNumber)).toEqual([2, 3]);
    expect(plan.failures[0]?.code).toBe('E_REQUIRED');
  });

  it('rejects removing an enum option that rows still use', () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        {
          id: 'col_status',
          key: 'status',
          label: 'Status',
          type: 'enum',
          role: 'series',
          enumOptions: [
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
          ],
        },
      ],
    });
    const rows: Row[] = [
      { id: 'row_1', values: ['a', 'active'] },
      { id: 'row_2', values: ['b', 'paused'] },
    ];
    const next = column({
      id: 'col_status',
      key: 'status',
      label: 'Status',
      type: 'enum',
      role: 'series',
      enumOptions: [{ value: 'paused', label: 'Paused' }],
    });

    const plan = failure(planColumnUpdate(table, rows, next));
    expect(plan.failures).toHaveLength(1);
    expect(plan.failures[0]).toMatchObject({ rowNumber: 1, value: 'active', code: 'E_ENUM' });
  });

  it('accepts metadata-only edits without rewriting rows', () => {
    const rows = textAmountRows();
    const plan = unwrap(
      planColumnUpdate(
        textAmountTable(),
        rows,
        column({ id: 'col_amount', key: 'amount', label: 'Total', type: 'text', role: 'y' }),
      ),
    );

    expect(plan.convertedCells).toBe(0);
    expect(plan.rows.map((row) => row.values)).toEqual(rows.map((row) => row.values));
  });

  it('rejects changing the primary key type away from text', () => {
    const plan = failure(
      planColumnUpdate(
        makeTable(),
        makeRows(),
        column({ id: 'col_id', key: 'id', label: 'ID', type: 'number', role: 'none' }),
      ),
    );

    expect(plan.error.code).toBe('E_TYPE');
  });

  it('rejects a duplicate key and an unknown column id', () => {
    expect(
      failure(
        planColumnUpdate(
          textAmountTable(),
          textAmountRows(),
          column({ id: 'col_amount', key: 'id', label: 'Amount', type: 'text', role: 'y' }),
        ),
      ).error.code,
    ).toBe('E_DUPLICATE_KEY');

    expect(
      failure(
        planColumnUpdate(
          textAmountTable(),
          textAmountRows(),
          column({ id: 'col_missing', key: 'amount', label: 'Amount', type: 'text', role: 'y' }),
        ),
      ).error.code,
    ).toBe('E_VALIDATION');
  });
});

describe('planColumnReorder', () => {
  it('reorders the schema and every row together', () => {
    const rows = makeRows();
    const plan = unwrap(planColumnReorder(makeTable(), rows, ['col_value', 'col_id', 'col_time']));

    expect(plan.table.columns.map((entry) => entry.id)).toEqual([
      'col_value',
      'col_id',
      'col_time',
    ]);
    expect(plan.rows[0]?.values).toEqual([21.5, 'a', 1_735_689_600_000]);
    expect(rows[0]?.values[1]).toBe(1_735_689_600_000);
  });

  it('rejects non-permutations', () => {
    expect(
      failure(planColumnReorder(makeTable(), makeRows(), ['col_id', 'col_time'])).error.code,
    ).toBe('E_VALIDATION');
    expect(
      failure(planColumnReorder(makeTable(), makeRows(), ['col_id', 'col_time', 'col_time'])).error
        .code,
    ).toBe('E_DUPLICATE_KEY');
    expect(
      failure(planColumnReorder(makeTable(), makeRows(), ['col_id', 'col_time', 'col_missing']))
        .error.code,
    ).toBe('E_VALIDATION');
  });
});

describe('planPrimaryKeyChange', () => {
  function codeTable(): TableMeta {
    return makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_code', key: 'code', label: 'Code', type: 'text', role: 'none' },
      ],
      primaryKey: 'col_id',
      rowCount: 2,
    });
  }

  it('promotes an existing text column and marks it required', () => {
    const rows: Row[] = [
      { id: 'row_1', values: ['a', 'x'] },
      { id: 'row_2', values: ['b', 'y'] },
    ];
    const plan = unwrap(planPrimaryKeyChange(codeTable(), rows, 'col_code'));

    expect(plan.table.primaryKey).toBe('col_code');
    expect(plan.table.columns[1]?.required).toBe(true);
    expect(plan.rows.map((row) => row.values)).toEqual([
      ['a', 'x'],
      ['b', 'y'],
    ]);
    expect(plan.convertedCells).toBe(0);
  });

  it('rejects blank and duplicate values with row numbers', () => {
    const rows: Row[] = [
      { id: 'row_1', values: ['a', 'dup'] },
      { id: 'row_2', values: ['b', 'dup'] },
      { id: 'row_3', values: ['c', null] },
      { id: 'row_4', values: ['d', '  '] },
    ];
    const plan = failure(planPrimaryKeyChange(codeTable(), rows, 'col_code'));

    expect(plan.error.code).toBe('E_VALIDATION');
    expect(plan.totalFailures).toBe(3);
    expect(plan.failures.map((entry) => [entry.rowNumber, entry.code])).toEqual([
      [2, 'E_DUPLICATE_KEY'],
      [3, 'E_REQUIRED'],
      [4, 'E_REQUIRED'],
    ]);
  });

  it('rejects a non-text or unknown column', () => {
    expect(failure(planPrimaryKeyChange(makeTable(), makeRows(), 'col_value')).error.code).toBe(
      'E_TYPE',
    );
    expect(failure(planPrimaryKeyChange(makeTable(), makeRows(), 'col_missing')).error.code).toBe(
      'E_VALIDATION',
    );
  });
});
