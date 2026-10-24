import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import type { Cell, ColumnDef, Row } from '@curve/domain';

import {
  CSV_BOM,
  CSV_CRLF,
  csvExportFileName,
  encodeCsvChunks,
  escapeCsvField,
  rawCsvCellText,
  sanitizeCsvFileNameBase,
} from './csv-export';

import type { CsvChunk, CsvExportColumn } from './csv-export';

function column(id: string, type: ColumnDef['type'], label = id): ColumnDef {
  return {
    id,
    key: id,
    label,
    type,
    role: 'none',
  };
}

function row(id: string, values: Cell[]): Row {
  return { id, values };
}

function exportColumns(
  columns: readonly ColumnDef[],
  headers: readonly string[] = columns.map((entry) => entry.label),
): CsvExportColumn[] {
  return columns.map((entry, index) => ({
    column: entry,
    valueIndex: index,
    header: headers[index] ?? entry.label,
  }));
}

function collect(options: Parameters<typeof encodeCsvChunks>[0]): CsvChunk[] {
  return [...encodeCsvChunks(options)];
}

function textOf(chunks: readonly CsvChunk[]): string {
  return chunks.map((chunk) => chunk.text).join('');
}

function parseCsv(text: string): string[][] {
  const withoutBom = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const parsed = Papa.parse<string[]>(withoutBom, {
    header: false,
    skipEmptyLines: 'greedy',
  });
  return parsed.data.map((fields) => fields.map((field) => (field === null ? '' : field)));
}

describe('escapeCsvField', () => {
  it('leaves plain text untouched', () => {
    expect(escapeCsvField('plain text')).toBe('plain text');
    expect(escapeCsvField('')).toBe('');
  });

  it('quotes commas, quotes and line breaks per RFC 4180', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line one\nline two')).toBe('"line one\nline two"');
    expect(escapeCsvField('line one\r\nline two')).toBe('"line one\r\nline two"');
    expect(escapeCsvField('line one\rline two')).toBe('"line one\rline two"');
  });

  it('quotes fields with leading or trailing whitespace so Excel keeps them', () => {
    expect(escapeCsvField(' padded')).toBe('" padded"');
    expect(escapeCsvField('padded ')).toBe('"padded "');
    expect(escapeCsvField(' both ')).toBe('" both "');
    expect(escapeCsvField('tab\tinside')).toBe('tab\tinside');
  });
});

describe('rawCsvCellText', () => {
  it('keeps stored values without display formatting', () => {
    expect(rawCsvCellText(null, column('a', 'text'))).toBe('');
    expect(rawCsvCellText(' alpha ', column('a', 'text'))).toBe(' alpha ');
    expect(rawCsvCellText(1234.5, column('a', 'number'))).toBe('1234.5');
    expect(rawCsvCellText(1_700_000_000_000, column('a', 'date'))).toBe('1700000000000');
    expect(rawCsvCellText(true, column('a', 'boolean'))).toBe('true');
    expect(rawCsvCellText(false, column('a', 'boolean'))).toBe('false');
    expect(rawCsvCellText('open', column('a', 'enum'))).toBe('open');
  });

  it('falls back to String for runtime values that do not match the column type', () => {
    expect(rawCsvCellText('true', column('a', 'boolean'))).toBe('true');
    expect(rawCsvCellText(7, column('a', 'text'))).toBe('7');
  });
});

