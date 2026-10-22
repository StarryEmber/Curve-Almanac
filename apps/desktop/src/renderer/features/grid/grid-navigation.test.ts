import { describe, expect, it } from 'vitest';

import {
  isGridNavigationKey,
  isInRect,
  moveGridPosition,
  pasteTarget,
  selectionRect,
} from './grid-navigation';

const bounds = { rowCount: 10, colCount: 4, pageRows: 5 };

describe('moveGridPosition', () => {
  it('moves with the arrow keys and clamps at the edges', () => {
    expect(moveGridPosition({ row: 2, col: 2 }, { key: 'ArrowUp', bounds })).toEqual({
      row: 1,
      col: 2,
    });
    expect(moveGridPosition({ row: 0, col: 0 }, { key: 'ArrowUp', bounds })).toEqual({
      row: 0,
      col: 0,
    });
    expect(moveGridPosition({ row: 9, col: 3 }, { key: 'ArrowRight', bounds })).toEqual({
      row: 9,
      col: 3,
    });
  });

  it('handles Home/End and Ctrl+Home/End', () => {
    expect(moveGridPosition({ row: 4, col: 2 }, { key: 'Home', bounds })).toEqual({
      row: 4,
      col: 0,
    });
    expect(moveGridPosition({ row: 4, col: 2 }, { key: 'End', bounds })).toEqual({
      row: 4,
      col: 3,
    });
    expect(moveGridPosition({ row: 4, col: 2 }, { key: 'Home', ctrlKey: true, bounds })).toEqual({
      row: 0,
      col: 0,
    });
    expect(moveGridPosition({ row: 4, col: 2 }, { key: 'End', ctrlKey: true, bounds })).toEqual({
      row: 9,
      col: 3,
    });
  });

  it('pages by the visible row count and clamps', () => {
    expect(moveGridPosition({ row: 2, col: 1 }, { key: 'PageDown', bounds })).toEqual({
      row: 7,
      col: 1,
    });
    expect(moveGridPosition({ row: 8, col: 1 }, { key: 'PageDown', bounds })).toEqual({
      row: 9,
      col: 1,
    });
    expect(moveGridPosition({ row: 2, col: 1 }, { key: 'PageUp', bounds })).toEqual({
      row: 0,
      col: 1,
    });
  });

  it('moves Tab/Shift+Tab cell by cell and wraps', () => {
    expect(moveGridPosition({ row: 0, col: 0 }, { key: 'Tab', bounds })).toEqual({
      row: 0,
      col: 1,
    });
    expect(moveGridPosition({ row: 0, col: 3 }, { key: 'Tab', bounds })).toEqual({
      row: 1,
      col: 0,
    });
    expect(moveGridPosition({ row: 0, col: 0 }, { key: 'Tab', shiftKey: true, bounds })).toEqual({
      row: 9,
      col: 3,
    });
    expect(moveGridPosition({ row: 9, col: 3 }, { key: 'Tab', bounds })).toEqual({
      row: 0,
      col: 0,
    });
  });

  it('ignores unknown keys and empty grids', () => {
    expect(moveGridPosition({ row: 1, col: 1 }, { key: 'Enter', bounds })).toEqual({
      row: 1,
      col: 1,
    });
    expect(
      moveGridPosition(
        { row: 1, col: 1 },
        { key: 'ArrowDown', bounds: { rowCount: 0, colCount: 0, pageRows: 5 } },
      ),
    ).toEqual({ row: 1, col: 1 });
  });
});

describe('pasteTarget', () => {
  it('anchors at the top-left of the selection regardless of drag direction', () => {
    const rowIds = ['row_0', 'row_1', 'row_2', 'row_3', 'row_4'];
    const columnIds = ['col_a', 'col_b', 'col_c'];
    expect(pasteTarget({ row: 4, col: 2 }, { row: 1, col: 0 }, rowIds, columnIds)).toEqual({
      rowIndex: 1,
      colIndex: 0,
      rowId: 'row_1',
      columnId: 'col_a',
    });
    expect(pasteTarget({ row: 1, col: 0 }, { row: 4, col: 2 }, rowIds, columnIds)).toEqual({
      rowIndex: 1,
      colIndex: 0,
      rowId: 'row_1',
      columnId: 'col_a',
    });
  });

  it('returns a null row id for an empty table and null for an empty column list', () => {
    expect(pasteTarget({ row: 0, col: 0 }, { row: 0, col: 0 }, [], ['col_a'])).toEqual({
      rowIndex: 0,
      colIndex: 0,
      rowId: null,
      columnId: 'col_a',
    });
    expect(pasteTarget({ row: 0, col: 0 }, { row: 0, col: 0 }, ['row_0'], [])).toBeNull();
  });
});

describe('selectionRect', () => {
  it('normalises a rectangle from any drag direction', () => {
    expect(selectionRect({ row: 5, col: 3 }, { row: 2, col: 1 })).toEqual({
      top: 2,
      bottom: 5,
      left: 1,
      right: 3,
    });
  });

  it('reports whether a cell is inside the rectangle', () => {
    const rect = { top: 2, bottom: 5, left: 1, right: 3 };
    expect(isInRect(2, 1, rect)).toBe(true);
    expect(isInRect(5, 3, rect)).toBe(true);
    expect(isInRect(1, 1, rect)).toBe(false);
    expect(isInRect(4, 4, rect)).toBe(false);
  });
});

describe('isGridNavigationKey', () => {
  it('only claims the documented keys', () => {
    for (const key of [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'Tab',
    ]) {
      expect(isGridNavigationKey(key)).toBe(true);
    }
    expect(isGridNavigationKey('Enter')).toBe(false);
    expect(isGridNavigationKey('a')).toBe(false);
  });
});
