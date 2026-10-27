import { describe, expect, it } from 'vitest';

import type { LayoutNode } from '@curve/domain';

import {
  addViewToLayout,
  countPanes,
  findPaneByPath,
  listPaneEntries,
  moveViewToPane,
  panePathForView,
  removeViewFromLayout,
  setSplitRatio,
  splitPaneInLayout,
} from './layout';

const single: LayoutNode = {
  type: 'pane',
  viewIds: ['viw_a', 'viw_b'],
  activeViewId: 'viw_a',
};

const threePanes: LayoutNode = {
  type: 'split',
  direction: 'horizontal',
  ratio: 0.35,
  first: { type: 'pane', viewIds: ['viw_a'], activeViewId: 'viw_a' },
  second: {
    type: 'split',
    direction: 'vertical',
    ratio: 0.5,
    first: { type: 'pane', viewIds: ['viw_b'], activeViewId: 'viw_b' },
    second: { type: 'pane', viewIds: ['viw_c'], activeViewId: 'viw_c' },
  },
};

describe('layout helpers (T5.1)', () => {
  it('addresses panes with stable visual paths', () => {
    expect(listPaneEntries(single).map((entry) => entry.path)).toEqual(['root']);
    expect(listPaneEntries(threePanes).map((entry) => entry.path)).toEqual([
      'root.0',
      'root.1.0',
      'root.1.1',
    ]);
    expect(countPanes(threePanes)).toBe(3);
    expect(panePathForView(threePanes, 'viw_c')).toBe('root.1.1');
    expect(findPaneByPath(threePanes, 'root.1.0')?.viewIds).toEqual(['viw_b']);
    expect(findPaneByPath(threePanes, 'root.9')).toBeNull();
  });

  it('targets an explicit pane when adding a view and focuses it', () => {
    const layout = structuredClone(threePanes);
    const path = addViewToLayout(layout, 'viw_d', 'root.1.1');
    expect(path).toBe('root.1.1');
    expect(findPaneByPath(layout, 'root.1.1')?.activeViewId).toBe('viw_d');
    expect(findPaneByPath(layout, 'root.1.1')?.viewIds).toEqual(['viw_c', 'viw_d']);
  });

  it('splits a pane into the original pane plus an empty second pane', () => {
    const split = splitPaneInLayout(single, 'root', 'horizontal');
    expect(countPanes(split.layout)).toBe(2);
    expect(split.panePath).toBe('root.1');
    expect(findPaneByPath(split.layout, 'root.0')?.viewIds).toEqual(['viw_a', 'viw_b']);
    expect(findPaneByPath(split.layout, 'root.1')).toEqual({
      type: 'pane',
      viewIds: [],
      activeViewId: null,
    });
    expect(split.layout).toMatchObject({ type: 'split', direction: 'horizontal', ratio: 0.5 });
  });

  it('splits a nested pane without changing the other panes', () => {
    const split = splitPaneInLayout(threePanes, 'root.1.0', 'vertical');
    expect(countPanes(split.layout)).toBe(4);
    expect(split.panePath).toBe('root.1.0.1');
    expect(findPaneByPath(split.layout, 'root.0')?.viewIds).toEqual(['viw_a']);
    expect(findPaneByPath(split.layout, 'root.1.1')?.viewIds).toEqual(['viw_c']);
    expect(findPaneByPath(split.layout, 'root.1.0.0')?.viewIds).toEqual(['viw_b']);
  });

  it('collapses a pane when its last view is closed', () => {
    const layout = removeViewFromLayout(threePanes, 'viw_a');
    expect(countPanes(layout)).toBe(2);
    expect(layout).toMatchObject({ type: 'split', direction: 'vertical', ratio: 0.5 });
    expect(listPaneEntries(layout).map((entry) => entry.pane.viewIds)).toEqual([
      ['viw_b'],
      ['viw_c'],
    ]);
  });

  it('keeps one empty pane when the last view is closed', () => {
    const layout = removeViewFromLayout(
      { type: 'pane', viewIds: ['viw_only'], activeViewId: 'viw_only' },
      'viw_only',
    );
    expect(layout).toEqual({ type: 'pane', viewIds: [], activeViewId: null });
  });

  it('moves a view to another pane and collapses the emptied source', () => {
    const moved = moveViewToPane(threePanes, 'viw_a', 'root.1.1');
    expect(countPanes(moved)).toBe(2);
    expect(panePathForView(moved, 'viw_a')).toBe('root.1');
    expect(listPaneEntries(moved).map((entry) => entry.pane.viewIds)).toEqual([
      ['viw_b'],
      ['viw_c', 'viw_a'],
    ]);
  });

  it('moves a view without collapsing a pane that still has tabs', () => {
    const moved = moveViewToPane(threePanes, 'viw_b', 'root.0');
    expect(countPanes(moved)).toBe(2);
    expect(findPaneByPath(moved, 'root.0')?.viewIds).toEqual(['viw_a', 'viw_b']);
    expect(findPaneByPath(moved, 'root.1')?.viewIds).toEqual(['viw_c']);
  });

  it('sets a nested split ratio only at the addressed path', () => {
    const updated = setSplitRatio(threePanes, 'root.1', 0.7);
    expect(updated).toMatchObject({ type: 'split', ratio: 0.35 });
    expect((updated as Extract<LayoutNode, { type: 'split' }>).second).toMatchObject({
      type: 'split',
      ratio: 0.7,
    });
    expect(() => setSplitRatio(threePanes, 'root.0', 0.5)).toThrow(
      expect.objectContaining({ code: 'E_VALIDATION' }),
    );
  });
});
