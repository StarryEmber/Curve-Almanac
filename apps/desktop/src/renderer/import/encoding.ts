/**
 * Encoding layer for the import Worker (T2.5).
 *
 * `file:importText` deliberately returns raw bytes so GBK is not lost. The
 * Worker performs a strict UTF-8 decode first, falls back to GB18030, and lets
 * the wizard override the choice. A manual UTF-8 attempt on GBK bytes keeps the
 * replacement characters visible and reports `mismatch`, which is the "wrong
 * encoding" warning required by TESTPLAN E4.
 */

export type ImportEncoding = 'utf-8' | 'gb18030';
export type ImportEncodingChoice = 'auto' | ImportEncoding;

export interface DecodedImportText {
  text: string;
  encoding: ImportEncoding;
  /** True when the chosen/decoded text contains replacement characters. */
  mismatch: boolean;
  /** Number of U+FFFD replacement characters produced by the decode. */
  replacementCount: number;
}

function countReplacements(text: string): number {
  let count = 0;
  for (const character of text) {
    if (character === '\uFFFD') {
      count += 1;
    }
  }
  return count;
}

function decode(bytes: Uint8Array, encoding: ImportEncoding, fatal: boolean): string | null {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

function stripBom(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

export function decodeImportBytes(
  bytes: Uint8Array,
  choice: ImportEncodingChoice = 'auto',
): DecodedImportText {
  if (choice === 'auto') {
    const utf8 = decode(bytes, 'utf-8', true);
    if (utf8 !== null) {
      return {
        text: stripBom(utf8),
        encoding: 'utf-8',
        mismatch: false,
        replacementCount: 0,
      };
    }
    const gb = decode(bytes, 'gb18030', true);
    if (gb !== null) {
      return {
        text: stripBom(gb),
        encoding: 'gb18030',
        mismatch: false,
        replacementCount: 0,
      };
    }
    const fallback = stripBom(decode(bytes, 'utf-8', false) ?? '');
    return {
      text: fallback,
      encoding: 'utf-8',
      mismatch: true,
      replacementCount: countReplacements(fallback),
    };
  }

  const text = stripBom(decode(bytes, choice, false) ?? '');
  const replacementCount = countReplacements(text);
  const fatal = decode(bytes, choice, true);
  return {
    text,
    encoding: choice,
    mismatch: fatal === null || replacementCount > 0,
    replacementCount,
  };
}
