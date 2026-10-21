import { isId } from '@curve/domain';

import { TABLE_FILE_EXTENSION, WORKSPACE_BACKUPS_DIR } from './layout';

/** Number of backups kept per target (table or manifest), SPEC §7.1/§7.4. */
export const MAX_BACKUPS_PER_TARGET = 3;

/** Backups older than this are deleted when a workspace is opened (SPEC §7.1). */
export const BACKUP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const TIMESTAMP_PATTERN = '\\d{8}T\\d{9}Z';
const TIMESTAMP_EXACT = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/;
const TABLE_BACKUP_EXACT = new RegExp(
  `^(tbl_[A-Za-z0-9][A-Za-z0-9_-]*)\\.(${TIMESTAMP_PATTERN})\\.jsonl\\.bak$`,
);
const MANIFEST_BACKUP_EXACT = new RegExp(`^manifest\\.(${TIMESTAMP_PATTERN})\\.json\\.bak$`);

/** Prefix of the pre-migration snapshot directory (SPEC §7.6). */
export const MIGRATION_BACKUP_DIRECTORY_PREFIX = 'migration-';
const MIGRATION_DIRECTORY_EXACT = new RegExp(
  `^${MIGRATION_BACKUP_DIRECTORY_PREFIX}(${TIMESTAMP_PATTERN})$`,
);

export interface ParsedTableBackup {
  tableId: string;
  timestamp: string;
  /** `createdAt` in ISO 8601, safe for `Date.parse` and `RecentEntry`-style use. */
  createdAt: string;
}

export interface ParsedManifestBackup {
  timestamp: string;
  createdAt: string;
}

export interface ParsedMigrationBackupDirectory {
  timestamp: string;
  createdAt: string;
}

/**
 * Compact UTC timestamp, `YYYYMMDDTHHmmssSSSZ`. Chosen over a literal ISO
 * string because `:` is illegal in Windows file names (ADR-021). The format is
 * lexicographically sortable.
 */
export function formatBackupTimestamp(date: Date): string {
  const iso = date.toISOString();
  return iso.replace(/[-:.]/g, '');
}

/** @returns ISO 8601 for a valid compact timestamp, otherwise `null`. */
export function parseBackupTimestamp(timestamp: string): string | null {
  const match = TIMESTAMP_EXACT.exec(timestamp);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second, millisecond] = match;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    millisecond === undefined
  ) {
    return null;
  }
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString() !== iso ? null : iso;
}

export function tableBackupFileName(tableId: string, date: Date): string {
  return `${tableId}.${formatBackupTimestamp(date)}${TABLE_FILE_EXTENSION}.bak`;
}

export function manifestBackupFileName(date: Date): string {
  return `manifest.${formatBackupTimestamp(date)}.json.bak`;
}

/**
 * Directory that holds the pre-migration copy of `tables/` (SPEC §7.6).
 * It reuses the ADR-021 timestamp so names sort chronologically and stay legal
 * on Windows.
 */
export function migrationBackupDirectoryName(date: Date): string {
  return `${MIGRATION_BACKUP_DIRECTORY_PREFIX}${formatBackupTimestamp(date)}`;
}

export function parseMigrationBackupDirectoryName(
  name: string,
): ParsedMigrationBackupDirectory | null {
  const match = MIGRATION_DIRECTORY_EXACT.exec(name);
  if (!match) {
    return null;
  }
  const timestamp = match[1];
  if (timestamp === undefined) {
    return null;
  }
  const createdAt = parseBackupTimestamp(timestamp);
  return createdAt === null ? null : { timestamp, createdAt };
}

export function isMigrationBackupDirectoryName(name: string): boolean {
  return parseMigrationBackupDirectoryName(name) !== null;
}

export function parseTableBackupFileName(fileName: string): ParsedTableBackup | null {
  const match = TABLE_BACKUP_EXACT.exec(fileName);
  if (!match) {
    return null;
  }
  const tableId = match[1];
  const timestamp = match[2];
  if (tableId === undefined || timestamp === undefined || !isId('tbl', tableId)) {
    return null;
  }
  const createdAt = parseBackupTimestamp(timestamp);
  return createdAt === null ? null : { tableId, timestamp, createdAt };
}

export function parseManifestBackupFileName(fileName: string): ParsedManifestBackup | null {
  const match = MANIFEST_BACKUP_EXACT.exec(fileName);
  if (!match) {
    return null;
  }
  const timestamp = match[1];
  if (timestamp === undefined) {
    return null;
  }
  const createdAt = parseBackupTimestamp(timestamp);
  return createdAt === null ? null : { timestamp, createdAt };
}

/** `createdAt` for any recognised backup file, otherwise `null`. */
export function backupCreatedAt(fileName: string): string | null {
  return (
    parseTableBackupFileName(fileName)?.createdAt ??
    parseManifestBackupFileName(fileName)?.createdAt ??
    null
  );
}

export function isTableBackupFileName(fileName: string): boolean {
  return parseTableBackupFileName(fileName) !== null;
}

export function isManifestBackupFileName(fileName: string): boolean {
  return parseManifestBackupFileName(fileName) !== null;
}

export function isBackupFileName(fileName: string): boolean {
  return isTableBackupFileName(fileName) || isManifestBackupFileName(fileName);
}

export function isTableBackupFor(fileName: string, tableId: string): boolean {
  return parseTableBackupFileName(fileName)?.tableId === tableId;
}

/** Workspace-relative POSIX path of a backup file. */
export function backupPathForFileName(fileName: string): string {
  return `${WORKSPACE_BACKUPS_DIR}/${fileName}`;
}

/** Parses `backups/<file>.bak` and rejects anything else. */
export function parseBackupPath(backupPath: string): string | null {
  const prefix = `${WORKSPACE_BACKUPS_DIR}/`;
  if (!backupPath.startsWith(prefix)) {
    return null;
  }
  const fileName = backupPath.slice(prefix.length);
  if (fileName.length === 0 || fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }
  return isBackupFileName(fileName) ? fileName : null;
}

function sortNewestFirst(fileNames: readonly string[]): string[] {
  return [...fileNames]
    .filter((fileName) => backupCreatedAt(fileName) !== null)
    .sort((left, right) => {
      const leftTime = backupCreatedAt(left) ?? '';
      const rightTime = backupCreatedAt(right) ?? '';
      return rightTime.localeCompare(leftTime) || right.localeCompare(left);
    });
}

export interface BackupRotationPlan {
  keep: string[];
  remove: string[];
}

/**
 * Plans which backups survive. Newest `max` entries are kept; everything else
 * is scheduled for deletion. Unknown file names are ignored by the caller.
 */
export function planBackupRotation(
  fileNames: readonly string[],
  max = MAX_BACKUPS_PER_TARGET,
): BackupRotationPlan {
  const sorted = sortNewestFirst(fileNames);
  return {
    keep: sorted.slice(0, max),
    remove: sorted.slice(max),
  };
}

/** True when the backup is older than the retention window. */
export function isExpiredBackup(
  fileName: string,
  now: Date,
  retentionMs = BACKUP_RETENTION_MS,
): boolean {
  const createdAt = backupCreatedAt(fileName);
  if (createdAt === null) {
    return false;
  }
  return now.getTime() - Date.parse(createdAt) > retentionMs;
}
