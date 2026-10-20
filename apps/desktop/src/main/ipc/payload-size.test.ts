import { describe, expect, it } from 'vitest';

import { measurePayloadBytes } from './payload-size';

describe('measurePayloadBytes', () => {
  it('counts UTF-8 bytes of a string', () => {
    expect(measurePayloadBytes('abc')).toBe(3);
    // "€" is three bytes in UTF-8; the assertion must not drift with the lib.
    expect(measurePayloadBytes('€')).toBe(3);
  });

  it('returns zero for absent or unsupported values', () => {
    expect(measurePayloadBytes(undefined)).toBe(0);
    expect(measurePayloadBytes(null)).toBe(0);
    expect(measurePayloadBytes(() => undefined)).toBe(0);
  });

  it('adds up arrays and nested objects', () => {
    expect(measurePayloadBytes(['ab', 'cd'])).toBe(4);
    expect(measurePayloadBytes({ a: 'hello', b: { c: 'world' } })).toBe(10);
  });

  it('counts typed arrays by their byte length', () => {
    expect(measurePayloadBytes(new Uint8Array(12))).toBe(12);
    expect(measurePayloadBytes(new ArrayBuffer(5))).toBe(5);
  });

  it('counts map keys, values and set entries', () => {
    expect(measurePayloadBytes(new Map([['ab', 'cde']]))).toBe(5);
    expect(measurePayloadBytes(new Set(['abc']))).toBe(3);
  });

  it('survives cyclic payloads', () => {
    const cyclic: Record<string, unknown> = { text: 'abcd' };
    cyclic['self'] = cyclic;

    expect(measurePayloadBytes(cyclic)).toBe(4);
  });

  it('stops descending at the depth limit', () => {
    let deep: Record<string, unknown> = { text: 'x' };
    for (let index = 0; index < 200; index += 1) {
      deep = { nested: deep };
    }

    expect(measurePayloadBytes(deep)).toBe(0);
  });
});
