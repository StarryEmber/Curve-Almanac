import { describe, expect, it } from 'vitest';

import {
  BUILTIN_STYLE_IDS,
  DEFAULT_TABLE_STYLE,
  DEFAULT_TABLE_STYLE_TOKENS,
  createTableStyle,
  getBuiltinStyle,
} from '@curve/domain';

import { TABLE_STYLE_CSS_VARIABLES, styleToCssVars, tableRowHeight } from './table-style';

const expectedReportLightVars = {
  '--cs-table-font-family': 'system-ui',
  '--cs-table-font-size': '13px',
  '--cs-table-row-height': '32px',
  '--cs-table-cell-padding-x': '10px',
  '--cs-table-cell-padding-y': '7px',
  '--cs-table-radius': '4px',
  '--cs-table-header-bg': '#374151',
  '--cs-table-header-fg': '#ffffff',
  '--cs-table-header-border': '#d1d5db',
  '--cs-table-header-weight': '600',
  '--cs-table-body-bg': '#ffffff',
  '--cs-table-body-alt-bg': '#f9fafb',
  '--cs-table-body-fg': '#111827',
  '--cs-table-body-border': '#d1d5db',
  '--cs-table-selection-bg': '#1d4ed8',
  '--cs-table-selection-fg': '#ffffff',
  '--cs-table-row-bg': '#ffffff',
  '--cs-table-row-alt-bg': '#ffffff',
  '--cs-table-grid-row-border': '1px',
  '--cs-table-grid-column-border': '0px',
} as const;

describe('styleToCssVars', () => {
  it('maps report-light to the full CSS variable contract', () => {
    const vars = styleToCssVars(DEFAULT_TABLE_STYLE);

    expect(vars).toEqual(expectedReportLightVars);
    expect(Object.keys(vars).sort()).toEqual([...TABLE_STYLE_CSS_VARIABLES].sort());
  });

  it('maps every builtin to a distinct variable set', () => {
    const signatures = BUILTIN_STYLE_IDS.map((id) => {
      const style = getBuiltinStyle(id);
      expect(style, id).toBeDefined();
      return JSON.stringify(styleToCssVars(style ?? DEFAULT_TABLE_STYLE));
    });

    expect(new Set(signatures).size).toBe(BUILTIN_STYLE_IDS.length);
  });

  it('maps compact density to the 24px row height and 12px font', () => {
    const style = getBuiltinStyle('builtin.compact-light');
    expect(style).toBeDefined();
    const vars = styleToCssVars(style ?? DEFAULT_TABLE_STYLE);

    expect(vars['--cs-table-row-height']).toBe('24px');
    expect(vars['--cs-table-font-size']).toBe('12px');
    expect(vars['--cs-table-radius']).toBe('0px');
  });

  it('maps dark to its explicit palette instead of the app theme tokens', () => {
    const style = getBuiltinStyle('builtin.dark');
    expect(style).toBeDefined();
    const vars = styleToCssVars(style ?? DEFAULT_TABLE_STYLE);

    expect(vars['--cs-table-body-bg']).toBe('#1e1e1e');
    expect(vars['--cs-table-body-fg']).toBe('#d4d4d4');
    expect(vars['--cs-table-header-bg']).toBe('#252526');
  });

  it('expresses finance with monospace and zebra tokens', () => {
    const style = getBuiltinStyle('builtin.finance');
    expect(style).toBeDefined();
    const vars = styleToCssVars(style ?? DEFAULT_TABLE_STYLE);

    expect(vars['--cs-table-font-family']).toContain('monospace');
    expect(vars['--cs-table-row-alt-bg']).toBe('#eef2f7');
    expect(vars['--cs-table-row-alt-bg']).not.toBe(vars['--cs-table-body-bg']);
  });

  it('turns grid modes into row and column border widths', () => {
    const none = createTableStyle({
      name: 'No grid',
      tokens: {
        ...DEFAULT_TABLE_STYLE_TOKENS,
        body: { ...DEFAULT_TABLE_STYLE_TOKENS.body, grid: 'none' },
      },
    });
    const all = createTableStyle({
      name: 'All grid',
      tokens: {
        ...DEFAULT_TABLE_STYLE_TOKENS,
        body: { ...DEFAULT_TABLE_STYLE_TOKENS.body, grid: 'all' },
      },
    });

    expect(styleToCssVars(none)['--cs-table-grid-row-border']).toBe('0px');
    expect(styleToCssVars(none)['--cs-table-grid-column-border']).toBe('0px');
    expect(styleToCssVars(all)['--cs-table-grid-row-border']).toBe('1px');
    expect(styleToCssVars(all)['--cs-table-grid-column-border']).toBe('1px');
  });

  it('uses the alternate background only when zebra is on', () => {
    const zebra = createTableStyle({
      name: 'Zebra',
      tokens: { ...DEFAULT_TABLE_STYLE_TOKENS, zebra: true },
    });

    expect(styleToCssVars(zebra)['--cs-table-row-alt-bg']).toBe(
      DEFAULT_TABLE_STYLE_TOKENS.body.alternateBackground,
    );
    expect(styleToCssVars(DEFAULT_TABLE_STYLE)['--cs-table-row-alt-bg']).toBe(
      DEFAULT_TABLE_STYLE_TOKENS.body.background,
    );
  });
});

describe('tableRowHeight', () => {
  it('keeps the SPEC density heights for the builtin tokens', () => {
    const compact = getBuiltinStyle('builtin.compact-light');
    const dark = getBuiltinStyle('builtin.dark');
    const comfortable = createTableStyle({
      name: 'Comfortable',
      tokens: { ...DEFAULT_TABLE_STYLE_TOKENS, density: 'comfortable' },
    });

    expect(tableRowHeight(DEFAULT_TABLE_STYLE_TOKENS)).toBe(32);
    expect(compact === undefined ? 0 : tableRowHeight(compact.tokens)).toBe(24);
    expect(dark === undefined ? 0 : tableRowHeight(dark.tokens)).toBe(32);
    expect(tableRowHeight(comfortable.tokens)).toBe(40);
  });

  it('grows when a larger font and padding would clip the content', () => {
    const style = createTableStyle({
      name: 'Roomy',
      tokens: {
        ...DEFAULT_TABLE_STYLE_TOKENS,
        density: 'compact',
        fontSize: 18,
        cellPaddingY: 16,
      },
    });

    expect(tableRowHeight(style.tokens)).toBe(55);
    expect(styleToCssVars(style)['--cs-table-row-height']).toBe('55px');
  });
});
