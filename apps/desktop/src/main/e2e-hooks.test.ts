import { describe, expect, it } from 'vitest';

import {
  E2E_DIALOG_DIRECTORY_ENV,
  E2E_DIALOG_SAVE_ENV,
  E2E_FLAG_ENV,
  E2E_IMPORT_FILE_ENV,
  E2E_QUIT_CONFIRM_ENV,
  E2E_USER_DATA_ENV,
  resolveE2EDialogStubs,
  resolveE2EQuitConfirm,
  resolveE2EUserDataPath,
} from './e2e-hooks';

const env = (values: Record<string, string>): Record<string, string | undefined> => ({ ...values });

describe('resolveE2EUserDataPath', () => {
  it('returns the override for an unpackaged run started by the E2E suite', () => {
    expect(
      resolveE2EUserDataPath({
        isPackaged: false,
        env: env({ [E2E_FLAG_ENV]: '1', [E2E_USER_DATA_ENV]: 'C:\\temp\\curve-e2e' }),
      }),
    ).toBe('C:\\temp\\curve-e2e');
  });

  it('ignores the override in packaged builds even when the variables are set', () => {
    expect(
      resolveE2EUserDataPath({
        isPackaged: true,
        env: env({ [E2E_FLAG_ENV]: '1', [E2E_USER_DATA_ENV]: 'C:\\temp\\curve-e2e' }),
      }),
    ).toBeNull();
  });

  it('ignores the override without the explicit E2E flag', () => {
    expect(
      resolveE2EUserDataPath({
        isPackaged: false,
        env: env({ [E2E_USER_DATA_ENV]: 'C:\\temp\\curve-e2e' }),
      }),
    ).toBeNull();
    expect(
      resolveE2EUserDataPath({
        isPackaged: false,
        env: env({ [E2E_FLAG_ENV]: 'true', [E2E_USER_DATA_ENV]: 'C:\\temp\\curve-e2e' }),
      }),
    ).toBeNull();
  });

  it('ignores empty or blank directories', () => {
    expect(
      resolveE2EUserDataPath({
        isPackaged: false,
        env: env({ [E2E_FLAG_ENV]: '1', [E2E_USER_DATA_ENV]: '   ' }),
      }),
    ).toBeNull();
    expect(
      resolveE2EUserDataPath({ isPackaged: false, env: env({ [E2E_FLAG_ENV]: '1' }) }),
    ).toBeNull();
  });
});

describe('resolveE2EDialogStubs', () => {
  const dialogEnv = {
    [E2E_FLAG_ENV]: '1',
    [E2E_DIALOG_DIRECTORY_ENV]: 'C:\\ws',
    [E2E_DIALOG_SAVE_ENV]: 'C:\\ws\\out.csv',
    [E2E_IMPORT_FILE_ENV]: 'C:\\fixtures\\small.csv',
  };

  it('returns the configured paths for an unpackaged E2E run', () => {
    expect(resolveE2EDialogStubs({ isPackaged: false, env: env(dialogEnv) })).toEqual({
      directory: 'C:\\ws',
      savePath: 'C:\\ws\\out.csv',
      importPath: 'C:\\fixtures\\small.csv',
    });
  });

  it('is disabled in packaged builds even when the variables are set', () => {
    expect(resolveE2EDialogStubs({ isPackaged: true, env: env(dialogEnv) })).toBeNull();
  });

  it('is disabled without the explicit E2E flag', () => {
    const { [E2E_FLAG_ENV]: _flag, ...withoutFlag } = dialogEnv;

    expect(resolveE2EDialogStubs({ isPackaged: false, env: env(withoutFlag) })).toBeNull();
  });

  it('keeps unset paths null and ignores blanks', () => {
    expect(
      resolveE2EDialogStubs({
        isPackaged: false,
        env: env({ [E2E_FLAG_ENV]: '1', [E2E_DIALOG_DIRECTORY_ENV]: '   ' }),
      }),
    ).toEqual({ directory: null, savePath: null, importPath: null });
  });
});

describe('resolveE2EQuitConfirm', () => {
  it('answers the quit-time confirmation only for an unpackaged E2E run', () => {
    expect(
      resolveE2EQuitConfirm({
        isPackaged: false,
        env: env({ [E2E_FLAG_ENV]: '1', [E2E_QUIT_CONFIRM_ENV]: 'quit' }),
      }),
    ).toBe(true);
    expect(
      resolveE2EQuitConfirm({
        isPackaged: false,
        env: env({ [E2E_FLAG_ENV]: '1', [E2E_QUIT_CONFIRM_ENV]: 'cancel' }),
      }),
    ).toBe(false);
  });

  it('returns null without the flag, in packaged builds or for unknown values', () => {
    expect(
      resolveE2EQuitConfirm({
        isPackaged: true,
        env: env({ [E2E_FLAG_ENV]: '1', [E2E_QUIT_CONFIRM_ENV]: 'quit' }),
      }),
    ).toBeNull();
    expect(
      resolveE2EQuitConfirm({
        isPackaged: false,
        env: env({ [E2E_QUIT_CONFIRM_ENV]: 'quit' }),
      }),
    ).toBeNull();
    expect(
      resolveE2EQuitConfirm({
        isPackaged: false,
        env: env({ [E2E_FLAG_ENV]: '1', [E2E_QUIT_CONFIRM_ENV]: 'maybe' }),
      }),
    ).toBeNull();
  });
});
