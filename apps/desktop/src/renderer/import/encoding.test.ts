import { describe, expect, it } from 'vitest';

import { decodeImportBytes } from './encoding';

describe('decodeImportBytes', () => {
  it('auto-detects strict UTF-8 first', () => {
    const bytes = new TextEncoder().encode('id,name\n1,Alice');

    expect(decodeImportBytes(bytes)).toMatchObject({
      text: 'id,name\n1,Alice',
      encoding: 'utf-8',
      mismatch: false,
    });
  });

  it('falls back to GB18030 for GBK bytes', () => {
    const bytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3, 0x0a]);

    expect(decodeImportBytes(bytes)).toMatchObject({
      text: '你好\n',
      encoding: 'gb18030',
      mismatch: false,
    });
  });

  it('keeps replacement characters and reports a mismatch on manual UTF-8', () => {
    const bytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]);

    const decoded = decodeImportBytes(bytes, 'utf-8');

    expect(decoded.encoding).toBe('utf-8');
    expect(decoded.mismatch).toBe(true);
    expect(decoded.replacementCount).toBeGreaterThan(0);
  });

  it('decodes with a manual GB18030 override and strips a UTF-8 BOM', () => {
    const gbk = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]);
    const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61]);

    expect(decodeImportBytes(gbk, 'gb18030').text).toBe('你好');
    expect(decodeImportBytes(utf8Bom).text).toBe('a');
  });
});
