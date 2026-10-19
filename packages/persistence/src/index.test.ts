import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '@curve/persistence';

describe('@curve/persistence package skeleton', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@curve/persistence');
  });
});
