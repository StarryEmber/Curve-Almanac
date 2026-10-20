import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@curve/domain';

import { describeAppError } from './error-text';
import { createTranslator } from './i18n';

const en = createTranslator('en-US');
const zh = createTranslator('zh-CN');

describe('describeAppError', () => {
  it('maps a known code to localised text and keeps the code', () => {
    const text = describeAppError({ code: 'E_IPC_INVALID_PAYLOAD', message: 'Zod says no.' }, en);

    expect(text).toContain('could not be understood');
    expect(text).toContain('E_IPC_INVALID_PAYLOAD');
  });

  it('never repeats the developer message or detail', () => {
    const text = describeAppError(
      { code: 'E_FS_WRITE', message: 'SECRET developer message', detail: 'C:/secret/path' },
      en,
    );

    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('secret/path');
  });

  it('has a message for every SPEC §18 error code', () => {
    for (const code of ERROR_CODES) {
      const text = describeAppError({ code, message: 'diagnostic' }, en);
      expect(text, code).toContain(code);
      expect(text.length, code).toBeGreaterThan(code.length + 4);
    }
  });

  it('switches language with the translator', () => {
    const error = { code: 'E_WS_LOCKED', message: 'locked' } as const;

    expect(describeAppError(error, zh)).toContain('另一个窗口');
    expect(describeAppError(error, en)).toContain('another window');
  });
});
