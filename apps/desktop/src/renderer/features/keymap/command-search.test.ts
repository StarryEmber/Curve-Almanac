import { describe, expect, it } from 'vitest';

import { fuzzyScore, searchCommandItems } from './command-search';

interface TestItem {
  id: string;
  label: string;
  recentRank: number | null;
}

function item(id: string, label: string, recentRank: number | null = null): TestItem {
  return { id, label, recentRank };
}

describe('fuzzyScore', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('sav', 'Save now')).not.toBeNull();
    expect(fuzzyScore('sn', 'Save now')).not.toBeNull();
    expect(fuzzyScore('SAVE', 'save now')).not.toBeNull();
  });

  it('rejects characters that appear out of order', () => {
    expect(fuzzyScore('vas', 'Save now')).toBeNull();
    expect(fuzzyScore('zzz', 'Save now')).toBeNull();
  });

  it('scores prefixes and word starts above loose subsequences', () => {
    const prefix = fuzzyScore('save', 'Save now');
    const loose = fuzzyScore('save', 'Something available eventually');
    expect(prefix).not.toBeNull();
    expect(loose).not.toBeNull();
    if (prefix !== null && loose !== null) {
      expect(prefix).toBeGreaterThan(loose);
    }
  });

  it('returns 0 for an empty query and null for an empty candidate', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
    expect(fuzzyScore('x', '')).toBeNull();
  });

  it('matches Chinese labels', () => {
    expect(fuzzyScore('侧栏', '切换侧栏')).not.toBeNull();
    expect(fuzzyScore('图', '切换侧栏')).toBeNull();
  });
});

describe('searchCommandItems', () => {
  const commands = [
    item('history.undo', '撤销'),
    item('history.redo', '重做'),
    item('layout.splitHorizontal', '水平分栏'),
    item('app.save', '立即保存'),
  ];

  it('orders recently used commands first for an empty query', () => {
    const recent = [
      item('layout.splitHorizontal', '水平分栏', 0),
      item('history.undo', '撤销', 1),
      item('history.redo', '重做'),
      item('app.save', '立即保存'),
    ];

    expect(searchCommandItems(recent, '').map((entry) => entry.id)).toEqual([
      'layout.splitHorizontal',
      'history.undo',
      'history.redo',
      'app.save',
    ]);
  });

  it('filters non-matching commands and keeps the original order for ties', () => {
    const ranked = searchCommandItems(commands, '分栏');
    expect(ranked.map((entry) => entry.id)).toEqual(['layout.splitHorizontal']);
  });

  it('matches the command id when the label does not match', () => {
    const ranked = searchCommandItems(commands, 'redo');
    expect(ranked.map((entry) => entry.id)).toEqual(['history.redo']);
  });

  it('deduplicates command ids', () => {
    const duplicated = [...commands, item('history.undo', '撤销')];
    const ranked = searchCommandItems(duplicated, '');
    expect(ranked.filter((entry) => entry.id === 'history.undo')).toHaveLength(1);
    expect(ranked).toHaveLength(4);
  });

  it('breaks equal fuzzy scores with the recent rank', () => {
    const twins = [item('a', 'same label', 1), item('b', 'same label', 0)];
    const ranked = searchCommandItems(twins, 'same');
    expect(ranked.map((entry) => entry.id)).toEqual(['b', 'a']);
  });
});
