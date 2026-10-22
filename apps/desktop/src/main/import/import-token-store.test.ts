import { describe, expect, it } from 'vitest';

import { createImportTokenStore } from './import-token-store';

describe('createImportTokenStore', () => {
  it('issues opaque tokens, returns the entry and consumes on success', () => {
    const store = createImportTokenStore({ uuid: () => 'token_1' });
    const entry = {
      path: 'C:/tmp/a.csv',
      name: 'a.csv',
      size: 3,
      sha256: 'a'.repeat(64),
      format: 'csv' as const,
    };

    const token = store.issue(entry);

    expect(token).toBe('token_1');
    expect(store.get(token)).toBe(entry);
    expect(store.size()).toBe(1);
    store.consume(token);
    expect(store.size()).toBe(0);
    expect(() => store.get(token)).toThrowError(/no longer available/);
  });

  it('rejects an unknown token', () => {
    const store = createImportTokenStore();
    expect(() => store.get('missing')).toThrowError(/no longer available/);
  });
});
