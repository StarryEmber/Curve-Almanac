import { describe, expect, it } from 'vitest';

import { cloneTableStyle, DEFAULT_TABLE_STYLE } from '@curve/domain';
import type { ColumnDef, Row, TableMeta } from '@curve/domain';

import { buildCsvExportColumns, selectCsvExportRows } from './export-csv-plan';

const columns: ColumnDef[] = [
  { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'none' },
  { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'none' },
  { id: 'col_grade', key: 'grade', label: 'Grade', type: 'enum', role: 'none' },
];

const table: TableMeta = {
  id: 'tbl_export',
  name: 'Export',
  file: 'tables/tbl_export.jsonl',
  schemaVersion: 1,
  columns,
  primaryKey: 'col_name',
  rowCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const rows: Row[] = [
  { id: 'row_1', values: ['alpha', 3, 'b'] },
  { id: 'row_2', values: ['beta', 1, 'a'] },
  { id: 'row_3', values: ['gamma', 2, 'c'] },
];

function styleWithOverride(): ReturnType<typeof cloneTableStyle> {
  const style = cloneTableStyle(DEFAULT_TABLE_STYLE);
  style.columnOverrides['col_name'] = { label: 'Name (display)' };
  style.columnOverrides['col_value'] = {
    numberFormat: { style: 'decimal', digits: 2 },
  };
  return style;
}

describe('buildCsvExportColumns', () => {
  it('keeps visible-column order and points at schema value indexes', () => {
    const visible = [columns[1] as ColumnDef, columns[0] as ColumnDef];
    const result = buildCsvExportColumns(table, visible, 'raw', DEFAULT_TABLE_STYLE);

    expect(result.map((entry) => entry.column.id)).toEqual(['col_value', 'col_name']);
    expect(result.map((entry) => entry.valueIndex)).toEqual([1, 0]);
    expect(result.map((entry) => entry.header)).toEqual(['Value', 'Name']);
  });

  it('uses display labels only in display mode', () => {
    const style = styleWithOverride();

    expect(
      buildCsvExportColumns(table, columns, 'display', style).map((entry) => entry.header),
    ).toEqual(['Name (display)', 'Value', 'Grade']);
    expect(
      buildCsvExportColumns(table, columns, 'raw', style).map((entry) => entry.header),
    ).toEqual(['Name', 'Value', 'Grade']);
  });

  it('returns an empty plan for no visible columns', () => {
    expect(buildCsvExportColumns(table, [], 'display', DEFAULT_TABLE_STYLE)).toEqual([]);
  });
});

describe('selectCsvExportRows', () => {
  it('returns the grid rows unchanged for the view scope', () => {
    const viewRows = [rows[2] as Row, rows[0] as Row];
    expect(selectCsvExportRows('view', viewRows, rows, table, [], 'en-US')).toBe(viewRows);
  });

  it('returns physical rows for the all scope without a sort', () => {
    expect(selectCsvExportRows('all', [rows[0] as Row], rows, table, [], 'en-US')).toBe(rows);
  });

  it('keeps the current sort when the filter is ignored', () => {
    const sorted = selectCsvExportRows(
      'all',
      [rows[0] as Row],
      rows,
      table,
      [{ columnId: 'col_value', direction: 'asc' }],
      'en-US',
    );
    expect(sorted.map((row) => row.values[1])).toEqual([1, 2, 3]);
  });
});
