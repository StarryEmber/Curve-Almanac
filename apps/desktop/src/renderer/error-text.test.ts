import { describe, expect, it } from 'vitest';

import { describeAppError } from './error-text';

describe('describeAppError', () => {
  it('maps a known code to user-facing text', () => {
    const text = describeAppError({ code: 'E_IPC_INVALID_PAYLOAD', message: 'Zod says no.' });

    expect(text).toContain('could not be understood');
    expect(text).toContain('E_IPC_INVALID_PAYLOAD');
  });

  it('never repeats the developer message or detail', () => {
    const text = describeAppError({
      code: 'E_FS_WRITE',
      message: 'SECRET developer message',
      detail: 'C:/secret/path',
    });

    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('secret/path');
  });

  it('falls back for a code without a dedicated message but keeps the code', () => {
    const text = describeAppError({ code: 'E_WS_BUSY', message: 'busy' });

    expect(text).toContain('Something went wrong');
    expect(text).toContain('E_WS_BUSY');
  });
});
