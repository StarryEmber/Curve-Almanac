/**
 * Test-only hooks (TESTPLAN §1.1 pattern).
 *
 * Every hook is gated on `app.isPackaged === false` *and* an explicit
 * environment flag, so a packaged build can never be steered by environment
 * variables. The E2E suite uses this to redirect userData (window state, logs)
 * into a temporary directory instead of the real user profile, and to stand in
 * for the native dialogs Playwright cannot drive.
 */

export const E2E_FLAG_ENV = 'CURVE_E2E';
export const E2E_USER_DATA_ENV = 'CURVE_E2E_USER_DATA';
export const E2E_DIALOG_DIRECTORY_ENV = 'CURVE_E2E_DIR';
export const E2E_DIALOG_SAVE_ENV = 'CURVE_E2E_SAVE';
export const E2E_IMPORT_FILE_ENV = 'CURVE_E2E_IMPORT';

export interface E2EHookInput {
  isPackaged: boolean;
  env: Record<string, string | undefined>;
}

/** Fixed paths returned by the dialog/file channels during E2E runs. */
export interface E2EDialogStubs {
  /** `dialog:pickDirectory` → `{ path }`. */
  directory: string | null;
  /** `dialog:saveFile` / `file:exportText` → `{ path }`. */
  savePath: string | null;
  /** `file:importText` reads its content from this file. */
  importPath: string | null;
}

function isEnabled(input: E2EHookInput): boolean {
  return !input.isPackaged && input.env[E2E_FLAG_ENV] === '1';
}

function readPath(env: E2EHookInput['env'], name: string): string | null {
  const value = env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value;
}

/**
 * @returns absolute userData directory for E2E runs, otherwise `null`.
 */
export function resolveE2EUserDataPath(input: E2EHookInput): string | null {
  if (!isEnabled(input)) {
    return null;
  }
  return readPath(input.env, E2E_USER_DATA_ENV);
}

/**
 * @returns the dialog stand-ins for E2E runs, otherwise `null` (use real
 * dialogs). Individual paths stay `null` when they are not configured.
 */
export function resolveE2EDialogStubs(input: E2EHookInput): E2EDialogStubs | null {
  if (!isEnabled(input)) {
    return null;
  }
  return {
    directory: readPath(input.env, E2E_DIALOG_DIRECTORY_ENV),
    savePath: readPath(input.env, E2E_DIALOG_SAVE_ENV),
    importPath: readPath(input.env, E2E_IMPORT_FILE_ENV),
  };
}
