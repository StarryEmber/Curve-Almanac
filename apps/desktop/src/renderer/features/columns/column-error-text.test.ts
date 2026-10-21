import { describe, expect, it } from 'vitest';

import type { ColumnDraftIssue } from '@curve/app-core';

import { createTranslator } from '../../i18n';

import {
  columnFailureReasonText,
  columnFailureValueText,
  columnIssueText,
} from './column-error-text';

const t = createTranslator('zh-CN');

describe('column error text', () => {
  it('maps every draft issue reason to a message-table key', () => {
    const reasons: ColumnDraftIssue['reason'][] = [
      'required',
      'format',
      'range',
      'duplicate',
      'enum-empty',
      'enum-duplicate',
      'primary-key-type',
      'limit',
      'invalid',
    ];

    for (const reason of reasons) {
      const text = columnIssueText({ field: 'key', reason, message: 'internal' }, t);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toBe('internal');
    }
  });

  it('maps row failure codes and formats values', () => {
    expect(columnFailureReasonText('E_TYPE', t)).toBe('类型不匹配');
    expect(columnFailureReasonText('E_DUPLICATE_KEY', t)).toBe('重复');
    expect(columnFailureValueText(null, t)).toBe('（空）');
    expect(columnFailureValueText(true, t)).toBe('是');
    expect(columnFailureValueText('x'.repeat(50), t)).toBe(`${'x'.repeat(40)}…`);
  });
});
