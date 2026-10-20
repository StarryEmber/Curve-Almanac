import { describe, expect, it } from 'vitest';

import { DirtyTableTracker } from './dirty-set';

describe('DirtyTableTracker', () => {
  it('starts empty', () => {
    const tracker = new DirtyTableTracker();

    expect(tracker.size).toBe(0);
    expect(tracker.list()).toEqual([]);
    expect(tracker.has('tbl_a')).toBe(false);
    expect(tracker.get('tbl_a')).toBeUndefined();
    expect(tracker.ids()).toEqual([]);
  });

  it('marks a table once and keeps the first position on re-mark', () => {
    let now = 1_000;
    const tracker = new DirtyTableTracker({ now: () => now });

    const first = tracker.mark('tbl_a');
    now = 2_000;
    tracker.mark('tbl_b');
    now = 3_000;
    const reMarked = tracker.mark('tbl_a');

    expect(first).toEqual({ tableId: 'tbl_a', revision: 1, markedAt: 1_000 });
    expect(reMarked.markedAt).toBe(3_000);
    expect(reMarked.revision).toBeGreaterThan(first.revision);
    expect(tracker.size).toBe(2);
    expect(tracker.ids()).toEqual(['tbl_a', 'tbl_b']);
    expect(tracker.list().map((entry) => entry.tableId)).toEqual(['tbl_a', 'tbl_b']);
  });

  it('bumps the revision for every mark so callers can detect new writes', () => {
    const tracker = new DirtyTableTracker();
    const one = tracker.mark('tbl_a');
    const two = tracker.mark('tbl_b');
    const three = tracker.mark('tbl_a');

    expect([one.revision, two.revision, three.revision]).toEqual([1, 2, 3]);
  });

  it('marks many tables at once and reports each entry', () => {
    const tracker = new DirtyTableTracker();
    const entries = tracker.markAll(['tbl_a', 'tbl_b', 'tbl_b']);

    expect(entries.map((entry) => entry.tableId)).toEqual(['tbl_a', 'tbl_b', 'tbl_b']);
    expect(tracker.size).toBe(2);
  });

  it('clears one table and reports whether it was dirty', () => {
    const tracker = new DirtyTableTracker();
    tracker.mark('tbl_a');

    expect(tracker.clear('tbl_a')).toBe(true);
    expect(tracker.clear('tbl_a')).toBe(false);
    expect(tracker.has('tbl_a')).toBe(false);
    expect(tracker.size).toBe(0);
  });

  it('clears everything', () => {
    const tracker = new DirtyTableTracker();
    tracker.markAll(['tbl_a', 'tbl_b']);
    tracker.clearAll();

    expect(tracker.size).toBe(0);
    expect(tracker.list()).toEqual([]);
  });

  it('returns defensive copies of its entries', () => {
    const tracker = new DirtyTableTracker();
    tracker.mark('tbl_a');

    const listed = tracker.list();
    listed.push({ tableId: 'tbl_b', revision: 99, markedAt: 0 });
    listed[0]!.tableId = 'tbl_mutated';

    expect(tracker.ids()).toEqual(['tbl_a']);
    expect(tracker.get('tbl_a')?.tableId).toBe('tbl_a');
  });
});
