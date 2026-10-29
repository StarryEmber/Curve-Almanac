/**
 * Product identity (T6.0, ADR-051).
 *
 * The user-visible name lives here so main, renderer and the message tables
 * cannot drift apart. Two places are static and cannot import it —
 * `apps/desktop/package.json` (`productName`, which Electron also uses for the
 * userData directory) and `src/renderer/index.html` (`<title>`) — so
 * `brand.test.ts` asserts both against this constant.
 */
export const APP_NAME = 'Curve Almanac';
