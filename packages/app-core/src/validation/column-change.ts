import {
  createAppError,
  planColumnAdd,
  planColumnDelete,
  planColumnReorder,
  planColumnUpdate,
  planPrimaryKeyChange,
} from '@curve/domain';
import type { AppError, ColumnChangeFailure, ColumnDef } from '@curve/domain';

import { chartReferencesColumn } from '../state/chart-validity';

import type { AppState } from '../state/types';

/**
 * Preview/inspection layer for structural column changes (T2.3).
 *
 * The UI asks for a preview before opening the destructive confirmation; the
 * command re-runs the same pure plan, so counts and failure lists cannot drift
 * between "what the dialog promised" and "what was applied". No state is
 * mutated here.
 */

export type ColumnChange =
  | { kind: 'add'; tableId: string; column: ColumnDef; index?: number }
  | { kind: 'update'; tableId: string; column: ColumnDef }
  | { kind: 'delete'; tableId: string; columnId: string }
  | { kind: 'reorder'; tableId: string; columnIds: readonly string[] }
  | { kind: 'primary-key'; tableId: string; columnId: string };

export interface ColumnChangeSummary {
  tableId: string;
  kind: ColumnChange['kind'];
  columnId: string | null;
  affectedRows: number;
  convertedCells: number;
  /** Views whose `tableView` state will be cleaned up (add/delete/reorder). */
  viewUpdates: number;
  /** Charts whose mapping/sort/filter references a deleted column. */
  invalidCharts: number;
  columnCount: number;
  primaryKey: string;
}

export type ColumnChangeInspection =
  | { ok: true; summary: ColumnChangeSummary }
  | {
      ok: false;
      error: AppError;
      failures: readonly ColumnChangeFailure[];
      totalFailures: number;
    };

type InspectionState = Pick<AppState, 'tables' | 'views' | 'charts'>;

function targetColumnId(change: ColumnChange): string | null {
  switch (change.kind) {
    case 'reorder':
      return null;
    case 'add':
    case 'update':
      return change.column.id;
    case 'delete':
    case 'primary-key':
      return change.columnId;
  }
}

function countTableViewUpdates(state: InspectionState, tableId: string): number {
  return Object.values(state.views).filter(
    (view) => view.kind === 'table' && view.refId === tableId,
  ).length;
}

function countInvalidCharts(state: InspectionState, tableId: string, columnId: string): number {
  return Object.values(state.charts).filter(
    (chart) => chart.tableId === tableId && chartReferencesColumn(chart, columnId),
  ).length;
}

export function inspectColumnChange(
  state: InspectionState,
  change: ColumnChange,
): ColumnChangeInspection {
  const tableData = state.tables[change.tableId];
  if (tableData === undefined) {
    return {
      ok: false,
      error: createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
        detail: `table=${change.tableId}`,
      }),
      failures: [],
      totalFailures: 0,
    };
  }

  const table = tableData.table;
  const rows = tableData.rows;
  const plan =
    change.kind === 'add'
      ? planColumnAdd(table, rows, change.column, change.index)
      : change.kind === 'update'
        ? planColumnUpdate(table, rows, change.column)
        : change.kind === 'delete'
          ? planColumnDelete(table, rows, change.columnId)
          : change.kind === 'reorder'
            ? planColumnReorder(table, rows, change.columnIds)
            : planPrimaryKeyChange(table, rows, change.columnId);

  if (!plan.ok) {
    return {
      ok: false,
      error: plan.error,
      failures: plan.failures,
      totalFailures: plan.totalFailures,
    };
  }

  const columnId = targetColumnId(change);
  const viewUpdates =
    change.kind === 'add' || change.kind === 'delete' || change.kind === 'reorder'
      ? countTableViewUpdates(state, change.tableId)
      : 0;
  const invalidCharts =
    change.kind === 'delete' && columnId !== null
      ? countInvalidCharts(state, change.tableId, columnId)
      : 0;

  return {
    ok: true,
    summary: {
      tableId: change.tableId,
      kind: change.kind,
      columnId,
      affectedRows: plan.affectedRows,
      convertedCells: plan.convertedCells,
      viewUpdates,
      invalidCharts,
      columnCount: plan.table.columns.length,
      primaryKey: plan.table.primaryKey,
    },
  };
}
