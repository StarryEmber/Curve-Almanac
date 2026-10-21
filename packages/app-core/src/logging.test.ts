import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppError } from '@curve/domain';

import { defaultAppLogger } from './logging';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('defaultAppLogger', () => {
  it('writes errors and warnings to the runtime console', () => {
    const fakeConsole = { error: vi.fn(), warn: vi.fn() };
    vi.stubGlobal('console', fakeConsole);
    const error = createAppError('E_UNKNOWN', 'boom');

    defaultAppLogger.error('command failed', error);
    defaultAppLogger.warn('decode warning', 'line 2');

    expect(fakeConsole.error).toHaveBeenCalledWith('[app-core] command failed', error);
    expect(fakeConsole.warn).toHaveBeenCalledWith('[app-core] decode warning', 'line 2');
  });

  it('is a no-op when the runtime has no console', () => {
    vi.stubGlobal('console', undefined);

    expect(() => {
      defaultAppLogger.error('command failed', createAppError('E_UNKNOWN', 'boom'));
    }).not.toThrow();
    expect(() => {
      defaultAppLogger.warn('decode warning', 'line 2');
    }).not.toThrow();
  });
});
