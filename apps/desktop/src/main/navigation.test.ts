import { describe, expect, it } from 'vitest';

import { isNavigationAllowed } from './navigation';

const DEV_BASE = 'http://localhost:5173/';
const FILE_BASE = 'file:///C:/apps/desktop/out/renderer/index.html';

describe('isNavigationAllowed', () => {
  it('allows same-origin navigation inside the dev server', () => {
    expect(isNavigationAllowed('http://localhost:5173/index.html', DEV_BASE)).toBe(true);
    expect(isNavigationAllowed('http://localhost:5173/settings?a=1#top', DEV_BASE)).toBe(true);
  });

  it('blocks every external or scheme-based navigation', () => {
    expect(isNavigationAllowed('https://example.com/', DEV_BASE)).toBe(false);
    expect(isNavigationAllowed('http://localhost:6000/', DEV_BASE)).toBe(false);
    expect(isNavigationAllowed('javascript:alert(1)', DEV_BASE)).toBe(false);
    expect(isNavigationAllowed('file:///C:/Windows/system32/calc.exe', DEV_BASE)).toBe(false);
    expect(isNavigationAllowed('not a url', DEV_BASE)).toBe(false);
  });

  it('allows file navigation only inside the renderer directory', () => {
    expect(
      isNavigationAllowed('file:///C:/apps/desktop/out/renderer/index.html#hash', FILE_BASE),
    ).toBe(true);
    expect(isNavigationAllowed('file:///C:/apps/desktop/out/renderer/other.html', FILE_BASE)).toBe(
      true,
    );
    expect(isNavigationAllowed('file:///C:/apps/desktop/out/main/index.cjs', FILE_BASE)).toBe(
      false,
    );
    expect(isNavigationAllowed('file:///C:/Windows/win.ini', FILE_BASE)).toBe(false);
    expect(isNavigationAllowed('https://example.com/', FILE_BASE)).toBe(false);
  });

  it('fails closed when the app base URL is unknown', () => {
    expect(isNavigationAllowed('http://localhost:5173/', '')).toBe(false);
    expect(isNavigationAllowed('http://localhost:5173/', 'also not a url')).toBe(false);
  });
});
