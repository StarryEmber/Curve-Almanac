import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME as DOMAIN_PACKAGE } from '@curve/domain';
import { PACKAGE_NAME } from '@curve/table-engine';

describe('@curve/table-engine package skeleton', () => {
  it('resolves its own alias and the workspace dependency on @curve/domain', () => {
    expect(PACKAGE_NAME).toBe('@curve/table-engine');
    expect(DOMAIN_PACKAGE).toBe('@curve/domain');
  });
});
