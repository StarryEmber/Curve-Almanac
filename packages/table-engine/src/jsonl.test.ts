import { describe, expect, it } from 'vitest';

import type { ColumnDef, Row, TableMeta } from '@curve/domain';

import {
  countJsonlRows,
  decodeJsonl,
  encodeJsonl,
  encodeJsonlWithStats,
  hasTrailingNewline,
  MAX_JSONL_LINE_BYTES,
  MAX_ROWS_PER_TABLE,
  toJsonlAppError,
  utf8ByteLength,
} from './jsonl';

function column(overrides: Partial<ColumnDef> & Pick<ColumnDef, 'id' | 'key' | 'type'>): ColumnDef {
  return { label: overrides.key, role: 'none', ...overrides };
}

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_test',
    name: 'Test',
    file: 'tables/tbl_test.jsonl',
    schemaVersion: 1,
    columns: [
      column({ id: 'col_id', key: 'id', type: 'text', role: 'label', required: true }),
      column({ id: 'col_when', key: 'when', type: 'date' }),
      column({ id: 'col_value', key: 'value', type: 'number' }),
      column({ id: 'col_ok', key: 'ok', type: 'boolean' }),
      column({
        id: 'col_site',
        key: 'site',
        type: 'enum',
        enumOptions: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    ],
    primaryKey: 'col_id',
    rowCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function row(id: string, values: Row['values']): Row {
  return { id, values };
}

describe('encodeJsonl', () => {
  it('writes `{id,v}` lines with a trailing newline and no BOM', () => {
    const jsonl = encodeJsonl([
      row('row_001', ['a', 1_735_689_600_000, 21.5, true, 'a']),
      row('row_002', ['b', 1_735_689_660_000, 23.1, false, 'b']),
    ]);

    expect(jsonl).toBe(
      '{"id":"row_001","v":["a",1735689600000,21.5,true,"a"]}\n' +
        '{"id":"row_002","v":["b",1735689660000,23.1,false,"b"]}\n',
    );
    expect(jsonl.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('encodes an empty row set as zero bytes (SPEC §7.3)', () => {
    expect(encodeJsonl([])).toBe('');
  });

  it('keeps null cells and escapes strings without changing them', () => {
    const jsonl = encodeJsonl([row('row_003', ['quote " and \\ and \n', null, null, null, null])]);
    expect(JSON.parse(jsonl.trim())).toEqual({
      id: 'row_003',
      v: ['quote " and \\ and \n', null, null, null, null],
    });
  });

  it('reports the UTF-8 byte length next to the text', () => {
    const stats = encodeJsonlWithStats([row('row_004', ['héllo', null, null, null, null])]);
    expect(stats.jsonl).toBe('{"id":"row_004","v":["héllo",null,null,null,null]}\n');
    expect(stats.bytes).toBe(utf8ByteLength(stats.jsonl));
  });
});

describe('decodeJsonl', () => {
  it('returns no rows for an empty file (SPEC §7.3)', () => {
    const result = decodeJsonl('', makeTable());
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.stats).toEqual({ total: 0, accepted: 0, skipped: 0 });
  });

  it('round-trips every cell of a row set', () => {
    const table = makeTable();
    const rows: Row[] = [
      row('row_001', ['a', 1_735_689_600_000, 21.5, true, 'a']),
      row('row_002', ['b', 1_735_689_660_000, null, false, 'b']),
    ];

    const result = decodeJsonl(encodeJsonl(rows), table);

    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual(rows);
    expect(result.stats).toEqual({ total: 2, accepted: 2, skipped: 0 });
  });

  it('reports a truncated JSON line as E_TABLE_PARSE with its line number', () => {
    const table = makeTable();
    const jsonl =
      '{"id":"row_001","v":["a",1735689600000,1,true,"a"]}\n' +
      '{"id":"row_002","v":["b",1735689660000,2,true,"b"]' +
      '\n' +
      '{"id":"row_003","v":["c",1735689720000,3,true,"b"]}\n';

    const result = decodeJsonl(jsonl, table);

    expect(result.rows.map((entry) => entry.id)).toEqual(['row_001', 'row_003']);
    expect(result.stats).toEqual({ total: 3, accepted: 2, skipped: 1 });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ line: 2, code: 'E_TABLE_PARSE' });
    expect(result.issues[0]?.message).toContain('line 2');
  });

  it('reports every bad line instead of swallowing rows', () => {
    const table = makeTable();
    const jsonl =
      '{"id":"row_001","v":["a",null,1,true,"a"]}\n' +
      'not json\n' +
      '{"id":"row_002","v":["b",null,2,true,"b"]}\n' +
      '{"id":"row_002","v":["c",null,3,true,"b"]}\n' +
      '{"id":"row_004","v":["d",null,4,true,"b"]}\n';

    const result = decodeJsonl(jsonl, table);

    expect(result.rows.map((entry) => entry.id)).toEqual(['row_001', 'row_002', 'row_004']);
    expect(result.stats).toEqual({ total: 5, accepted: 3, skipped: 2 });
    expect(result.issues.map((issue) => issue.line)).toEqual([2, 4]);
    expect(result.issues[1]?.code).toBe('E_DUPLICATE_KEY');
  });

  it('rejects a column count mismatch with the line number', () => {
    const jsonl = '{"id":"row_001","v":["a",null,1]}\n';
    const result = decodeJsonl(jsonl, makeTable());

    expect(result.rows).toEqual([]);
    expect(result.issues[0]).toMatchObject({ line: 1, code: 'E_TABLE_PARSE' });
    expect(result.issues[0]?.message).toContain('5');
  });

  it('rejects a cell whose physical type does not match the column', () => {
    const jsonl = '{"id":"row_001","v":["a",null,"not-a-number",true,"a"]}\n';
    const result = decodeJsonl(jsonl, makeTable());

    expect(result.rows).toEqual([]);
    expect(result.issues[0]).toMatchObject({
      line: 1,
      columnId: 'col_value',
      code: 'E_TYPE',
    });
  });

  it('rejects a required cell that is null', () => {
    const jsonl = '{"id":"row_001","v":[null,null,1,true,"a"]}\n';
    const result = decodeJsonl(jsonl, makeTable());

    expect(result.rows).toEqual([]);
    expect(result.issues[0]).toMatchObject({ columnId: 'col_id', code: 'E_REQUIRED' });
  });

  it('rejects an object-shaped `v` (SPEC §7.3 forbids object cells)', () => {
    const jsonl = '{"id":"row_001","v":{"id":"a"}}\n';
    const result = decodeJsonl(jsonl, makeTable());

    expect(result.rows).toEqual([]);
    expect(result.issues[0]?.code).toBe('E_TABLE_PARSE');
  });

  it('rejects a row id that does not match the `row_` prefix', () => {
    const jsonl = '{"id":"nope","v":["a",null,1,true,"a"]}\n';
    const result = decodeJsonl(jsonl, makeTable());

    expect(result.rows).toEqual([]);
    expect(result.issues[0]).toMatchObject({ line: 1, code: 'E_TABLE_PARSE' });
    expect(result.issues[0]?.message).toContain('row_');
  });

  it('rejects a missing trailing newline only through the helper', () => {
    const table = makeTable();
    const withNewline = '{"id":"row_001","v":["a",null,1,true,"a"]}\n';
    const withoutNewline = '{"id":"row_001","v":["a",null,1,true,"a"]}';

    expect(decodeJsonl(withoutNewline, table).rows).toHaveLength(1);
    expect(hasTrailingNewline('')).toBe(true);
    expect(hasTrailingNewline(withNewline)).toBe(true);
    expect(hasTrailingNewline(withoutNewline)).toBe(false);
  });

  it('reports a BOM and CRLF as parse errors with line numbers', () => {
    const table = makeTable();
    const withBom = `\uFEFF{"id":"row_001","v":["a",null,1,true,"a"]}\n`;
    const withCrlf = '{"id":"row_001","v":["a",null,1,true,"a"]}\r\n';

    const bomResult = decodeJsonl(withBom, table);
    expect(bomResult.issues[0]).toMatchObject({ line: 1, code: 'E_TABLE_PARSE' });
    expect(bomResult.rows).toHaveLength(1);

    const crlfResult = decodeJsonl(withCrlf, table);
    expect(crlfResult.rows).toEqual([]);
    expect(crlfResult.issues[0]).toMatchObject({ line: 1, code: 'E_TABLE_PARSE' });
  });

  it('rejects blank lines with their line number', () => {
    const jsonl = '{"id":"row_001","v":["a",null,1,true,"a"]}\n\n';
    const result = decodeJsonl(jsonl, makeTable());

    expect(result.issues.map((issue) => issue.line)).toEqual([2]);
    expect(result.stats).toEqual({ total: 2, accepted: 1, skipped: 1 });
  });

  it('rejects a line above the 8 MB limit without parsing it', () => {
    const table = makeTable();
    const huge = 'x'.repeat(MAX_JSONL_LINE_BYTES + 1);
    const result = decodeJsonl(`${huge}\n`, table);

    expect(result.rows).toEqual([]);
    expect(result.issues[0]).toMatchObject({ line: 1, code: 'E_TABLE_PARSE' });
    expect(result.issues[0]?.message).toContain('8 MB');
  });

  it('checks the exact UTF-8 byte length of multi-byte lines', () => {
    const table = makeTable();
    // 4.2M two-byte characters: 8.4 MB on disk, so the exact check must reject.
    const tooLong = decodeJsonl(`${'é'.repeat(4_200_000)}\n`, table);
    expect(tooLong.issues[0]?.message).toContain('8 MB');

    // 3M two-byte characters: 6 MB on disk, so only the JSON parse may fail.
    const underLimit = decodeJsonl(`${'é'.repeat(3_000_000)}\n`, table);
    expect(underLimit.issues[0]?.message).toContain('invalid JSON');
  }, 30_000);

  it('encodes an empty row set with stats as zero bytes', () => {
    expect(encodeJsonlWithStats([])).toEqual({ jsonl: '', bytes: 0 });
  });

  it('stops at the 200k row hard cap', () => {
    const table = makeTable({ columns: [column({ id: 'col_id', key: 'id', type: 'text' })] });
    const jsonl = `${Array.from(
      { length: MAX_ROWS_PER_TABLE + 1 },
      (_, index) => `{"id":"row_${index}","v":["x"]}`,
    ).join('\n')}\n`;

    const result = decodeJsonl(jsonl, table);

    expect(result.rows).toHaveLength(MAX_ROWS_PER_TABLE);
    expect(result.issues.at(-1)?.code).toBe('E_TABLE_LIMIT');
    expect(result.stats.total).toBe(MAX_ROWS_PER_TABLE + 1);
  }, 60_000);

  it('round-trips 100k x 10 rows line by line', () => {
    const columns: ColumnDef[] = [
      column({ id: 'col_id', key: 'id', type: 'text', role: 'label', required: true }),
      column({ id: 'col_date', key: 'date', type: 'date' }),
      column({ id: 'col_n1', key: 'n1', type: 'number' }),
      column({ id: 'col_n2', key: 'n2', type: 'number' }),
      column({ id: 'col_n3', key: 'n3', type: 'number' }),
      column({ id: 'col_n4', key: 'n4', type: 'number' }),
      column({ id: 'col_n5', key: 'n5', type: 'number' }),
      column({ id: 'col_ok', key: 'ok', type: 'boolean' }),
      column({ id: 'col_site', key: 'site', type: 'text' }),
      column({ id: 'col_note', key: 'note', type: 'text' }),
    ];
    const table = makeTable({ columns });
    const rows: Row[] = [];
    for (let index = 0; index < 100_000; index += 1) {
      rows.push({
        id: `row_${index.toString(36).padStart(8, '0')}`,
        values: [
          `device-${index}`,
          1_735_689_600_000 + index * 1000,
          index,
          index * 0.5,
          index % 100,
          Math.sin(index),
          index / 3,
          index % 2 === 0,
          `site-${index % 7}`,
          `note-${index}`,
        ],
      });
    }

    const jsonl = encodeJsonl(rows);
    const decoded = decodeJsonl(jsonl, table);

    expect(decoded.issues).toEqual([]);
    expect(decoded.rows).toHaveLength(100_000);
    for (let index = 0; index < rows.length; index += 1) {
      expect(decoded.rows[index]).toEqual(rows[index]);
    }
  }, 120_000);
});

describe('countJsonlRows and toJsonlAppError', () => {
  it('counts content lines and ignores the trailing segment', () => {
    expect(countJsonlRows('')).toBe(0);
    expect(countJsonlRows('{"id":"row_1","v":[]}\n')).toBe(1);
    expect(countJsonlRows('a\nb\n')).toBe(2);
    expect(countJsonlRows('a\nb')).toBe(2);
    expect(countJsonlRows('a\n\nb\n')).toBe(2);
  });

  it('maps blocking issues to E_TABLE_PARSE with line numbers', () => {
    const clean = decodeJsonl('{"id":"row_001","v":["a",null,1,true,"a"]}\n', makeTable());
    expect(toJsonlAppError(clean)).toBeNull();

    const broken = decodeJsonl('{"id":"row_001"\n', makeTable());
    const error = toJsonlAppError(broken);
    expect(error).toMatchObject({ code: 'E_TABLE_PARSE' });
    expect(error?.detail).toContain('line 1');
  });

  it('truncates a long issue list in the error detail', () => {
    const lines = Array.from({ length: 12 }, () => 'not json');
    const result = decodeJsonl(`${lines.join('\n')}\n`, makeTable());

    const error = toJsonlAppError(result);
    expect(error?.detail).toContain('(2 more)');
  });

  it('prefers E_TABLE_LIMIT when the row cap was hit', () => {
    const table = makeTable({ columns: [column({ id: 'col_id', key: 'id', type: 'text' })] });
    const jsonl = `${Array.from(
      { length: MAX_ROWS_PER_TABLE + 1 },
      (_, index) => `{"id":"row_${index}","v":["x"]}`,
    ).join('\n')}\n`;

    const error = toJsonlAppError(decodeJsonl(jsonl, table));
    expect(error).toMatchObject({ code: 'E_TABLE_LIMIT' });
  }, 60_000);
});
