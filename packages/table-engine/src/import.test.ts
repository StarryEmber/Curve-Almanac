import { describe, expect, it } from 'vitest';

import type { ColumnDef, Row, TableMeta } from '@curve/domain';

import {
  buildImportColumns,
  inferColumnType,
  parseCsv,
  parseJson,
  planImport,
  sniffCsv,
} from './import';
import { MAX_ROWS_PER_TABLE } from './jsonl';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_import',
    name: 'Import',
    file: 'tables/tbl_import.jsonl',
    schemaVersion: 1,
    columns: [
      column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true }),
      column({ id: 'col_name', key: 'name', label: 'Name', type: 'text' }),
      column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number' }),
    ],
    primaryKey: 'col_id',
    rowCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const EXISTING: Row = { id: 'row_existing', values: ['existing', 'Old', 1] };

describe('sniffCsv', () => {
  it('detects comma, semicolon, tab and pipe', () => {
    expect(sniffCsv('id,name\n1,Alice\n2,Bob').delimiter).toBe(',');
    expect(sniffCsv('id;name\n1;Alice\n2;Bob').delimiter).toBe(';');
    expect(sniffCsv('id\tname\n1\tAlice\n2\tBob').delimiter).toBe('\t');
    expect(sniffCsv('id|name\n1|Alice\n2|Bob').delimiter).toBe('|');
  });

  it('ignores delimiters inside quoted values and prefers the stable one', () => {
    const result = sniffCsv('name;note\nAlice;"hello, world"\nBob;"one;two"');

    expect(result.delimiter).toBe(';');
    expect(result.hasHeader).toBe(true);
  });

  it('detects a data-only first row and defaults ambiguous all-text data to header', () => {
    expect(sniffCsv('1,Alice\n2,Bob').hasHeader).toBe(false);
    expect(sniffCsv('Alice,London\nBob,Paris').hasHeader).toBe(true);
  });
});

describe('parseCsv', () => {
  it('parses quoted commas, escaped quotes and embedded newlines', () => {
    const parsed = parseCsv('id,name,note\n1,Alice,"hello, world"\n2,Bob,"line 1\nline 2"');

    expect(parsed.hasHeader).toBe(true);
    expect(parsed.headers).toEqual(['id', 'name', 'note']);
    expect(parsed.rows).toEqual([
      ['1', 'Alice', 'hello, world'],
      ['2', 'Bob', 'line 1\nline 2'],
    ]);
    expect(parsed.totalRows).toBe(2);
  });

  it('honours explicit header and delimiter overrides', () => {
    const parsed = parseCsv('1|Alice\n2|Bob', { delimiter: '|', hasHeader: false });

    expect(parsed.headers).toEqual(['column_1', 'column_2']);
    expect(parsed.rows).toEqual([
      ['1', 'Alice'],
      ['2', 'Bob'],
    ]);
  });

  it('normalises duplicate and empty headers with a warning', () => {
    const parsed = parseCsv('name,name,,name\nAlice,Bob,Carol,Dan');

    expect(parsed.headers).toEqual(['name', 'name_2', 'column_3', 'name_3']);
    expect(parsed.warnings.join(' ')).toMatch(/duplicate/i);
  });

  it('rejects an empty file and an unclosed quote', () => {
    expect(() => parseCsv('')).toThrowError(/empty/i);
    expect(() => parseCsv('a,b\n1,"unclosed')).toThrowError(/quote/i);
  });

  it('infers a type per source column', () => {
    const parsed = parseCsv(
      'id,amount,day,active\n1,"1,234.5",2026-01-01,true\n2,2,2026-01-02,false',
    );

    expect(parsed.columns.map((entry) => entry.type)).toEqual([
      'number',
      'number',
      'date',
      'boolean',
    ]);
  });
});

