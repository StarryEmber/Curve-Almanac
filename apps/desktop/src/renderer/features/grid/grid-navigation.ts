/** Pure keyboard model for the data grid (T2.1, SPEC §9.1). */

export interface GridPosition {
  row: number;
  col: number;
}

export interface GridNavigationBounds {
  rowCount: number;
  colCount: number;
  /** Rows a PageUp/PageDown should move (the visible row count). */
  pageRows: number;
}

export interface GridNavigationInput {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  bounds: GridNavigationBounds;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Returns the next active cell. Unknown keys and empty grids return the input
 * position unchanged, so the caller can decide whether to prevent the default.
 */
export function moveGridPosition(current: GridPosition, input: GridNavigationInput): GridPosition {
  const { rowCount, colCount, pageRows } = input.bounds;
  if (rowCount <= 0 || colCount <= 0) {
    return current;
  }
  const row = clamp(current.row, 0, rowCount - 1);
  const col = clamp(current.col, 0, colCount - 1);
  const lastRow = rowCount - 1;
  const lastCol = colCount - 1;

  switch (input.key) {
    case 'ArrowUp':
      return { row: Math.max(0, row - 1), col };
    case 'ArrowDown':
      return { row: Math.min(lastRow, row + 1), col };
    case 'ArrowLeft':
      return { row, col: Math.max(0, col - 1) };
    case 'ArrowRight':
      return { row, col: Math.min(lastCol, col + 1) };
    case 'Home':
      return input.ctrlKey === true ? { row: 0, col: 0 } : { row, col: 0 };
    case 'End':
      return input.ctrlKey === true ? { row: lastRow, col: lastCol } : { row, col: lastCol };
    case 'PageUp':
      return { row: Math.max(0, row - Math.max(1, pageRows)), col };
    case 'PageDown':
      return { row: Math.min(lastRow, row + Math.max(1, pageRows)), col };
    case 'Tab': {
      const delta = input.shiftKey === true ? -1 : 1;
      const index = row * colCount + col + delta;
      if (index < 0) {
        return { row: lastRow, col: lastCol };
      }
      if (index >= rowCount * colCount) {
        return { row: 0, col: 0 };
      }
      return { row: Math.floor(index / colCount), col: index % colCount };
    }
    default:
      return current;
  }
}

/** Keys the grid owns; everything else keeps the browser default. */
export function isGridNavigationKey(key: string): boolean {
  return (
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'Home' ||
    key === 'End' ||
    key === 'PageUp' ||
    key === 'PageDown' ||
    key === 'Tab'
  );
}

export interface GridRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Inclusive rectangle between the anchor and the active cell. */
export function selectionRect(anchor: GridPosition, active: GridPosition): GridRect {
  return {
    top: Math.min(anchor.row, active.row),
    bottom: Math.max(anchor.row, active.row),
    left: Math.min(anchor.col, active.col),
    right: Math.max(anchor.col, active.col),
  };
}

export function isInRect(row: number, col: number, rect: GridRect): boolean {
  return row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right;
}

export interface PasteTarget {
  /** 0-based row of the selection's top-left corner. */
  rowIndex: number;
  /** 0-based visible-column index of the selection's top-left corner. */
  colIndex: number;
  /** `null` only when the table has no rows. */
  rowId: string | null;
  columnId: string;
}

/**
 * The paste anchor is the top-left of the selection rectangle, not the active
 * cell (SPEC §9.3). Row ids keep the target stable if a later view sort reorders
 * the grid; an empty table uses `null` so the planner appends from row 1.
 */
export function pasteTarget(
  anchor: GridPosition,
  active: GridPosition,
  rowIds: readonly string[],
  columnIds: readonly string[],
): PasteTarget | null {
  const rect = selectionRect(anchor, active);
  const columnId = columnIds[rect.left];
  if (columnId === undefined) {
    return null;
  }
  const rowId = rowIds[rect.top];
  if (rowId === undefined && rowIds.length > 0) {
    return null;
  }
  return {
    rowIndex: rect.top,
    colIndex: rect.left,
    rowId: rowId ?? null,
    columnId,
  };
}
