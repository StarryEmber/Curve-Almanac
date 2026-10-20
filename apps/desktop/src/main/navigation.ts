/**
 * Navigation policy for every `webContents` the app creates (SPEC §15.3).
 *
 * The initial `loadURL` / `loadFile` call does not go through `will-navigate`,
 * so anything that does reach the handler is a renderer-initiated navigation and
 * may only stay inside the app it was loaded from.
 */

/**
 * @param target URL the renderer tries to navigate to.
 * @param appBaseUrl URL (or file URL) the main window was loaded from.
 * @returns `true` only for same-origin (dev server) or same-directory (file) targets.
 */
export function isNavigationAllowed(target: string, appBaseUrl: string): boolean {
  if (appBaseUrl.length === 0) {
    return false;
  }

  let targetUrl: URL;
  let baseUrl: URL;
  try {
    targetUrl = new URL(target);
    baseUrl = new URL(appBaseUrl);
  } catch {
    return false;
  }

  if (baseUrl.protocol === 'file:') {
    const baseDirectory = baseUrl.href.slice(0, baseUrl.href.lastIndexOf('/') + 1);
    return targetUrl.protocol === 'file:' && targetUrl.href.startsWith(baseDirectory);
  }

  return targetUrl.protocol === baseUrl.protocol && targetUrl.origin === baseUrl.origin;
}
