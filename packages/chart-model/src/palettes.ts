/**
 * Chart palettes and canvas backgrounds (T4.1, ADR-040).
 *
 * These are rendering suggestions only: they are never persisted and never part
 * of the manifest. The four palettes keep `RenderModel` library-agnostic while
 * giving the ECharts adapter (T4.3) and the inspector (T4.4) one fixed list.
 */

import type { ChartOptions } from '@curve/domain';

/** One of the four palettes a chart can select (SPEC §6.3). */
export type ChartPaletteId = ChartOptions['paletteId'];

/** Background option persisted on a chart. */
export type ChartBackgroundOption = ChartOptions['background'];

function freezePalette(colors: string[]): readonly string[] {
  return Object.freeze(colors);
}

/**
 * Eight-colour palettes. `colorblind` follows the Okabe–Ito safe palette; the
 * others are regular/muted/vivid variants of the same hue order so switching
 * palette keeps series↔hue intent.
 */
export const CHART_PALETTES: Record<ChartPaletteId, readonly string[]> = Object.freeze({
  default: freezePalette([
    '#2563eb',
    '#0d9488',
    '#7c3aed',
    '#db2777',
    '#ea580c',
    '#16a34a',
    '#ca8a04',
    '#475569',
  ]),
  muted: freezePalette([
    '#64748b',
    '#7f8c9b',
    '#8b7fa8',
    '#a97f95',
    '#b08b72',
    '#7f9b83',
    '#a39763',
    '#6b7280',
  ]),
  vivid: freezePalette([
    '#e11d48',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
  ]),
  colorblind: freezePalette([
    '#0072b2',
    '#e69f00',
    '#009e73',
    '#d55e00',
    '#cc79a7',
    '#56b4e9',
    '#f0e442',
    '#000000',
  ]),
});

/** Canvas colours used when the chart background is `auto` (ADR-040). */
export const CHART_BACKGROUNDS: Readonly<{ light: string; dark: string }> = Object.freeze({
  light: '#ffffff',
  dark: '#1e1e1e',
});

/** Caller-provided theme context for `background: 'auto'`. */
export interface ChartBackgroundOptions {
  theme?: 'light' | 'dark';
  /** Explicit canvas colour; wins over the theme and the persisted option. */
  background?: string;
}

/** Returns a mutable copy so callers cannot mutate the constants. */
export function resolvePalette(paletteId: ChartPaletteId): string[] {
  return [...CHART_PALETTES[paletteId]];
}

/**
 * Resolves the RenderModel background (ADR-040):
 * explicit override > theme (for `auto`) > persisted light/dark > light.
 */
export function resolveChartBackground(
  option: ChartBackgroundOption,
  options: ChartBackgroundOptions = {},
): string {
  if (options.background !== undefined) {
    return options.background;
  }
  if (option === 'light') {
    return CHART_BACKGROUNDS.light;
  }
  if (option === 'dark') {
    return CHART_BACKGROUNDS.dark;
  }
  return options.theme === 'dark' ? CHART_BACKGROUNDS.dark : CHART_BACKGROUNDS.light;
}
