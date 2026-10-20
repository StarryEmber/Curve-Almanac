/**
 * Content-Security-Policy for the renderer (SPEC §15.3).
 *
 * Production keeps the exact policy from the specification. Development adds
 * two deviations, both scoped to `electron-vite dev`:
 *
 * - `ws://localhost:*` / `http://localhost:*` for the Vite HMR client.
 * - `'unsafe-inline'` for scripts, because `@vitejs/plugin-react` injects the
 *   React Fast Refresh preamble as an inline module script.
 *
 * The policy is injected at build/serve time as a `<meta http-equiv>` tag by
 * the renderer plugin in `electron.vite.config.ts`, so a production bundle
 * never contains the development policy.
 */

export type RuntimeMode = 'development' | 'production';

/** Policy for a built (production) renderer. Mirrors SPEC §15.3 verbatim. */
const PRODUCTION_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ');

const DEVELOPMENT_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* http://localhost:*",
].join('; ');

export function buildContentSecurityPolicy(mode: RuntimeMode): string {
  return mode === 'development' ? DEVELOPMENT_POLICY : PRODUCTION_POLICY;
}
