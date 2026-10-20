import { describe, expect, it } from 'vitest';

import {
  assertSafeRelativePath,
  backupDirectoryPath,
  findManifestPathIssues,
  importsDirectoryPath,
  isSafeRelativePath,
  joinPathLike,
  manifestFilePath,
  rootKey,
  sanitizeWorkspaceFolderName,
  tableFilePath,
  trashDirectoryPath,
  utf8ByteLength,
  workspaceFolderName,
} from './layout';
import { createEmptyManifest } from './manifest';

describe('workspace layout', () => {
  it('exposes the SPEC §7.1 directory names', () => {
    expect(manifestFilePath()).toBe('manifest.json');
    expect(tableFilePath('tbl_1')).toBe('tables/tbl_1.jsonl');
    expect(backupDirectoryPath()).toBe('backups');
    expect(importsDirectoryPath()).toBe('imports');
    expect(trashDirectoryPath()).toBe('.trash');
  });

  it.each([
    ['manifest.json', true],
    ['tables/tbl_1.jsonl', true],
    ['backups/tbl_1.20261020T000000000Z.jsonl.bak', true],
    ['', false],
    ['/etc/passwd', false],
    ['\\windows\\system32', false],
    ['C:/workspace', false],
    ['c:relative', false],
    ['../manifest.json', false],
    ['tables/../manifest.json', false],
    ['tables/./manifest.json', false],
    ['tables//manifest.json', false],
    ['tables\\tbl_1.jsonl', false],
    ['tables/tbl_1.jsonl/', false],
    ['tables/\0x.jsonl', false],
  ])('validates relative path %j', (value, expected) => {
    expect(isSafeRelativePath(value)).toBe(expected);
  });

  it('throws E_PATH_DENIED for an unsafe relative path', () => {
    try {
      assertSafeRelativePath('../manifest.json', 'manifest');
      expect.unreachable('assertSafeRelativePath should have thrown');
    } catch (error) {
      expect(error).toMatchObject({ code: 'E_PATH_DENIED' });
    }
  });

  it.each([
    ['Demo', 'Demo'],
    ['  Demo  ', 'Demo'],
    ['a/b', 'a-b'],
    ['a\\b', 'a-b'],
    ['a:b*c?', 'a-b-c-'],
    ['name...', 'name'],
    ['CON', 'CON-'],
    ['con.txt', 'con.txt-'],
    ['LPT9', 'LPT9-'],
    ['..', ''],
    ['.', ''],
    ['   ', ''],
    ['Café', 'Café'],
  ])('sanitizes workspace folder name %j', (input, expected) => {
    expect(sanitizeWorkspaceFolderName(input)).toBe(expected);
  });

  it('adds the .cstudio suffix or returns an empty string', () => {
    expect(workspaceFolderName('Demo')).toBe('Demo.cstudio');
    expect(workspaceFolderName('CON')).toBe('CON-.cstudio');
    expect(workspaceFolderName('  ')).toBe('');
  });

  it('joins memory-adapter paths with the parent separator style', () => {
    expect(joinPathLike('/tmp/ws', 'Demo.cstudio')).toBe('/tmp/ws/Demo.cstudio');
    expect(joinPathLike('/tmp/ws/', 'Demo.cstudio')).toBe('/tmp/ws/Demo.cstudio');
    expect(joinPathLike('C:\\tmp\\ws', 'Demo.cstudio')).toBe('C:\\tmp\\ws\\Demo.cstudio');
    expect(joinPathLike('', 'Demo.cstudio')).toBe('Demo.cstudio');
    expect(rootKey('/tmp/ws///')).toBe('/tmp/ws');
  });

  it('counts UTF-8 bytes without Node helpers', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('中')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
    expect(utf8ByteLength('')).toBe(0);
  });

  it('rejects table file paths that do not match the table id', () => {
    const manifest = createEmptyManifest({ name: 'Demo', appVersion: '0.1.0' });
    manifest.tables.push({
      id: 'tbl_1',
      name: 'Table',
      file: 'tables/other.jsonl',
      schemaVersion: 1,
      columns: [{ id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' }],
      primaryKey: 'col_id',
      rowCount: 0,
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    });

    expect(findManifestPathIssues(manifest)).toHaveLength(1);
  });
});
