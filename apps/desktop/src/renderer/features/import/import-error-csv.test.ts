import { describe, expect, it } from 'vitest';

import { buildImportErrorCsv } from './import-error-csv';

describe('buildImportErrorCsv', () => {
  it('writes a UTF-8 BOM, CRLF and one row per bad data row', () => {
    const csv = buildImportErrorCsv([
      {
        row: 2,
        code: 'E_TYPE',
        value: 'oops',
        columnId: 'col_amount',
        columnName: 'amount',
        message: 'expects a number',
      },
      {
        row: 2,
        code: 'E_REQUIRED',
        value: '',
        columnId: 'col_name',
        columnName: 'name',
        message: 'required',
      },
      {
        row: 3,
        code: 'E_IMPORT_FORMAT',
        value: 'a,b',
        message: 'field count',
      },
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv).toContain(
      '"2","amount | name","E_TYPE | E_REQUIRED","oops | ","expects a number | required"',
    );
    expect(csv).toContain('"3","","E_IMPORT_FORMAT","a,b","field count"');
    expect(csv.split('\r\n').filter((line) => line.length > 0)).toHaveLength(3);
  });

  it('escapes embedded quotes', () => {
    const csv = buildImportErrorCsv([
      {
        row: 1,
        code: 'E_TYPE',
        value: 'say "hi"',
        message: 'bad',
      },
    ]);

    expect(csv).toContain('"say ""hi"""');
  });
});
