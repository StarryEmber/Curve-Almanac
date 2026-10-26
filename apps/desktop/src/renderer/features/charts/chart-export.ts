/**
 * Pure helpers for the chart PNG export (T4.5, SPEC §11.6, ADR-044).
 *
 * The renderer owns the rasterisation (`toPNG`); these functions only turn the
 * result into the suggested file name and the base64 payload that
 * `file:exportText` accepts. No DOM, no IPC, no clock beyond the injected Date.
 */

/** SPEC §11.6: exported PNGs are always 2x. */
export const CHART_PNG_SCALE = 2;

/** Longest title portion of the suggested file name. */
export const CHART_FILE_BASE_MAX_LENGTH = 80;

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const ILLEGAL_FILE_CHARS = /[<>:"/\\|?*]/g;
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function removeControlCharacters(text: string): string {
  let result = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x20) {
      result += character;
    }
  }
  return result;
}

function stripTrailingDotsAndSpaces(text: string): string {
  return text.replace(/[. ]+$/u, '');
}

/**
 * Cleans the chart title for a file name. Invalid characters are replaced (not
 * silently dropped); trailing dots/spaces are removed and long titles are cut
 * by code point so emoji are not split.
 */
export function sanitizeChartFileBase(title: string): string {
  const normalized = removeControlCharacters(title.normalize('NFC'))
    .replace(ILLEGAL_FILE_CHARS, '_')
    .replace(/\s+/gu, ' ')
    .trim();
  const truncated = Array.from(stripTrailingDotsAndSpaces(normalized))
    .slice(0, CHART_FILE_BASE_MAX_LENGTH)
    .join('');
  const base = stripTrailingDotsAndSpaces(truncated);
  if (base.length === 0) {
    return 'chart';
  }
  if (WINDOWS_RESERVED_NAMES.has(base.toUpperCase())) {
    return `_${base}`;
  }
  return base;
}

/** `<title>-<yyyyMMdd-HHmm>.png`, using the machine's local time (SPEC §11.6). */
export function chartPngFileName(title: string, now: Date): string {
  const stamp = `${String(now.getFullYear()).padStart(4, '0')}${pad2(
    now.getMonth() + 1,
  )}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `${sanitizeChartFileBase(title)}-${stamp}.png`;
}

/**
 * Extracts the base64 payload from `renderer.toPNG()`'s data URL. Returns
 * `null` for empty/foreign/whitespace-containing payloads so the export
 * dialog can fail explicitly instead of writing a corrupt image.
 */
export function pngDataUrlToBase64(dataUrl: string): string | null {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    return null;
  }
  const base64 = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (base64.length === 0 || base64.length % 4 !== 0 || !BASE64_PATTERN.test(base64)) {
    return null;
  }
  return base64;
}
