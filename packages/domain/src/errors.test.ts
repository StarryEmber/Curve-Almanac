import { describe, expect, it } from 'vitest';

import { ERROR_CODES, appErrorSchema, createAppError, isAppError, toAppError } from './errors';

/** SPEC §18, transcribed independently so a typo or a dropped code fails here. */
const SPEC_ERROR_CODES = [
  'E_WS_NOT_FOUND',
  'E_WS_INVALID_MANIFEST',
  'E_WS_VERSION_UNSUPPORTED',
  'E_WS_LOCKED',
  'E_WS_BUSY',
  'E_MIGRATION_FAILED',
  'E_TABLE_NOT_FOUND',
  'E_TABLE_PARSE',
  'E_TABLE_LIMIT',
  'E_IMPORT_ENCODING',
  'E_IMPORT_FORMAT',
  'E_IMPORT_ABORTED',
  'E_VALIDATION',
  'E_DUPLICATE_KEY',
  'E_TYPE',
  'E_PATH_DENIED',
  'E_FS_READ',
  'E_FS_WRITE',
  'E_BACKUP_NOT_FOUND',
  'E_IPC_INVALID_PAYLOAD',
  'E_PAYLOAD_TOO_LARGE',
  'E_PLUGIN_INVALID',
  'E_PLUGIN_INCOMPATIBLE',
  'E_PLUGIN_ACTIVATE',
  'E_EXPORT_FAILED',
  'E_UNKNOWN',
] as const;

describe('ERROR_CODES', () => {
  it('matches the SPEC §18 list exactly and in order', () => {
    expect([...ERROR_CODES]).toEqual([...SPEC_ERROR_CODES]);
  });

  it('contains no duplicates', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe('appErrorSchema', () => {
  it('accepts the minimal envelope', () => {
    expect(appErrorSchema.safeParse({ code: 'E_UNKNOWN', message: 'boom' }).success).toBe(true);
  });

  it('accepts detail and retryable', () => {
    const parsed = appErrorSchema.safeParse({
      code: 'E_FS_WRITE',
      message: 'Could not write the table.',
      detail: 'EPERM',
      retryable: true,
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown code', () => {
    expect(appErrorSchema.safeParse({ code: 'E_NOPE', message: 'boom' }).success).toBe(false);
  });

  it('rejects an empty message', () => {
    expect(appErrorSchema.safeParse({ code: 'E_UNKNOWN', message: '' }).success).toBe(false);
  });

  it('rejects fields outside the envelope, such as a stack trace', () => {
    expect(
      appErrorSchema.safeParse({ code: 'E_UNKNOWN', message: 'boom', stack: 'at foo' }).success,
    ).toBe(false);
  });
});

describe('createAppError', () => {
  it('omits optional fields that were not supplied', () => {
    expect(createAppError('E_VALIDATION', 'Value rejected.')).toEqual({
      code: 'E_VALIDATION',
      message: 'Value rejected.',
    });
  });

  it('keeps detail and retryable when supplied', () => {
    expect(
      createAppError('E_PATH_DENIED', 'Outside the workspace.', {
        detail: 'C:/elsewhere',
        retryable: false,
      }),
    ).toEqual({
      code: 'E_PATH_DENIED',
      message: 'Outside the workspace.',
      detail: 'C:/elsewhere',
      retryable: false,
    });
  });
});

describe('isAppError', () => {
  it('accepts a well-formed envelope', () => {
    expect(isAppError({ code: 'E_UNKNOWN', message: 'boom' })).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError('boom')).toBe(false);
    expect(isAppError(new Error('boom'))).toBe(false);
    expect(isAppError({ code: 'E_UNKNOWN' })).toBe(false);
    expect(isAppError({ code: 'E_NOPE', message: 'boom' })).toBe(false);
  });
});

describe('toAppError', () => {
  it('keeps a well-formed envelope unchanged', () => {
    const error = {
      code: 'E_WS_LOCKED',
      message: 'Workspace is locked.',
      retryable: true,
    } as const;

    expect(toAppError(error)).toEqual(error);
  });

  it('converts an Error into E_UNKNOWN without leaking the stack', () => {
    const result = toAppError(new Error('IPC handler exploded'));

    expect(result).toEqual({ code: 'E_UNKNOWN', message: 'IPC handler exploded' });
    expect(result).not.toHaveProperty('stack');
    expect(result).not.toHaveProperty('detail');
  });

  it('accepts thrown strings and ignores blanks', () => {
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

  it('strips fields that are not part of the envelope', () => {
    const result = toAppError({ code: 'E_TYPE', message: 'Wrong type.', stack: 'at foo' });

    expect(result).toEqual({ code: 'E_UNKNOWN', message: 'Unexpected error' });
  });
});
