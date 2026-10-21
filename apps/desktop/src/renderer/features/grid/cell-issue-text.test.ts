import { describe, expect, it } from 'vitest';

import type { CellIssue } from '@curve/app-core';

import { createTranslator } from '../../i18n';

import { describeCellIssue } from './cell-issue-text';

const t = createTranslator('zh-CN');

describe('describeCellIssue', () => {
  it('localises the location and the reason for a regular cell issue', () => {
    const issue: CellIssue = {
      reason: 'type',
      code: 'E_TYPE',
      columnId: 'col_value',
      rowNumber: 3,
      message: 'developer message',
    };
    const text = describeCellIssue(issue, t, 'Amount');
    expect(text).toBe('第 3 行 · 列 Amount：类型不匹配');
    expect(text).not.toContain('developer message');
  });

  it('names the conflicting row for a duplicate primary key', () => {
    const issue: CellIssue = {
      reason: 'duplicate-key',
      code: 'E_DUPLICATE_KEY',
      columnId: 'col_id',
      rowNumber: 4,
      conflictRowNumber: 2,
      conflictRowId: 'row_2',
      message: 'duplicate',
    };
    expect(describeCellIssue(issue, t, 'ID')).toBe('第 4 行 · 列 ID：与第 2 行冲突');
  });

  it('falls back to the reason when the column label is unknown', () => {
    const issue: CellIssue = {
      reason: 'unknown',
      code: 'E_UNKNOWN',
      message: 'boom',
    };
    expect(describeCellIssue(issue, t)).toBe('无法保存该值');
  });

  it('uses the English table when the locale is en-US', () => {
    const en = createTranslator('en-US');
    const issue: CellIssue = {
      reason: 'required',
      code: 'E_VALIDATION',
      columnId: 'col_id',
      rowNumber: 1,
      message: 'required',
    };
    expect(describeCellIssue(issue, en, 'ID')).toBe('Row 1 · Column ID: This column is required');
  });
});
