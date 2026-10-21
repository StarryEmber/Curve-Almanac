import type { ChartSpec, FilterPredicate, TableMeta } from '@curve/domain';

/** Where a chart references a column; used for error UIs and deletion counts. */
export type ChartColumnRole = 'x' | 'y' | 'series' | 'sort' | 'filter';

export interface ChartColumnReference {
  columnId: string;
  role: ChartColumnRole;
}

function collectFilterReferences(
  predicate: FilterPredicate,
  references: ChartColumnReference[],
): void {
  if (predicate.kind === 'compare') {
    references.push({ columnId: predicate.columnId, role: 'filter' });
    return;
  }
  for (const child of predicate.children) {
    collectFilterReferences(child, references);
  }
}

/** Every column id a chart depends on (mapping, sort and filter). */
export function listChartColumnReferences(chart: ChartSpec): ChartColumnReference[] {
  const references: ChartColumnReference[] = [];
  if (chart.mapping.layout === 'wide') {
    references.push({ columnId: chart.mapping.xColumnId, role: 'x' });
    for (const columnId of chart.mapping.yColumnIds) {
      references.push({ columnId, role: 'y' });
    }
  } else {
    references.push({ columnId: chart.mapping.xColumnId, role: 'x' });
    references.push({ columnId: chart.mapping.seriesColumnId, role: 'series' });
    references.push({ columnId: chart.mapping.yColumnId, role: 'y' });
  }
  for (const sort of chart.sort) {
    references.push({ columnId: sort.columnId, role: 'sort' });
  }
  if (chart.filter !== undefined) {
    collectFilterReferences(chart.filter, references);
  }
  return references;
}

/**
 * Columns a chart still points at after a schema change (SPEC §6.6.4, §19).
 *
 * The invariant is deliberately a warning rather than a load failure: the chart
 * must render an actionable "column deleted / remap" state instead of crashing.
 */
export function findMissingChartColumns(chart: ChartSpec, table: TableMeta | undefined): string[] {
  if (table === undefined) {
    return [];
  }
  const known = new Set(table.columns.map((column) => column.id));
  const missing = new Set<string>();
  for (const reference of listChartColumnReferences(chart)) {
    if (!known.has(reference.columnId)) {
      missing.add(reference.columnId);
    }
  }
  return [...missing];
}

export function chartReferencesColumn(chart: ChartSpec, columnId: string): boolean {
  return listChartColumnReferences(chart).some((reference) => reference.columnId === columnId);
}
