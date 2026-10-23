/**
 * Table style -> CSS variable bridge (SPEC §10.2, T3.2).
 *
 * The grid never hard-codes a table colour, font or spacing: `styleToCssVars`
 * is the single conversion point and `TableStyleProvider` applies the result to
 * the table surface. CSS in `apps/desktop` only consumes these variables.
 */

import type { Density, TableStyle, TableStyleTokens } from '@curve/domain';

/** Every variable a table style can set. Tested against the grid stylesheet. */
export const TABLE_STYLE_CSS_VARIABLES = [
  '--cs-table-font-family',
  '--cs-table-font-size',
  '--cs-table-row-height',
  '--cs-table-cell-padding-x',
  '--cs-table-cell-padding-y',
  '--cs-table-radius',
  '--cs-table-header-bg',
  '--cs-table-header-fg',
  '--cs-table-header-border',
  '--cs-table-header-weight',
  '--cs-table-body-bg',
  '--cs-table-body-alt-bg',
  '--cs-table-body-fg',
  '--cs-table-body-border',
  '--cs-table-selection-bg',
  '--cs-table-selection-fg',
  '--cs-table-row-bg',
  '--cs-table-row-alt-bg',
  '--cs-table-grid-row-border',
  '--cs-table-grid-column-border',
] as const;

export type TableStyleCssVariable = (typeof TABLE_STYLE_CSS_VARIABLES)[number];

export type TableStyleCssVars = Record<TableStyleCssVariable, string>;

/** SPEC §10.2 fixes these three row heights for the density tokens. */
const DENSITY_ROW_HEIGHT: Record<Density, number> = {
  compact: 24,
  normal: 32,
  comfortable: 40,
};

/** CSS line-height used by `.cs-grid__cell`; keep the row-height math in sync. */
const TABLE_LINE_HEIGHT = 1.25;

/**
 * Uniform virtual row height for a style.
 *
 * The density table is the baseline, but a large font/padding combination may
 * need more room; growing instead of clipping keeps custom styles legible while
 * the builtin tokens keep the exact SPEC values (24/32/40).
 */
export function tableRowHeight(tokens: TableStyleTokens): number {
  const baseline = DENSITY_ROW_HEIGHT[tokens.density];
  const content = Math.ceil(tokens.fontSize * TABLE_LINE_HEIGHT) + tokens.cellPaddingY * 2;
  return Math.max(baseline, content);
}

/** Converts one resolved table style into the complete `--cs-table-*` set. */
export function styleToCssVars(style: TableStyle): TableStyleCssVars {
  const { tokens } = style;
  const rowHeight = tableRowHeight(tokens);

  return {
    '--cs-table-font-family': tokens.fontFamily,
    '--cs-table-font-size': `${String(tokens.fontSize)}px`,
    '--cs-table-row-height': `${String(rowHeight)}px`,
    '--cs-table-cell-padding-x': `${String(tokens.cellPaddingX)}px`,
    '--cs-table-cell-padding-y': `${String(tokens.cellPaddingY)}px`,
    '--cs-table-radius': `${String(tokens.radius)}px`,
    '--cs-table-header-bg': tokens.header.background,
    '--cs-table-header-fg': tokens.header.foreground,
    '--cs-table-header-border': tokens.header.borderColor,
    '--cs-table-header-weight': tokens.header.bold ? '600' : '400',
    '--cs-table-body-bg': tokens.body.background,
    '--cs-table-body-alt-bg': tokens.body.alternateBackground,
    '--cs-table-body-fg': tokens.body.foreground,
    '--cs-table-body-border': tokens.body.borderColor,
    '--cs-table-selection-bg': tokens.selection.background,
    '--cs-table-selection-fg': tokens.selection.foreground,
    '--cs-table-row-bg': tokens.body.background,
    '--cs-table-row-alt-bg': tokens.zebra
      ? tokens.body.alternateBackground
      : tokens.body.background,
    '--cs-table-grid-row-border': tokens.body.grid === 'none' ? '0px' : '1px',
    '--cs-table-grid-column-border': tokens.body.grid === 'all' ? '1px' : '0px',
  };
}
