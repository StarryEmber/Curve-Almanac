import { describe, expect, it } from 'vitest';

import { parseClipboardText } from './paste';

function expectMatrix(text: string, delimiter: 'tab' | 'comma', cells: string[][]): void {
  const result = parseClipboardText(text);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.data.delimiter).toBe(delimiter);
  expect(result.data.cells).toEqual(cells);
  expect(result.data.rows).toBe(cells.length);
  expect(result.data.columns).toBe(cells[0]?.length ?? 0);
  for (const row of result.data.cells) {
    expect(row).toHaveLength(result.data.columns);
  }
}

describe('parseClipboardText', () => {
  it('parses the Excel 5x4 TSV sample into a rectangular matrix', () => {
    const text = ['a\tb\tc\td', '1\t2\t3\t4', '5\t6\t7\t8', '9\t10\t11\t12', '13\t14\t15\t16'].join(
      '\r\n',
    );
    expectMatrix(text, 'tab', [
      ['a', 'b', 'c', 'd'],
      ['1', '2', '3', '4'],
      ['5', '6', '7', '8'],
      ['9', '10', '11', '12'],
      ['13', '14', '15', '16'],
    ]);
  });

  it('keeps quoted commas, tabs, doubled quotes and embedded newlines in one cell', () => {
    const text = [
      '"hello, world"\t"line one\nline two"\t"say ""hi"""\t"tab\tinside"',
      '"plain"\t"second"\t"third"\t"fourth"',
    ].join('\r\n');
    expectMatrix(text, 'tab', [
      ['hello, world', 'line one\nline two', 'say "hi"', 'tab\tinside'],
      ['plain', 'second', 'third', 'fourth'],
    ]);
  });

  it('falls back to CSV when the TSV parse has one column and the text contains commas', () => {
    expectMatrix('a,b,c\r\n1,2,3', 'comma', [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps a quoted comma inside a single CSV cell', () => {
    expectMatrix('"a,b"\r\n"c,d"', 'tab', [['a,b'], ['c,d']]);
  });

  it('prefers TSV whenever it yields more than one column', () => {
    expectMatrix('a\tb,c\r\n1\t2,3', 'tab', [
      ['a', 'b,c'],
      ['1', '2,3'],
    ]);
  });

  it('drops one trailing line terminator and accepts CRLF, LF and CR', () => {
    expectMatrix('a\tb\r\n', 'tab', [['a', 'b']]);
    expectMatrix('a\tb\n', 'tab', [['a', 'b']]);
    expectMatrix('a\tb\r', 'tab', [['a', 'b']]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expectMatrix('\uFEFFa\tb', 'tab', [['a', 'b']]);
  });

  it('pads ragged rows to the widest row', () => {
    expectMatrix('a\tb\tc\r\nd', 'tab', [
      ['a', 'b', 'c'],
      ['d', '', ''],
    ]);
  });

  it('preserves empty cells and a trailing delimiter', () => {
    expectMatrix('a\t\tc\t', 'tab', [['a', '', 'c', '']]);
    expectMatrix('""\t""', 'tab', [['', '']]);
  });

  it('treats an empty clipboard and a lone newline as no matrix', () => {
    for (const text of ['', '\n', '\r\n']) {
      const result = parseClipboardText(text);
      expect(result).toEqual({
        ok: true,
        data: { delimiter: 'tab', cells: [], rows: 0, columns: 0 },
      });
    }
  });

  it('keeps an intentional blank line between rows', () => {
    expectMatrix('a\n\nb', 'tab', [['a'], [''], ['b']]);
  });

  it('treats a quote in the middle of an unquoted field literally', () => {
    expectMatrix('a"b\tc', 'tab', [['a"b', 'c']]);
  });

  it('rejects an unterminated quoted field instead of returning a partial matrix', () => {
    const result = parseClipboardText('"a\tb');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('E_IMPORT_FORMAT');
    }
  });

  it('parses a 10k-cell matrix without dropping data', () => {
    const rows = Array.from({ length: 100 }, (_, rowIndex) =>
      Array.from(
        { length: 100 },
        (_, columnIndex) => `r${String(rowIndex)}c${String(columnIndex)}`,
      ).join('\t'),
    );
    const result = parseClipboardText(rows.join('\n'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rows).toBe(100);
      expect(result.data.columns).toBe(100);
      expect(result.data.cells[99]?.[99]).toBe('r99c99');
    }
  });
});
