import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '@curve/domain';

describe('@curve/domain package skeleton', () => {
  it('resolves through the @curve path alias inside Vitest', () => {
    expect(PACKAGE_NAME).toBe('@curve/domain');
  });
});
