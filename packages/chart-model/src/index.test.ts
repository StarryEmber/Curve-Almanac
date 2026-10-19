import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '@curve/chart-model';

describe('@curve/chart-model package skeleton', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@curve/chart-model');
  });
});
