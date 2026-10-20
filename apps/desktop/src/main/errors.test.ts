import { describe, expect, it } from 'vitest';

import { toAppError } from './errors';

describe('toAppError', () => {
  it('converts an Error into an E_UNKNOWN envelope', () => {
    expect(toAppError(new Error('IPC handler exploded'))).toEqual({
      code: 'E_UNKNOWN',
      message: 'IPC handler exploded',
    });
  });

  it('never leaks a stack trace or a detail field', () => {
    const error = new Error('boom');
    const result = toAppError(error);

    expect(result).not.toHaveProperty('detail');
    expect(result.message).not.toContain('at ');
    expect(result).not.toHaveProperty('stack');
  });

  it('accepts thrown strings and ignores empty ones', () => {
    expect(toAppError('disk full')).toEqual({ code: 'E_UNKNOWN', message: 'disk full' });
    expect(toAppError('   ')).toEqual({ code: 'E_UNKNOWN', message: 'Unexpected error' });
    expect(toAppError(new Error(''))).toEqual({ code: 'E_UNKNOWN', message: 'Unexpected error' });
  });

  it('falls back for non-error values', () => {
    expect(toAppError(undefined)).toEqual({ code: 'E_UNKNOWN', message: 'Unexpected error' });
    expect(toAppError({ reason: 'nope' })).toEqual({
      code: 'E_UNKNOWN',
      message: 'Unexpected error',
    });
  });
});
