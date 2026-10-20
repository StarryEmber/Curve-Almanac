/**
 * Test-only hooks (TESTPLAN §1.1 pattern).
 *
 * Every hook is gated on `app.isPackaged === false` *and* an explicit
 * environment flag, so a packaged build can never be steered by environment
 * variables. The E2E suite uses this to redirect userData (window state, logs)
 * into a temporary directory instead of the real user profile.
 */

export const E2E_FLAG_ENV = 'CURVE_E2E';
export const E2E_USER_DATA_ENV = 'CURVE_E2E_USER_DATA';

export interface E2EHookInput {
  isPackaged: boolean;
  env: Record<string, string | undefined>;
}

/**
 * @returns absolute userData directory for E2E runs, otherwise `null`.
 */
export function resolveE2EUserDataPath(input: E2EHookInput): string | null {
  if (input.isPackaged) {
    return null;
  }
  if (input.env[E2E_FLAG_ENV] !== '1') {
    return null;
  }
  const directory = input.env[E2E_USER_DATA_ENV];
  if (typeof directory !== 'string' || directory.trim().length === 0) {
    return null;
  }
  return directory;
}
