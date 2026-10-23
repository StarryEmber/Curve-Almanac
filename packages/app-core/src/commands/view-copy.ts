/**
 * Duplicate a table view (T2.6 decision 8).
 *
 * The new view starts as a full copy of the current filter/sort/widths/frozen
 * state so the user can branch ("same table, another filter") without redoing
 * layout, then diverges independently. Ids and the title are fresh.
 */

import { createAppError, createViewId } from '@curve/domain';
import type { FilterPredicate, TableViewState, UuidFactory, ViewDef } from '@curve/domain';

export interface DuplicateTableViewOptions {
  source: ViewDef;
  /** Titles already used in the workspace. */
  existingTitles: readonly string[];
  uuid?: UuidFactory;
}

function cloneFilter(predicate: FilterPredicate): FilterPredicate {
  if (predicate.kind === 'compare') {
    return {
      kind: 'compare',
      columnId: predicate.columnId,
      op: predicate.op,
      ...(predicate.value === undefined ? {} : { value: predicate.value }),
      ...(predicate.value2 === undefined ? {} : { value2: predicate.value2 }),
    };
  }
  return {
    kind: predicate.kind,
    children: predicate.children.map(cloneFilter),
  };
}

function cloneTableView(tableView: TableViewState): TableViewState {
  return {
    tableId: tableView.tableId,
    styleId: tableView.styleId,
    columnOrder: [...tableView.columnOrder],
    widths: { ...tableView.widths },
    hiddenColumnIds: [...tableView.hiddenColumnIds],
    sort: tableView.sort.map((spec) => ({ ...spec })),
    ...(tableView.filter === undefined ? {} : { filter: cloneFilter(tableView.filter) }),
    frozenColumnCount: tableView.frozenColumnCount,
  };
}

/** `Sensors` → `Sensors (2)`, skipping titles already in use. */
export function duplicateViewTitle(base: string, existingTitles: readonly string[]): string {
  const trimmed = base.trim() === '' ? 'View' : base.trim();
  const used = new Set(existingTitles);
  const stemMatch = /^(.*) \((\d+)\)$/.exec(trimmed);
  const stem = stemMatch?.[1]?.trim() ?? trimmed;
  let index = 2;
  while (used.has(`${stem} (${String(index)})`)) {
    index += 1;
  }
  return `${stem} (${String(index)})`;
}

export function createDuplicateTableView(options: DuplicateTableViewOptions): ViewDef {
  const source = options.source;
  if (source.kind !== 'table' || source.tableView === undefined) {
    throw createAppError('E_VALIDATION', 'Only table views can be duplicated.');
  }
  return {
    id: createViewId(options.uuid),
    kind: 'table',
    refId: source.refId,
    title: duplicateViewTitle(source.title, options.existingTitles),
    tableView: cloneTableView(source.tableView),
  };
}
