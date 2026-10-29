import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { APP_NAME } from '../shared/brand';

import { WINDOW_TITLE } from './window-options';

/**
 * The two static identity files (T6.0, ADR-051) cannot import `APP_NAME`, so
 * this test is the guard that keeps `productName` and the HTML `<title>` in
 * sync with the constant. The message tables are covered by `i18n.test.ts`.
 */
function readText(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('product branding (T6.0, ADR-051)', () => {
  it('pins the shipped name', () => {
    expect(APP_NAME).toBe('Curve Almanac');
  });

  it('keeps productName, the window title and the HTML title in sync', () => {
    const manifest = JSON.parse(readText('../../package.json')) as { productName?: string };

    expect(manifest.productName).toBe(APP_NAME);
    expect(WINDOW_TITLE).toBe(APP_NAME);
    expect(readText('../renderer/index.html')).toContain(`<title>${APP_NAME}</title>`);
  });
});
