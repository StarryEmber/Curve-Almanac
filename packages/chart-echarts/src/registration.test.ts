import { use } from 'echarts/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('echarts/core', () => ({ init: vi.fn(), use: vi.fn() }));

import { areEChartsModulesRegistered, registerEChartsModules } from './registration';

describe('registerEChartsModules', () => {
  it('registers the three charts, five components and the canvas renderer exactly once', () => {
    expect(areEChartsModulesRegistered()).toBe(false);

    registerEChartsModules();
    expect(areEChartsModulesRegistered()).toBe(true);
    expect(use).toHaveBeenCalledTimes(1);

    const installers = vi.mocked(use).mock.calls[0]?.[0];
    expect(Array.isArray(installers)).toBe(true);
    expect(installers).toHaveLength(9);

    registerEChartsModules();
    expect(use).toHaveBeenCalledTimes(1);
  });
});
