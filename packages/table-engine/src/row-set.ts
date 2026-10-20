/**
 * Row-set types and the pure reconciliation helpers shared by the renderer and
 * the main process (SPEC §8 "RowSet").
 *
 * `TableData` is what the pipeline carries between parse and query; the diff
 * and row-count helpers are deliberately free of React/Zustand so T1.5 can
 * build the command bus on top of them.
 */

import type { Row, TableMeta, WorkspaceManifest } from '@curve/domain';

/** A table's schema plus its current rows (SPEC §8 step 4). */
export interface TableData {
  table: TableMeta;
  rows: Row[];
}

/** Shallow copy of the row references: rows are treated as immutable. */
export function createTableData(table: TableMeta, rows: readonly Row[] = []): TableData {
  return { table, rows: [...rows] };
}

/** One table whose `rowCount` hint disagrees with the file on disk. */
export interface RowCountDrift {
  tableId: string;
  declared: number;
  actual: number;
}

/**
 * Compares `TableMeta.rowCount` hints with the counts read from disk.
 *
 * Tables without an entry in `actual` are left alone: the caller could not read
 * them (for example because the data file is missing) and must not guess.
 */
export function diffRowCounts(
  tables: readonly TableMeta[],
  actual: ReadonlyMap<string, number>,
): RowCountDrift[] {
  const drifts: RowCountDrift[] = [];
  for (const table of tables) {
    const count = actual.get(table.id);
    if (count !== undefined && count !== table.rowCount) {
      drifts.push({ tableId: table.id, declared: table.rowCount, actual: count });
    }
  }
  return drifts;
}

export interface RowCountReconciliation {
  manifest: WorkspaceManifest;
  drifts: RowCountDrift[];
  changed: boolean;
}

/**
 * Rewrites drifted `rowCount` hints (SPEC §7.5).
 *
 * `updatedAt` is intentionally untouched: repairing a hint is not a user edit
 * and must not make the workspace look modified. Returns the input manifest by
 * reference when nothing drifted.
 */
export function reconcileRowCounts(
  manifest: WorkspaceManifest,
  actual: ReadonlyMap<string, number>,
): RowCountReconciliation {
  const drifts = diffRowCounts(manifest.tables, actual);
  if (drifts.length === 0) {
    return { manifest, drifts, changed: false };
  }
  const byTable = new Map(drifts.map((drift) => [drift.tableId, drift.actual]));
  const tables = manifest.tables.map((table) => {
    const count = byTable.get(table.id);
    return count === undefined ? table : { ...table, rowCount: count };
  });
  return { manifest: { ...manifest, tables }, drifts, changed: true };
}

/** Difference between two row sets, by row id. */
export interface TableRowDiff {
  added: string[];
  removed: string[];
  changed: string[];
  /** True when the same rows appear in a different order. */
  orderChanged: boolean;
  /** Convenience flag: nothing was added, removed, changed or moved. */
  empty: boolean;
}

function sameValues(left: Row, right: Row): boolean {
  if (left.values.length !== right.values.length) {
    return false;
  }
  for (let index = 0; index < left.values.length; index += 1) {
    if (left.values[index] !== right.values[index]) {
      return false;
    }
  }
  return true;
}

/**
 * Classifies the difference between two versions of a table.
 *
 * Used by the dirty-table primitives: a table is dirty when this reports any
 * change, and the ids let an autosave queue persist only what moved.
 */
export function diffTableRows(before: readonly Row[], after: readonly Row[]): TableRowDiff {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterById = new Map(after.map((row) => [row.id, row]));

  const added: string[] = [];
  const changed: string[] = [];
  for (const row of after) {
    const previous = beforeById.get(row.id);
    if (previous === undefined) {
      added.push(row.id);
    } else if (!sameValues(previous, row)) {
      changed.push(row.id);
    }
  }

  const removed: string[] = [];
  for (const row of before) {
    if (!afterById.has(row.id)) {
      removed.push(row.id);
    }
  }

  let orderChanged = false;
  if (added.length === 0 && removed.length === 0) {
    for (let index = 0; index < before.length; index += 1) {
      if (before[index]?.id !== after[index]?.id) {
        orderChanged = true;
        break;
      }
    }
  }

  return {
    added,
    removed,
    changed,
    orderChanged,
    empty: added.length === 0 && removed.length === 0 && changed.length === 0 && !orderChanged,
  };
}