describe('encodeCsvChunks', () => {
  const columns = [
    column('col_name', 'text', 'Name'),
    column('col_note', 'text', 'Note'),
    column('col_value', 'number', 'Value'),
  ];

  it('writes BOM, a CRLF header and CRLF data rows exactly once', () => {
    const chunks = collect({
      columns: exportColumns(columns),
      rows: [row('row_1', ['alpha', 'plain', 1]), row('row_2', ['beta', 'plain', 2])],
      formatCell: rawCsvCellText,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ text: '\uFEFFName,Note,Value\r\n', rows: 0 });
    expect(chunks[1]).toEqual({ text: 'alpha,plain,1\r\nbeta,plain,2\r\n', rows: 2 });
    expect(textOf(chunks)).not.toContain('\n\r');
    expect(textOf(chunks).match(/\uFEFF/g)).toHaveLength(1);
  });

  it('quotes and round-trips commas, quotes, CRLF and empty cells', () => {
    const text = textOf(
      collect({
        columns: exportColumns(columns),
        rows: [
          row('row_1', ['hello, world', 'line one\nline two', 3]),
          row('row_2', ['say "hi"', ' padded ', null]),
        ],
        formatCell: rawCsvCellText,
      }),
    );

    expect(text).toContain('"hello, world"');
    expect(text).toContain('"line one\nline two"');
    expect(text).toContain('"say ""hi"""');
    expect(text).toContain('" padded "');
    expect(parseCsv(text)).toEqual([
      ['Name', 'Note', 'Value'],
      ['hello, world', 'line one\nline two', '3'],
      ['say "hi"', ' padded ', ''],
    ]);
  });

  it('keeps every row intact at chunk boundaries and never splits a row', () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      row(`row_${String(index)}`, [`name-${String(index)}`, `note,${String(index)}`, index]),
    );
    const chunks = collect({
      columns: exportColumns(columns),
      rows,
      formatCell: rawCsvCellText,
      chunkRows: 2,
    });

    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toEqual({ text: '\uFEFFName,Note,Value\r\n', rows: 0 });
    expect(chunks[1]?.rows).toBe(2);
    expect(chunks[2]?.rows).toBe(2);
    expect(chunks[3]?.rows).toBe(1);
    expect(chunks[1]?.text.split(CSV_CRLF).filter((line) => line !== '')).toHaveLength(2);
    expect(chunks[2]?.text.split(CSV_CRLF).filter((line) => line !== '')).toHaveLength(2);
    expect(chunks[3]?.text.split(CSV_CRLF).filter((line) => line !== '')).toHaveLength(1);
    expect(parseCsv(textOf(chunks)).slice(1)).toEqual([
      ['name-0', 'note,0', '0'],
      ['name-1', 'note,1', '1'],
      ['name-2', 'note,2', '2'],
      ['name-3', 'note,3', '3'],
      ['name-4', 'note,4', '4'],
    ]);
  });

  it('exports the header only for an empty table', () => {
    const chunks = collect({
      columns: exportColumns(columns),
      rows: [],
      formatCell: rawCsvCellText,
    });
    expect(chunks).toEqual([{ text: '\uFEFFName,Note,Value\r\n', rows: 0 }]);
  });

  it('follows the caller column order and value indexes', () => {
    const ordered: CsvExportColumn[] = [
      { column: columns[2] as ColumnDef, valueIndex: 2, header: 'Amount' },
      { column: columns[0] as ColumnDef, valueIndex: 0, header: 'Label' },
    ];
    const text = textOf(
      collect({
        columns: ordered,
        rows: [row('row_1', ['alpha', 'ignored', 42])],
        formatCell: rawCsvCellText,
      }),
    );
    expect(text).toBe('\uFEFFAmount,Label\r\n42,alpha\r\n');
  });

  it('uses the injected display formatter and header labels', () => {
    const seen: string[] = [];
    const chunks = collect({
      columns: exportColumns(columns, ['名称', '备注', '金额']),
      rows: [row('row_1', ['alpha', 'note', 1234.5])],
      formatCell: (value, entry) => {
        seen.push(`${entry.id}:${String(value)}`);
        return value === null ? '' : `formatted:${String(value)}`;
      },
    });

    expect(chunks[0]).toEqual({ text: '\uFEFF名称,备注,金额\r\n', rows: 0 });
    expect(chunks[1]).toEqual({
      text: 'formatted:alpha,formatted:note,formatted:1234.5\r\n',
      rows: 1,
    });
    expect(seen).toEqual(['col_name:alpha', 'col_note:note', 'col_value:1234.5']);
  });

  it('rejects invalid chunk sizes instead of silently dropping rows', () => {
    expect(() =>
      collect({
        columns: exportColumns(columns),
        rows: [row('row_1', ['a', 'b', 1])],
        formatCell: rawCsvCellText,
        chunkRows: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      collect({
        columns: exportColumns(columns),
        rows: [],
        formatCell: rawCsvCellText,
        chunkRows: Number.NaN,
      }),
    ).toThrow(RangeError);
  });
});

describe('sanitizeCsvFileNameBase', () => {
  it('removes Windows-illegal characters and collapses whitespace', () => {
    expect(sanitizeCsvFileNameBase('Report <2026>: "Q4"/test|data?*')).toBe(
      'Report _2026__ _Q4__test_data__',
    );
    expect(sanitizeCsvFileNameBase('  温度   记录  ')).toBe('温度 记录');
  });

  it('strips trailing dots and spaces and falls back for empty names', () => {
    expect(sanitizeCsvFileNameBase('name...')).toBe('name');
    expect(sanitizeCsvFileNameBase('...')).toBe('export');
    expect(sanitizeCsvFileNameBase('   ')).toBe('export');
  });

  it('avoids Windows reserved device names', () => {
    expect(sanitizeCsvFileNameBase('CON')).toBe('_CON');
    expect(sanitizeCsvFileNameBase('com1')).toBe('_com1');
    expect(sanitizeCsvFileNameBase('console')).toBe('console');
  });

  it('truncates long names without splitting surrogate pairs', () => {
    const base = sanitizeCsvFileNameBase('数'.repeat(100));
    expect(Array.from(base)).toHaveLength(80);
    const emoji = sanitizeCsvFileNameBase('😀'.repeat(100));
    expect(Array.from(emoji)).toHaveLength(80);
    expect(emoji).toBe('😀'.repeat(80));
  });
});

describe('csvExportFileName', () => {
  it('uses the local yyyyMMdd-HHmm stamp and a .csv suffix', () => {
    const now = new Date(2026, 9, 24, 16, 5, 59);
    expect(csvExportFileName('温度记录', now)).toBe('温度记录-20261024-1605.csv');
    expect(csvExportFileName('bad/name:*', now)).toBe('bad_name__-20261024-1605.csv');
  });

  it('pads single-digit months, days, hours and minutes', () => {
    const now = new Date(2026, 0, 2, 3, 4, 5);
    expect(csvExportFileName('T', now)).toBe('T-20260102-0304.csv');
  });
});
