import type { Row, ViewDef } from '@curve/domain';
import type { DirtyTableEntry, TableData } from '@curve/table-engine';

import type { AppState } from './types';

/** Stable empty value so an empty workspace does not allocate on each render. */
export const EMPTY_ROWS: readonly Row[] = Object.freeze([]);

/** The active table's schema and rows, or `null` before a workspace is open. */
export function selectCurrentTable(state: AppState): TableData | null {
  if (state.ui.activeTableId === null) {
    return null;
  }
  return state.tables[state.ui.activeTableId] ?? null;
}

/**
 * Rows currently visible in the grid.
 *
 * T1.5 has no filter/sort yet, so this is the current table's row array by
 * reference. It is O(1) and returns the same array until that table snapshot
 * changes, which is what keeps the 100k first-render selector under budget.
 */
export function selectVisibleRows(state: AppState): readonly Row[] {
  const table = selectCurrentTable(state);
  return table === null ? EMPTY_ROWS : table.rows;
}

/** The dirty-table snapshot in first-mark order (ADR-023). */
export function selectDirtyTables(state: AppState): readonly DirtyTableEntry[] {
  return state.ui.dirtyTables;
}

/** The active view definition, if the layout selected one. */
export function selectActiveView(state: AppState): ViewDef | null {
  if (state.ui.activeViewId === null) {
    return null;
  }
  return state.views[state.ui.activeViewId] ?? null;
}

export interface TableReferenceCounts {
  views: number;
  charts: number;
}

/**
 * Counts the views/charts that a table deletion would cascade (SPEC §9.0).
 * The delete dialog shows these numbers before dispatching `table.delete`.
 */
export function countTableReferences(state: AppState, tableId: string): TableReferenceCounts {
  const chartIds = new Set(
    Object.values(state.charts)
      .filter((chart) => chart.tableId === tableId)
      .map((chart) => chart.id),
  );
  let views = 0;
  for (const view of Object.values(state.views)) {
    if (view.kind === 'table' && view.refId === tableId) {
      views += 1;
    } else if (view.kind === 'chart' && chartIds.has(view.refId)) {
      views += 1;
    }
  }
  return { views, charts: chartIds.size };
}
