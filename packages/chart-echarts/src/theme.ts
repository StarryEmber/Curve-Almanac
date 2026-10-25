/**
 * Canvas theme derived from the chart background (T4.3, ADR-042 §4).
 *
 * `RenderModel` carries one concrete `style.background` and no theme field, so
 * the adapter decides light/dark from the background's WCAG relative luminance.
 * The colours mirror the `@curve/ui` tokens; this package may not import
 * `@curve/ui` (SPEC §4.2), so the values are duplicated constants here.
 */

export type ChartThemeMode = 'light' | 'dark';

export interface ChartTheme {
  mode: ChartThemeMode;
  text: string;
  mutedText: string;
  axisLine: string;
  splitLine: string;
  tooltipBackground: string;
  tooltipBorder: string;
  zoomFill: string;
}

const LIGHT_THEME: ChartTheme = Object.freeze({
  mode: 'light',
  text: '#17202e',
  mutedText: '#475467',
  axisLine: '#d0d8e3',
  splitLine: '#e3e9f1',
  tooltipBackground: '#ffffff',
  tooltipBorder: '#d0d8e3',
  zoomFill: 'rgba(29, 78, 216, 0.12)',
});

const DARK_THEME: ChartTheme = Object.freeze({
  mode: 'dark',
  text: '#e7edf5',
  mutedText: '#a9b4c4',
  axisLine: '#33404f',
  splitLine: '#263140',
  tooltipBackground: '#1a212b',
  tooltipBorder: '#33404f',
  zoomFill: 'rgba(111, 164, 255, 0.18)',
});

/** Both canvas themes, frozen; keyed by mode. */
export const CHART_THEMES: Readonly<Record<ChartThemeMode, ChartTheme>> = Object.freeze({
  light: LIGHT_THEME,
  dark: DARK_THEME,
});

/** Luminance at or above which a background is treated as light. */
const LIGHT_LUMINANCE_THRESHOLD = 0.5;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, value));
}

function hexPair(digits: string, offset: number): number {
  return Number.parseInt(digits.slice(offset, offset + 2), 16);
}

function hexNibble(digits: string, index: number): number {
  const nibble = digits.slice(index, index + 1);
  return Number.parseInt(nibble + nibble, 16);
}

/** Parses `#RGB`, `#RGBA`, `#RRGGBB` and `#RRGGBBAA`. */
function parseHexColor(color: string): Rgb | null {
  const match = /^#([0-9a-f]{3,8})$/iu.exec(color.trim());
  const digits = match?.[1];
  if (digits === undefined) {
    return null;
  }
  if (digits.length === 3 || digits.length === 4) {
    return { r: hexNibble(digits, 0), g: hexNibble(digits, 1), b: hexNibble(digits, 2) };
  }
  if (digits.length === 6 || digits.length === 8) {
    return { r: hexPair(digits, 0), g: hexPair(digits, 2), b: hexPair(digits, 4) };
  }
  return null;
}

/** Parses comma and space separated `rgb()`/`rgba()` values. */
function parseRgbFunction(color: string): Rgb | null {
  const match = /^rgba?\((.*)\)$/iu.exec(color.trim());
  const body = match?.[1];
  if (body === undefined) {
    return null;
  }
  const channels = (body.split('/')[0] ?? '')
    .trim()
    .split(/[\s,]+/u)
    .filter((part) => part.length > 0);
  if (channels.length < 3) {
    return null;
  }
  const [red = '', green = '', blue = ''] = channels;
  const parsed = [red, green, blue].map((channel) => Number.parseFloat(channel));
  if (parsed.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [r = 0, g = 0, b = 0] = parsed;
  return { r: clampChannel(r), g: clampChannel(g), b: clampChannel(b) };
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * linearChannel(rgb.r) + 0.7152 * linearChannel(rgb.g) + 0.0722 * linearChannel(rgb.b)
  );
}

/**
 * Picks the canvas theme for one background colour (ADR-042 §4).
 *
 * Unknown colour syntax falls back to the light theme instead of guessing: the
 * background is already on the option as-is, so only axis/tooltip colours move.
 */
export function resolveChartTheme(background: string): ChartTheme {
  const rgb = parseHexColor(background) ?? parseRgbFunction(background);
  if (rgb === null) {
    return LIGHT_THEME;
  }
  return relativeLuminance(rgb) >= LIGHT_LUMINANCE_THRESHOLD ? LIGHT_THEME : DARK_THEME;
}
