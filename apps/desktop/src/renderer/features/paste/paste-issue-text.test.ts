import { describe, expect, it } from 'vitest';

import type { PasteIssue } from '@curve/app-core';

import { createTranslator } from '../../i18n';

import { describePasteIssue, pasteIssueColumnLabel } from './paste-issue-text';

const t = createTranslator('zh-CN');

function issue(overrides: Partial<PasteIssue> = {}): PasteIssue {
  return {
    reason: 'type',
    code: 'E_TYPE',
    columnId: 'col_amount',
    rowNumber: 2,
    matrixRow: 1,
    matrixColumn: 0,
    value: 'abc',
    message: 'column "amount" expects a number',
    ...overrides,
  };
}

describe('describePasteIssue', () => {
  it('formats a cell error with row, localised column and reason', () => {
    expect(describePasteIssue(issue(), { t, columnLabel: 'Amount' })).toBe(
      '第 2 行 · 列 Amount：类型不匹配（值：abc）',
    );
  });

  it('uses the empty marker for an empty pasted value', () => {
    expect(describePasteIssue(issue({ value: '' }), { t, columnLabel: 'Amount' })).toContain(
      '（空）',
    );
  });

  it('adds the conflicting row for a duplicate key', () => {
    expect(
      describePasteIssue(
        issue({ reason: 'duplicate-key', code: 'E_DUPLICATE_KEY', conflictRowNumber: 4 }),
        { t, columnLabel: 'ID' },
      ),
    ).toContain('与第 4 行冲突');
  });

  it('formats a missing required column without a matrix column', () => {
    expect(
      describePasteIssue(
        issue({ reason: 'required', code: 'E_VALIDATION', matrixColumn: -1, value: '' }),
        { t, columnLabel: 'Name' },
      ),
    ).toBe('第 2 行：列 Name 未提供（必填）');
  });

  it('falls back to the column id when no label is known', () => {
    const labels = new Map([['col_amount', 'Amount']]);
    expect(pasteIssueColumnLabel(issue(), labels)).toBe('Amount');
    expect(pasteIssueColumnLabel(issue({ columnId: 'col_missing' }), labels)).toBe('col_missing');
    expect(pasteIssueColumnLabel(issue({ columnId: undefined }), labels)).toBeUndefined();
  });
});
