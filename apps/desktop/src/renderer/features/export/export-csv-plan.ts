/**
 * Pure planning helpers for the CSV export dialog (T3.6, ADR-039).
 *
 * Kept outside the React hook so column order/header selection and the
 * "current view vs all rows" scope can be unit tested without a renderer.
 */

import type { ColumnDef, Row, SortSpec, TableMeta, TableStyle } from '@curve/domain';
import { applySort } from '@curve/table-engine';
import type { CsvExportColumn, CsvValueMode } from '@curve/table-engine';
import { columnDisplayLabel } from '@curve/ui';

export type CsvExportScope = 'view' | 'all';

/**
 * Maps visible columns (already in view order) to CSV columns. `valueIndex`
 * points into `Row.values`, which is schema order.
 */
export function buildCsvExportColumns(
  tableMeta: TableMeta,
  visibleColumns: readonly ColumnDef[],
  mode: CsvValueMode,
  style: TableStyle,
): CsvExportColumn[] {
  const indexById = new Map(tableMeta.columns.map((column, index) => [column.id, index]));
  return visibleColumns.map((column) => ({
    column,
    valueIndex: indexById.get(column.id) ?? -1,
    header: mode === 'display' ? columnDisplayLabel(column, style) : column.label,
  }));
}

/**
 * `view` keeps the grid's filtered/sorted rows and order. `all` ignores the
 * filter but keeps the current sort, so the CSV still reads like the view.
 */
export function selectCsvExportRows(
  scope: CsvExportScope,
  viewRows: readonly Row[],
  allRows: readonly Row[],
  tableMeta: TableMeta,
  sort: readonly SortSpec[],
  locale: string,
): readonly Row[] {
  if (scope === 'view') {
    return viewRows;
  }
  if (sort.length === 0) {
    return allRows;
  }
  return applySort(allRows, tableMeta, sort, { locale });
}
