import { describe, expect, it } from 'vitest';

import { decodeStyleFileBytes, fileNameFromPath, styleExportFileName } from './style-transfer';

describe('style transfer helpers', () => {
  it('builds a safe .curvestyle.json file name', () => {
    expect(styleExportFileName('My report')).toBe('My report.curvestyle.json');
    expect(styleExportFileName('a/b:c*?"<>|')).toBe('a-b-c------.curvestyle.json');
    expect(styleExportFileName('   ')).toBe('style.curvestyle.json');
    expect(styleExportFileName('x'.repeat(100))).toBe(`${'x'.repeat(80)}.curvestyle.json`);
  });

  it('extracts the file name from either separator', () => {
    expect(fileNameFromPath('C:\\tmp\\a.curvestyle.json')).toBe('a.curvestyle.json');
    expect(fileNameFromPath('/tmp/a.curvestyle.json')).toBe('a.curvestyle.json');
    expect(fileNameFromPath('a.curvestyle.json')).toBe('a.curvestyle.json');
  });

  it('decodes UTF-8 and drops a BOM', () => {
    const text = '{"kind":"curve-table-style"}';
    const plain = new TextEncoder().encode(text);
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...plain]);
    expect(decodeStyleFileBytes(plain)).toBe(text);
    expect(decodeStyleFileBytes(withBom)).toBe(text);
  });
});
