import { describe, expect, it } from 'vitest';

import { RATING_FIELD_TYPE_ID } from '@curve/plugin-sample';

import { resolveFieldTypeStorage } from './plugins';

describe('main-process field type resolver', () => {
  it('resolves the compiled-in plugin field types', () => {
    expect(resolveFieldTypeStorage(RATING_FIELD_TYPE_ID)).toBe('number');
  });

  it('returns undefined for builtin storage types and unknown ids', () => {
    for (const id of ['number', 'text', 'com.example.missing']) {
      expect(resolveFieldTypeStorage(id)).toBeUndefined();
    }
  });
});
