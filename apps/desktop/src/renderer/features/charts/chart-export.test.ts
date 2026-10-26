import { describe, expect, it } from 'vitest';

import {
  CHART_PNG_SCALE,
  chartPngFileName,
  pngDataUrlToBase64,
  sanitizeChartFileBase,
} from './chart-export';

const AT = new Date(2026, 9, 26, 9, 5, 0);

describe('sanitizeChartFileBase', () => {
  it('replaces path-unsafe characters and collapses whitespace', () => {
    expect(sanitizeChartFileBase('Sales / Load: 2026?')).toBe('Sales _ Load_ 2026_');
    expect(sanitizeChartFileBase('  spaced   name  ')).toBe('spaced name');
  });

  it('strips control characters and trailing dots/spaces', () => {
    expect(sanitizeChartFileBase('a\u0000b\u001fc. . ')).toBe('abc');
  });

  it('falls back to chart for empty/whitespace titles', () => {
    expect(sanitizeChartFileBase('')).toBe('chart');
    expect(sanitizeChartFileBase(' ... ')).toBe('chart');
  });

  it('escapes Windows reserved device names and truncates long titles', () => {
    expect(sanitizeChartFileBase('CON')).toBe('_CON');
    expect(sanitizeChartFileBase('con')).toBe('_con');
    expect(Array.from(sanitizeChartFileBase('x'.repeat(120)))).toHaveLength(80);
  });

  it('does not split surrogate pairs when truncating', () => {
    const title = `${'x'.repeat(79)}😀tail`;
    const base = sanitizeChartFileBase(title);
    expect(Array.from(base)).toHaveLength(80);
    expect(base.endsWith('😀')).toBe(true);
  });
});

describe('chartPngFileName', () => {
  it('formats <title>-<yyyyMMdd-HHmm>.png in local time', () => {
    expect(chartPngFileName('Sales chart', AT)).toBe('Sales chart-20261026-0905.png');
    expect(chartPngFileName('Bad/Name', AT)).toBe('Bad_Name-20261026-0905.png');
    expect(chartPngFileName('', AT)).toBe('chart-20261026-0905.png');
  });

  it('exports at the SPEC-mandated 2x scale', () => {
    expect(CHART_PNG_SCALE).toBe(2);
  });
});

describe('pngDataUrlToBase64', () => {
  it('extracts a standard PNG base64 payload', () => {
    expect(pngDataUrlToBase64('data:image/png;base64,iVBORw0KGgo=')).toBe('iVBORw0KGgo=');
  });

  it('rejects foreign, empty and malformed data URLs', () => {
    expect(pngDataUrlToBase64('')).toBeNull();
    expect(pngDataUrlToBase64('data:image/jpeg;base64,AAAA')).toBeNull();
    expect(pngDataUrlToBase64('data:image/png;base64,')).toBeNull();
    expect(pngDataUrlToBase64('data:image/png;base64,AAA')).toBeNull();
    expect(pngDataUrlToBase64('data:image/png;base64,AA AA')).toBeNull();
    expect(pngDataUrlToBase64('data:image/png;base64,AA$A')).toBeNull();
  });
});
