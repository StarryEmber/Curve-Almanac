import type { FilterPredicate, TableViewState } from '@curve/domain';

/**
 * View-state cleanup for structural column changes (T2.3).
 *
 * SPEC §6.6.7 requires `columnOrder` to contain every column exactly once and
 * `widths`/`sort`/`filter` to reference existing columns. Deleting a column
 * therefore repairs every table view in the same command; charts and table
 * styles are deliberately not rewritten (SPEC §19 and §6.6.7 allow them to keep
 * dangling references, and the chart shows an explicit invalid state).
 */

/** Drops compare nodes for `columnId`; empty groups disappear. */
export function removeColumnFromFilter(
  predicate: FilterPredicate,
  columnId: string,
): FilterPredicate | undefined {
  if (predicate.kind === 'compare') {
    return predicate.columnId === columnId ? undefined : predicate;
  }
  const children: FilterPredicate[] = [];
  for (const child of predicate.children) {
    const next = removeColumnFromFilter(child, columnId);
    if (next !== undefined) {
      children.push(next);
    }
  }
  if (children.length === 0) {
    return undefined;
  }
  return { kind: predicate.kind, children };
}

export function removeColumnFromView(tableView: TableViewState, columnId: string): TableViewState {
  const position = tableView.columnOrder.indexOf(columnId);
  const frozenColumnCount =
    position >= 0 && position < tableView.frozenColumnCount
      ? Math.max(0, tableView.frozenColumnCount - 1)
      : tableView.frozenColumnCount;

  const widths = { ...tableView.widths };
  delete widths[columnId];

  const filter =
    tableView.filter === undefined ? undefined : removeColumnFromFilter(tableView.filter, columnId);

  const next: TableViewState = {
    tableId: tableView.tableId,
    styleId: tableView.styleId,
    columnOrder: tableView.columnOrder.filter((id) => id !== columnId),
    widths,
    hiddenColumnIds: tableView.hiddenColumnIds.filter((id) => id !== columnId),
    sort: tableView.sort.filter((sort) => sort.columnId !== columnId),
    frozenColumnCount,
  };
  if (filter !== undefined) {
    next.filter = filter;
  }
  return next;
}

export function insertColumnIntoView(
  tableView: TableViewState,
  columnId: string,
  index: number,
): TableViewState {
  const bounded = Math.max(0, Math.min(index, tableView.columnOrder.length));
  const columnOrder = [...tableView.columnOrder];
  columnOrder.splice(bounded, 0, columnId);
  return { ...tableView, columnOrder };
}

/**
 * Applies the new canonical order to a view.
 *
 * Q8 decided that a panel reorder changes the table schema and every view at
 * once in T2.3; per-view custom orders arrive with the later view-state tasks.
 */
export function reorderViewColumns(
  tableView: TableViewState,
  columnIds: readonly string[],
): TableViewState {
  return { ...tableView, columnOrder: [...columnIds] };
}
