import { describe, expect, it } from 'vitest';

import type { ColumnDef, TableMeta } from '@curve/domain';

import { checkColumnDraft } from './column-draft';

import type { ColumnDraft } from './column-draft';

const TIMESTAMP = '2026-10-20T05:00:00.000Z';

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Readings',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    ],
    primaryKey: 'col_id',
    rowCount: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function draft(overrides: Partial<ColumnDraft> = {}): ColumnDraft {
  return {
    label: 'Note',
    key: 'note',
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
  return makeTable({ columns });
}

describe('checkColumnDraft', () => {
  it('normalises a valid draft and drops empty optional fields', () => {
    const result = checkColumnDraft(
      makeTable(),
      draft({ label: '  Note  ', key: ' note ', unit: ' °C ', precision: 1, required: true }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.column).toEqual({
      id: 'col_draft',
      key: 'note',
      label: 'Note',
      type: 'text',
      role: 'none',
      unit: '°C',
      precision: 1,
      required: true,
    });
  });

  it('accepts an existing column id and ignores itself for key uniqueness', () => {
    const result = checkColumnDraft(
      makeTable(),
      draft({ key: 'value', label: 'Value', type: 'number', role: 'y' }),
      'col_value',
    );

    expect(result.ok).toBe(true);
  });

  it('reports a missing label, key and a duplicate key', () => {
    const missing = checkColumnDraft(makeTable(), draft({ label: ' ', key: ' ' }));
    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.issues.map((issue) => issue.field)).toEqual(['label', 'key']);

    const duplicate = checkColumnDraft(makeTable(), draft({ key: 'value' }));
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) {
      return;
    }
    expect(duplicate.issues[0]).toMatchObject({ field: 'key', reason: 'duplicate' });
  });

  it('rejects an invalid key format, an over-long unit and out-of-range precision', () => {
    const badKey = checkColumnDraft(makeTable(), draft({ key: '9bad' }));
    expect(badKey.ok).toBe(false);
    if (!badKey.ok) {
      expect(badKey.issues[0]).toMatchObject({ field: 'key', reason: 'format' });
    }

    const longUnit = checkColumnDraft(makeTable(), draft({ unit: 'x'.repeat(17) }));
    expect(longUnit.ok).toBe(false);
    if (!longUnit.ok) {
      expect(longUnit.issues[0]?.field).toBe('unit');
    }

    const precision = checkColumnDraft(makeTable(), draft({ precision: 11 }));
    expect(precision.ok).toBe(false);
    if (!precision.ok) {
      expect(precision.issues[0]?.field).toBe('precision');
    }
  });

  it('requires enum options and rejects duplicates', () => {
    const missing = checkColumnDraft(makeTable(), draft({ type: 'enum' }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.issues[0]).toMatchObject({ field: 'enumOptions', reason: 'enum-empty' });
    }

    const duplicate = checkColumnDraft(
      makeTable(),
      draft({
        type: 'enum',
        enumOptions: [
          { value: 'a', label: 'A' },
          { value: ' a ', label: 'A again' },
        ],
      }),
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.issues[0]).toMatchObject({
        field: 'enumOptions',
        reason: 'enum-duplicate',
      });
    }
  });

  it('trims enum values and labels', () => {
    const result = checkColumnDraft(
      makeTable(),
      draft({
        type: 'enum',
        enumOptions: [{ value: ' active ', label: ' Active ' }],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.column.enumOptions).toEqual([{ value: 'active', label: 'Active' }]);
    }
  });

  it('enforces the 100-column limit only for new columns', () => {
    const table = hundredColumnTable();
    const added = checkColumnDraft(table, draft());
    expect(added.ok).toBe(false);
    if (!added.ok) {
      expect(added.issues[0]).toMatchObject({ field: 'form', reason: 'limit' });
    }

    const edited = checkColumnDraft(table, draft({ label: 'ID renamed', key: 'id' }), 'col_id');
    expect(edited.ok).toBe(true);
  });

  it('keeps a text primary key a text column', () => {
    const result = checkColumnDraft(
      makeTable(),
      draft({ label: 'ID', key: 'id', type: 'number' }),
      'col_id',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({ field: 'type', reason: 'primary-key-type' });
    }
  });
});
