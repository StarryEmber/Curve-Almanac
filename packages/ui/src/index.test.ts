import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '@curve/ui';

describe('@curve/ui package skeleton', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@curve/ui');
  });
});
