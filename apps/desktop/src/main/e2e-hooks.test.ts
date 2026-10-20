import { describe, expect, it } from 'vitest';

import { E2E_FLAG_ENV, E2E_USER_DATA_ENV, resolveE2EUserDataPath } from './e2e-hooks';

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
