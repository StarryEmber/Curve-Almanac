import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '@curve/app-core';
import { PACKAGE_NAME as DOMAIN_PACKAGE } from '@curve/domain';

describe('@curve/app-core package skeleton', () => {
  it('exposes its package identity and resolves its domain dependency', () => {
    expect(PACKAGE_NAME).toBe('@curve/app-core');
    expect(DOMAIN_PACKAGE).toBe('@curve/domain');
  });
});