describe('parseJson', () => {
  it('accepts an object array and a {rows} wrapper', () => {
    const array = parseJson('[{"id":"a","x":1},{"id":"b","x":2}]');
    const wrapped = parseJson('{"rows":[{"id":"a","x":1},{"id":"b","x":2}]}');

    expect(array).toEqual(wrapped);
    expect(array.headers).toEqual(['id', 'x']);
    expect(array.rows).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('uses the union of keys and fills missing values', () => {
    const parsed = parseJson('[{"a":1},{"b":2}]');

    expect(parsed.headers).toEqual(['a', 'b']);
    expect(parsed.rows).toEqual([
      [1, null],
      [null, 2],
    ]);
  });

  it('rejects nested objects/arrays and non-object rows', () => {
    expect(() => parseJson('[{"a":{"nested":1}}]')).toThrowError(/nested/i);
    expect(() => parseJson('[{"a":[1,2]}]')).toThrowError(/nested/i);
    expect(() => parseJson('[1,2]')).toThrowError(/object/i);
    expect(() => parseJson('{"points":[]}')).toThrowError(/rows/i);
  });
});

describe('inferColumnType', () => {
  it('infers numbers, dates and booleans with confidence', () => {
    expect(inferColumnType(['1', '2', '3'])).toMatchObject({ type: 'number', confidence: 1 });
    expect(inferColumnType(['2026-01-01', '2026-01-02'])).toMatchObject({
      type: 'date',
      confidence: 1,
    });
    expect(inferColumnType(['true', 'false', '是'])).toMatchObject({
      type: 'boolean',
      confidence: 1,
    });
  });

  it('falls back to text below 80% confidence', () => {
    const result = inferColumnType(['1', '2', 'oops']);

    expect(result.type).toBe('text');
    expect(result.confidence).toBeLessThan(0.8);
  });

  it('samples only the first 1000 non-empty values', () => {
    const values = [...Array<number>(1000).fill(1), 'oops'];
    const result = inferColumnType(values);

    expect(result.type).toBe('number');
    expect(result.sampleSize).toBe(1000);
  });
});

describe('buildImportColumns', () => {
  it('returns inferred types and confidence per header', () => {
    const columns = buildImportColumns(
      ['id', 'amount'],
      [
        ['a', '1'],
        ['b', '2'],
      ],
    );

    expect(columns).toEqual([
      { index: 0, name: 'id', type: 'text', confidence: 1, sampleSize: 2 },
      { index: 1, name: 'amount', type: 'number', confidence: 1, sampleSize: 2 },
    ]);
  });
});

describe('planImport', () => {
  const parsed = parseCsv('id,name,amount\n,a,1\n,b,2');

  it('appends rows, generates blank primary keys and fills the final count', () => {
    let sequence = 0;
    const plan = planImport({
      table: makeTable(),
      rows: [EXISTING],
      dataset: parsed,
      mappings: [
        { sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } },
        { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_name' } },
        { sourceIndex: 2, target: { kind: 'existing', columnId: 'col_amount' } },
      ],
      mode: 'append',
      skipInvalid: false,
      uuid: () => `generated-${String(++sequence)}`,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.stats).toEqual({ total: 2, accepted: 2, skipped: 0 });
    expect(plan.finalRowCount).toBe(3);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0]?.values[0]).toMatch(/^row_/);
    expect(plan.rows[0]?.values[1]).toBe('a');
  });

  it('replaces rows without keeping the existing row', () => {
    const plan = planImport({
      table: makeTable(),
      rows: [EXISTING],
      dataset: parsed,
      mappings: [
        { sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } },
        { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_name' } },
        { sourceIndex: 2, target: { kind: 'existing', columnId: 'col_amount' } },
      ],
      mode: 'replace',
      skipInvalid: false,
    });

    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.finalRowCount).toBe(2);
      expect(plan.rows.map((row) => row.values[1])).toEqual(['a', 'b']);
    }
  });

  it('reports bad rows by data-row number and skips them only when asked', () => {
    const bad = parseCsv('id,name,amount\n,a,1\n,b,oops\n,c,3');
    const mappings = [
      { sourceIndex: 0, target: { kind: 'existing' as const, columnId: 'col_id' } },
      { sourceIndex: 1, target: { kind: 'existing' as const, columnId: 'col_name' } },
      { sourceIndex: 2, target: { kind: 'existing' as const, columnId: 'col_amount' } },
    ];

    const rejected = planImport({
      table: makeTable(),
      rows: [],
      dataset: bad,
      mappings,
      mode: 'append',
      skipInvalid: false,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.issues).toHaveLength(1);
      expect(rejected.issues[0]).toMatchObject({ row: 2, code: 'E_TYPE' });
      expect(rejected.stats).toEqual({ total: 3, accepted: 2, skipped: 1 });
    }

    const skipped = planImport({
      table: makeTable(),
      rows: [],
      dataset: bad,
      mappings,
      mode: 'append',
      skipInvalid: true,
    });
    expect(skipped.ok).toBe(true);
    if (skipped.ok) {
      expect(skipped.rows).toHaveLength(2);
      expect(skipped.stats).toEqual({ total: 3, accepted: 2, skipped: 1 });
    }
  });

  it('reports missing required mapped data and duplicate keys', () => {
    const requiredTable = makeTable({
      columns: [
        column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true }),
        column({ id: 'col_name', key: 'name', label: 'Name', type: 'text', required: true }),
        column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number' }),
      ],
    });
    const missing = parseCsv('amount\n1');
    const missingPlan = planImport({
      table: requiredTable,
      rows: [],
      dataset: missing,
      mappings: [{ sourceIndex: 0, target: { kind: 'existing', columnId: 'col_amount' } }],
      mode: 'append',
      skipInvalid: false,
    });
    expect(missingPlan.ok).toBe(false);
    if (!missingPlan.ok) {
      expect(missingPlan.issues[0]?.code).toBe('E_REQUIRED');
    }

    const duplicate = parseCsv('id,name,amount\nsame,a,1\nsame,b,2');
    const duplicatePlan = planImport({
      table: makeTable(),
      rows: [],
      dataset: duplicate,
      mappings: [
        { sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } },
        { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_name' } },
        { sourceIndex: 2, target: { kind: 'existing', columnId: 'col_amount' } },
      ],
      mode: 'append',
      skipInvalid: false,
    });
    expect(duplicatePlan.ok).toBe(false);
    if (!duplicatePlan.ok) {
      expect(duplicatePlan.issues[0]?.code).toBe('E_DUPLICATE_KEY');
    }
  });

  it('rejects rows beyond the 200k cap', () => {
    const table = makeTable({
      columns: [column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true })],
      primaryKey: 'col_id',
      rowCount: 0,
    });
    const rows: string[][] = Array.from({ length: MAX_ROWS_PER_TABLE + 1 }, (_, index) => [
      `id${String(index)}`,
    ]);
    const plan = planImport({
      table,
      rows: [],
      dataset: { headers: ['id'], rows, totalRows: rows.length, warnings: [], columns: [] },
      mappings: [{ sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } }],
      mode: 'append',
      skipInvalid: false,
    });

    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error.code).toBe('E_TABLE_LIMIT');
    }
  });

  it('adds optional new columns and rejects required ones', () => {
    const newColumn: ColumnDef = column({
      id: 'col_new',
      key: 'extra',
      label: 'Extra',
      type: 'text',
    });
    const plan = planImport({
      table: makeTable(),
      rows: [EXISTING],
      dataset: {
        headers: ['id', 'name', 'amount', 'extra'],
        rows: [['1', 'a', '2', 'x']],
        totalRows: 1,
        warnings: [],
        columns: [],
      },
      mappings: [
        { sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } },
        { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_name' } },
        { sourceIndex: 2, target: { kind: 'existing', columnId: 'col_amount' } },
        { sourceIndex: 3, target: { kind: 'new', newColumnIndex: 0 } },
      ],
      newColumns: [newColumn],
      mode: 'append',
      skipInvalid: false,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.newColumns).toEqual([newColumn]);
      expect(plan.rows[0]?.values).toHaveLength(4);
    }

    const required = planImport({
      table: makeTable(),
      rows: [],
      dataset: { headers: ['extra'], rows: [['x']], totalRows: 1, warnings: [], columns: [] },
      mappings: [{ sourceIndex: 0, target: { kind: 'new', newColumnIndex: 0 } }],
      newColumns: [{ ...newColumn, required: true }],
      mode: 'append',
      skipInvalid: false,
    });
    expect(required.ok).toBe(false);
  });

  it('rejects a row with the wrong number of fields', () => {
    const plan = planImport({
      table: makeTable(),
      rows: [],
      dataset: { headers: ['id', 'name'], rows: [['1']], totalRows: 1, warnings: [], columns: [] },
      mappings: [
        { sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } },
        { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_name' } },
      ],
      mode: 'append',
      skipInvalid: false,
    });

    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.issues[0]?.code).toBe('E_IMPORT_FORMAT');
    }
  });
});
