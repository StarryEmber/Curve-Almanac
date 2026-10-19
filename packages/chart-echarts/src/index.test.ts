import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '@curve/chart-echarts';

describe('@curve/chart-echarts package skeleton', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@curve/chart-echarts');
  });
});
