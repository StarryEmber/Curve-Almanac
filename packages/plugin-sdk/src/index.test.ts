import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '@curve/plugin-sdk';

describe('@curve/plugin-sdk package skeleton', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@curve/plugin-sdk');
  });
});
