/**
 * Path whitelist helpers (SPEC §15.2).
 *
 * Every filesystem operation resolves the target with `fs.realpath` before it
 * is compared with the canonical workspace root. `path.relative` is used
 * instead of a raw string prefix because it handles Windows case folding and
 * separator differences correctly.
 */

import { realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { createAppError, isAppError } from '@curve/domain';
import type { AppError, ErrorCode } from '@curve/domain';
import { assertSafeRelativePath } from '@curve/persistence';

/** True when `target` is strictly below `root`. */
export function isPathInside(root: string, target: string): boolean {
  const relativePath = relative(resolve(root), resolve(target));
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

/** True when `target` is `root` itself or strictly below it. */
function isPathInsideOrEqual(root: string, target: string): boolean {
  const relativePath = relative(resolve(root), resolve(target));
  return (
    relativePath.length === 0 ||
    (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export function isEnoent(error: unknown): boolean {
  return errorCode(error) === 'ENOENT';
}

/** Short, path-free diagnostic for an `AppError.detail`. */
export function describeFsError(error: unknown): string {
  return errorCode(error) ?? (error instanceof Error ? error.name : 'unknown error');
}

export function toFsError(code: ErrorCode, message: string, error: unknown): AppError {
  return createAppError(code, message, { detail: describeFsError(error), retryable: true });
}

/**
 * Resolves `target` and proves it stays inside `root`.
 *
 * Existing targets are fully resolved (so a symlink pointing outside is
 * rejected). Missing targets are resolved through their parent directory, which
 * is what a first write to `tables/<id>.jsonl` needs.
 */
export async function resolveInsideRoot(
  root: string,
  target: string,
  label: string,
): Promise<string> {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (!isPathInside(resolvedRoot, resolvedTarget)) {
    throw createAppError('E_PATH_DENIED', `${label} is outside the workspace.`);
  }

  try {
    const realTarget = await realpath(resolvedTarget);
    if (!isPathInside(resolvedRoot, realTarget)) {
      throw createAppError('E_PATH_DENIED', `${label} resolves outside the workspace.`);
    }
    return realTarget;
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    if (!isEnoent(error)) {
      throw toFsError('E_FS_READ', `Cannot resolve ${label}.`, error);
    }
  }

  try {
    const realParent = await realpath(dirname(resolvedTarget));
    if (!isPathInsideOrEqual(resolvedRoot, realParent)) {
      throw createAppError('E_PATH_DENIED', `${label} resolves outside the workspace.`);
    }
    const realTarget = join(realParent, basename(resolvedTarget));
    if (!isPathInside(resolvedRoot, realTarget)) {
      throw createAppError('E_PATH_DENIED', `${label} is outside the workspace.`);
    }
    return realTarget;
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    throw toFsError('E_FS_READ', `Cannot resolve the parent of ${label}.`, error);
  }
}

/** Resolves a validated workspace-relative POSIX path inside `root`. */
export async function resolveWorkspaceRelativePath(
  root: string,
  relativePath: string,
  label: string,
): Promise<string> {
  assertSafeRelativePath(relativePath, label);
  const target = resolve(root, ...relativePath.split('/'));
  return resolveInsideRoot(root, target, label);
}
