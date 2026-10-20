import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createChartId,
  createColumnId,
  createId,
  createRowId,
  createRuleId,
  createStyleId,
  createTableId,
  createTimestamp,
  createViewId,
  createWorkspaceId,
  isId,
  randomUuid,
} from './factories';

import type { IdPrefix } from './factories';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('id factories', () => {
  const cases: [IdPrefix, (uuid: () => string) => string][] = [
    ['ws', createWorkspaceId],
    ['tbl', createTableId],
    ['col', createColumnId],
    ['row', createRowId],
    ['cht', createChartId],
    ['viw', createViewId],
    ['sty', createStyleId],
    ['rule', createRuleId],
  ];

  it.each(cases)('prefixes %s ids and accepts them back', (prefix, factory) => {
    const id = factory(() => 'fixed');
    expect(id).toBe(`${prefix}_fixed`);
    expect(isId(prefix, id)).toBe(true);
    expect(createId(prefix, () => 'fixed')).toBe(id);
  });

  it('rejects ids with the wrong prefix or shape', () => {
    expect(isId('col', 'tbl_1')).toBe(false);
    expect(isId('col', 'col_')).toBe(false);
    expect(isId('col', 'col_1 extra')).toBe(false);
    expect(isId('row', 'row_001')).toBe(true);
  });

  it('generates UUID ids by default', () => {
    expect(randomUuid()).toMatch(UUID_PATTERN);
    expect(createTableId()).toMatch(/^tbl_[0-9a-f-]{36}$/i);
  });

  it('fails loudly when the runtime has no crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {});
    expect(() => randomUuid()).toThrow(/crypto\.randomUUID/);
    vi.unstubAllGlobals();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createTimestamp', () => {
  it('returns the ISO form of the provided clock', () => {
    expect(createTimestamp(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is parseable as an ISO 8601 timestamp by default', () => {
    expect(Number.isNaN(Date.parse(createTimestamp()))).toBe(false);
  });
});
