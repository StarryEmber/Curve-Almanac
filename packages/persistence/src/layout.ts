import { createAppError, isId } from '@curve/domain';
import type { WorkspaceManifest } from '@curve/domain';

/**
 * Workspace layout (SPEC §7.1) and path-shape helpers.
 *
 * Everything here is pure string logic: no `node:path`, no `fs`, no `process`.
 * The Electron adapter joins these POSIX-relative paths onto the real workspace
 * root after resolving it with `fs.realpath`.
 */

export const WORKSPACE_MANIFEST_FILE = 'manifest.json';
export const WORKSPACE_TABLES_DIR = 'tables';
export const WORKSPACE_BACKUPS_DIR = 'backups';
export const WORKSPACE_IMPORTS_DIR = 'imports';
export const WORKSPACE_TRASH_DIR = '.trash';
export const WORKSPACE_LOCK_FILE = '.lock';
export const WORKSPACE_FOLDER_SUFFIX = '.cstudio';
export const TABLE_FILE_EXTENSION = '.jsonl';

const ILLEGAL_WINDOWS_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;
const WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const DRIVE_PREFIX = /^[A-Za-z]:/;

/** True when `value` is a safe workspace-relative POSIX path. */
export function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.includes('\0')) {
    return false;
  }
  if (value.startsWith('/') || value.startsWith('\\')) {
    return false;
  }
  if (value.includes('\\') || DRIVE_PREFIX.test(value)) {
    return false;
  }
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** @throws AppError `E_PATH_DENIED` when the path is not a safe relative path. */
export function assertSafeRelativePath(value: string, label: string): void {
  if (!isSafeRelativePath(value)) {
    throw createAppError('E_PATH_DENIED', `${label} must be a workspace-relative POSIX path.`, {
      detail: value,
    });
  }
}

/**
 * Turns a user-supplied workspace name into a Windows-safe folder base name.
 *
 * The result never contains separators, drive prefixes, control characters or
 * trailing dots/spaces. An empty result means the name cannot be used.
 */
export function sanitizeWorkspaceFolderName(name: string): string {
  const normalized = name.normalize('NFC').trim();
  if (normalized.length === 0) {
    return '';
  }

  let cleaned = normalized.replace(ILLEGAL_WINDOWS_CHARACTERS, '-');
  cleaned = cleaned.replace(/[. ]+$/g, '').trim();
  if (cleaned.length === 0) {
    return '';
  }
  if (WINDOWS_RESERVED_BASENAME.test(cleaned)) {
    cleaned = `${cleaned}-`;
  }
  return cleaned;
}

/** Folder name of a new workspace, including the `.cstudio` suffix. */
export function workspaceFolderName(name: string): string {
  const base = sanitizeWorkspaceFolderName(name);
  return base.length === 0 ? '' : `${base}${WORKSPACE_FOLDER_SUFFIX}`;
}

export function manifestFilePath(): string {
  return WORKSPACE_MANIFEST_FILE;
}

export function tableFileName(tableId: string): string {
  return `${tableId}${TABLE_FILE_EXTENSION}`;
}

export function tableFilePath(tableId: string): string {
  return `${WORKSPACE_TABLES_DIR}/${tableFileName(tableId)}`;
}

export function backupDirectoryPath(): string {
  return WORKSPACE_BACKUPS_DIR;
}

export function trashDirectoryPath(): string {
  return WORKSPACE_TRASH_DIR;
}

export function importsDirectoryPath(): string {
  return WORKSPACE_IMPORTS_DIR;
}

/**
 * Joins a parent directory and a child name for the in-memory adapter. The real
 * adapter uses `node:path`; this keeps the memory store usable from tests on
 * either separator style without importing Node.
 */
export function joinPathLike(parent: string, child: string): string {
  if (parent.length === 0) {
    return child;
  }
  const trimmed = parent.replace(/[\\/]+$/, '');
  const separator = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  return `${trimmed}${separator}${child}`;
}

/** Stable key used by the memory adapter to find a workspace by its root. */
export function rootKey(root: string): string {
  return root.replace(/[\\/]+$/, '');
}

/**
 * Format-level invariant not covered by `@curve/domain`: every table must point
 * at exactly `tables/<tableId>.jsonl`. A manifest with a different relative
 * path is rejected before any filesystem operation.
 */
export function findManifestPathIssues(manifest: WorkspaceManifest): string[] {
  const issues: string[] = [];
  for (const table of manifest.tables) {
    if (!isId('tbl', table.id)) {
      issues.push(`table id is not a table id: ${table.id}`);
      continue;
    }
    const expected = tableFilePath(table.id);
    if (table.file !== expected) {
      issues.push(`table ${table.id} file must be "${expected}", got "${table.file}"`);
    }
  }
  return issues;
}

/** UTF-8 byte length without relying on Node's `Buffer` or DOM `TextEncoder`. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}
