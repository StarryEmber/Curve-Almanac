import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '@curve/desktop';

describe('@curve/desktop package skeleton', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@curve/desktop');
  });
});
