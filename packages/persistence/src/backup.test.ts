import { describe, expect, it } from 'vitest';

import {
  BACKUP_RETENTION_MS,
  MAX_BACKUPS_PER_TARGET,
  backupCreatedAt,
  backupPathForFileName,
  formatBackupTimestamp,
  isBackupFileName,
  isExpiredBackup,
  isManifestBackupFileName,
  isTableBackupFileName,
  isTableBackupFor,
  manifestBackupFileName,
  parseBackupPath,
  parseBackupTimestamp,
  parseManifestBackupFileName,
  parseTableBackupFileName,
  planBackupRotation,
  tableBackupFileName,
} from './backup';

const AT = new Date('2026-10-20T05:45:00.123Z');
const TABLE_ID = 'tbl_9a2e';

describe('backup timestamps', () => {
  it('formats a compact UTC timestamp that is legal on Windows', () => {
    expect(formatBackupTimestamp(AT)).toBe('20261020T054500123Z');
    expect(formatBackupTimestamp(AT)).not.toContain(':');
  });

  it('parses the timestamp back to ISO 8601', () => {
    expect(parseBackupTimestamp('20261020T054500123Z')).toBe('2026-10-20T05:45:00.123Z');
  });

  it.each([
    '20261020T054500123',
    '2026-10-20T05:45:00.123Z',
    '20261320T054500123Z',
    '20260230T054500123Z',
    '20261020T254500123Z',
    '20261020T05450012Z',
    'not-a-timestamp',
  ])('rejects invalid timestamp %j', (timestamp) => {
    expect(parseBackupTimestamp(timestamp)).toBeNull();
  });
});

describe('backup file names', () => {
  it('builds the SPEC §7.1 table backup name', () => {
    expect(tableBackupFileName(TABLE_ID, AT)).toBe('tbl_9a2e.20261020T054500123Z.jsonl.bak');
  });

  it('builds the manifest backup name used for crash recovery', () => {
    expect(manifestBackupFileName(AT)).toBe('manifest.20261020T054500123Z.json.bak');
  });

  it('parses a table backup name', () => {
    expect(parseTableBackupFileName('tbl_9a2e.20261020T054500123Z.jsonl.bak')).toEqual({
      tableId: TABLE_ID,
      timestamp: '20261020T054500123Z',
      createdAt: '2026-10-20T05:45:00.123Z',
    });
  });

  it('parses a manifest backup name', () => {
    expect(parseManifestBackupFileName('manifest.20261020T054500123Z.json.bak')).toEqual({
      timestamp: '20261020T054500123Z',
      createdAt: '2026-10-20T05:45:00.123Z',
    });
  });

  it.each([
    'tbl_9a2e.jsonl.bak',
    'tbl_9a2e.20261020T054500123Z.bak',
    'other.20261020T054500123Z.jsonl.bak',
    'manifest.20261020T054500123Z.jsonl.bak',
    'tbl_9a2e.20261020T054500123Z.jsonl.bak.tmp',
  ])('rejects %j', (fileName) => {
    expect(isBackupFileName(fileName)).toBe(false);
  });

  it('recognises both backup families', () => {
    expect(isTableBackupFileName('tbl_9a2e.20261020T054500123Z.jsonl.bak')).toBe(true);
    expect(isManifestBackupFileName('manifest.20261020T054500123Z.json.bak')).toBe(true);
    expect(isTableBackupFor('tbl_9a2e.20261020T054500123Z.jsonl.bak', TABLE_ID)).toBe(true);
    expect(isTableBackupFor('tbl_9a2e.20261020T054500123Z.jsonl.bak', 'tbl_other')).toBe(false);
    expect(backupCreatedAt('manifest.20261020T054500123Z.json.bak')).toBe(
      '2026-10-20T05:45:00.123Z',
    );
  });

  it('builds workspace-relative backup paths and parses them strictly', () => {
    const fileName = 'tbl_9a2e.20261020T054500123Z.jsonl.bak';
    expect(backupPathForFileName(fileName)).toBe(`backups/${fileName}`);
    expect(parseBackupPath(`backups/${fileName}`)).toBe(fileName);
    expect(parseBackupPath(`../${fileName}`)).toBeNull();
    expect(parseBackupPath(`backups/nested/${fileName}`)).toBeNull();
    expect(parseBackupPath(`backups\\${fileName}`)).toBeNull();
    expect(parseBackupPath('backups/manifest.20261020T054500123Z.json.bak')).toBe(
      'manifest.20261020T054500123Z.json.bak',
    );
  });
});

describe('backup rotation', () => {
  const names = [
    'tbl_9a2e.20261020T000000000Z.jsonl.bak',
    'tbl_9a2e.20261020T000000003Z.jsonl.bak',
    'tbl_9a2e.20261020T000000001Z.jsonl.bak',
    'tbl_9a2e.20261020T000000004Z.jsonl.bak',
    'tbl_9a2e.20261020T000000002Z.jsonl.bak',
  ];

  it('keeps the newest three backups and removes the rest', () => {
    const plan = planBackupRotation(names);

    expect(plan.keep).toEqual([
      'tbl_9a2e.20261020T000000004Z.jsonl.bak',
      'tbl_9a2e.20261020T000000003Z.jsonl.bak',
      'tbl_9a2e.20261020T000000002Z.jsonl.bak',
    ]);
    expect(plan.remove).toEqual([
      'tbl_9a2e.20261020T000000001Z.jsonl.bak',
      'tbl_9a2e.20261020T000000000Z.jsonl.bak',
    ]);
    expect(MAX_BACKUPS_PER_TARGET).toBe(3);
  });

  it('ignores unknown file names when planning rotation', () => {
    const plan = planBackupRotation(['notes.txt', 'tbl_9a2e.20261020T000000000Z.jsonl.bak']);

    expect(plan.keep).toEqual(['tbl_9a2e.20261020T000000000Z.jsonl.bak']);
    expect(plan.remove).toEqual([]);
  });

  it('expires backups after seven days', () => {
    const now = new Date(AT.getTime() + BACKUP_RETENTION_MS + 1);
    expect(isExpiredBackup('tbl_9a2e.20261020T054500123Z.jsonl.bak', now)).toBe(true);
    expect(
      isExpiredBackup(
        'tbl_9a2e.20261020T054500123Z.jsonl.bak',
        new Date(AT.getTime() + BACKUP_RETENTION_MS - 1),
      ),
    ).toBe(false);
    expect(isExpiredBackup('notes.txt', now)).toBe(false);
  });
});
