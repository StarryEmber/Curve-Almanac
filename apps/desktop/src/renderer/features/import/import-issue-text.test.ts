import { describe, expect, it } from 'vitest';

import { createTranslator } from '../../i18n';

import { importIssueReason, importIssueText } from './import-issue-text';

const t = createTranslator('en-US');

describe('import issue text', () => {
  it('localises a cell issue with row, column and reason', () => {
    const text = importIssueText(
      {
        row: 4,
        code: 'E_REQUIRED',
        value: '',
        columnId: 'col_name',
        columnName: 'name',
        message: 'required',
      },
      t,
    );

    expect(text).toBe('Row 4 · name: required');
    expect(
      importIssueReason({ row: 4, code: 'E_DUPLICATE_KEY', value: 'a', message: 'x' }, t),
    ).toBe('duplicate primary key');
  });

  it('uses the row-format message for a whole-row issue', () => {
    const text = importIssueText(
      { row: 2, code: 'E_IMPORT_FORMAT', value: '', message: 'bad field count' },
      t,
    );

    expect(text).toBe('Row 2: field count does not match the header');
  });
});
