import { describe, expect, it } from 'vitest';

import { CHART_THEMES, resolveChartTheme } from './theme';

describe('resolveChartTheme', () => {
  it('treats light backgrounds as the light theme', () => {
    expect(resolveChartTheme('#ffffff').mode).toBe('light');
    expect(resolveChartTheme('#fff').mode).toBe('light');
    expect(resolveChartTheme('rgb(250, 250, 250)').mode).toBe('light');
  });

  it('treats dark backgrounds as the dark theme', () => {
    expect(resolveChartTheme('#1e1e1e').mode).toBe('dark');
    expect(resolveChartTheme('#000').mode).toBe('dark');
    expect(resolveChartTheme('rgba(0, 0, 0, 0.8)').mode).toBe('dark');
  });

  it('supports #RRGGBBAA and mid greys', () => {
    expect(resolveChartTheme('#1e1e1eff').mode).toBe('dark');
    expect(resolveChartTheme('#777777').mode).toBe('dark');
    expect(resolveChartTheme('#cccccc').mode).toBe('light');
  });

  it('falls back to the light theme for unknown colour syntax', () => {
    expect(resolveChartTheme('transparent').mode).toBe('light');
    expect(resolveChartTheme('').mode).toBe('light');
    expect(resolveChartTheme('var(--cs-color-bg-surface)').mode).toBe('light');
    expect(resolveChartTheme('#12345').mode).toBe('light');
    expect(resolveChartTheme('rgb(1, 2)').mode).toBe('light');
    expect(resolveChartTheme('rgb(a, b, c)').mode).toBe('light');
  });

  it('exposes app-token colours for both themes', () => {
    expect(CHART_THEMES.light.mode).toBe('light');
    expect(CHART_THEMES.light.text).toBe('#17202e');
    expect(CHART_THEMES.light.mutedText).toBe('#475467');
    expect(CHART_THEMES.light.tooltipBackground).toBe('#ffffff');
    expect(CHART_THEMES.dark.mode).toBe('dark');
    expect(CHART_THEMES.dark.text).toBe('#e7edf5');
    expect(CHART_THEMES.dark.mutedText).toBe('#a9b4c4');
    expect(CHART_THEMES.dark.tooltipBackground).toBe('#1a212b');
  });

  it('returns both themes as frozen constants', () => {
    expect(Object.isFrozen(CHART_THEMES)).toBe(true);
    expect(Object.isFrozen(CHART_THEMES.light)).toBe(true);
    expect(Object.isFrozen(CHART_THEMES.dark)).toBe(true);
  });
});
