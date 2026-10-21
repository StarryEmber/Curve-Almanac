import { describe, expect, it } from 'vitest';

import type { ChartSpec, ColumnDef, Row, TableMeta, ViewDef } from '@curve/domain';

import { inspectColumnChange } from './column-change';

import type { ColumnChange } from './column-change';
import type { AppState } from '../state/types';

const TIMESTAMP = '2026-10-20T05:00:00.000Z';

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Readings',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
      { id: 'col_note', key: 'note', label: 'Note', type: 'text', role: 'none' },
    ],
    primaryKey: 'col_id',
    rowCount: 2,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function makeRows(): Row[] {
  return [
    { id: 'row_1', values: ['a', 10, 'first'] },
    { id: 'row_2', values: ['b', 20, 'second'] },
  ];
}

function makeView(): ViewDef {
  return {
    id: 'viw_1',
    kind: 'table',
    refId: 'tbl_1',
    title: 'Readings',
    tableView: {
      tableId: 'tbl_1',
      styleId: 'builtin.report-light',
      columnOrder: ['col_id', 'col_value', 'col_note'],
      widths: { col_value: 120 },
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: 1,
    },
  };
}

function makeChart(): ChartSpec {
  return {
    id: 'cht_1',
    title: 'Chart',
    kind: 'line',
    tableId: 'tbl_1',
    mapping: { layout: 'wide', xColumnId: 'col_id', yColumnIds: ['col_value'] },
    sort: [],
    options: {
      smooth: false,
      showSymbol: true,
      lineWidth: 2,
      paletteId: 'default',
      background: 'auto',
      showGrid: true,
      legend: 'top',
      yStartAtZero: false,
      numberDigits: 1,
      sampling: { enabled: true, threshold: 2000, target: 1000 },
    },
    version: 1,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

type InspectionState = Pick<AppState, 'tables' | 'views' | 'charts'>;

function makeState(overrides: Partial<InspectionState> = {}): InspectionState {
  return {
    tables: {
      tbl_1: { table: makeTable(), rows: makeRows() },
    },
    views: { viw_1: makeView() },
    charts: { cht_1: makeChart() },
    ...overrides,
  };
}

function newColumn(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: 'col_extra',
    key: 'extra',
    label: 'Extra',
    type: 'text',
    role: 'none',
    ...overrides,
  };
}

function change(overrides: Partial<ColumnChange> = {}): ColumnChange {
  return { kind: 'add', tableId: 'tbl_1', column: newColumn(), ...overrides } as ColumnChange;
}

describe('inspectColumnChange', () => {
  it('summarises a successful add with view updates', () => {
    const inspection = inspectColumnChange(makeState(), change());

    expect(inspection.ok).toBe(true);
    if (!inspection.ok) {
      return;
    }
    expect(inspection.summary).toMatchObject({
      kind: 'add',
      columnId: 'col_extra',
      affectedRows: 2,
      convertedCells: 0,
      viewUpdates: 1,
      invalidCharts: 0,
      columnCount: 4,
      primaryKey: 'col_id',
    });
  });

  it('reports conversion failures without a summary', () => {
    const state = makeState({
      tables: {
        tbl_1: {
          table: makeTable({
            columns: [
              { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' },
              { id: 'col_value', key: 'value', label: 'Value', type: 'text', role: 'y' },
            ],
          }),
          rows: [
            { id: 'row_1', values: ['a', 'not a number'] },
            { id: 'row_2', values: ['b', '12'] },
          ],
        },
      },
    });
    const inspection = inspectColumnChange(state, {
      kind: 'update',
      tableId: 'tbl_1',
      column: { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    });

    expect(inspection.ok).toBe(false);
    if (inspection.ok) {
      return;
    }
    expect(inspection.error.code).toBe('E_TYPE');
    expect(inspection.failures).toHaveLength(1);
    expect(inspection.totalFailures).toBe(1);
  });

  it('counts chart references when a column is deleted', () => {
    const inspection = inspectColumnChange(makeState(), {
      kind: 'delete',
      tableId: 'tbl_1',
      columnId: 'col_value',
    });

    expect(inspection.ok).toBe(true);
    if (!inspection.ok) {
      return;
    }
    expect(inspection.summary).toMatchObject({
      kind: 'delete',
      affectedRows: 2,
      viewUpdates: 1,
      invalidCharts: 1,
      columnCount: 2,
    });
  });

  it('does not count charts that do not reference the deleted column', () => {
    const inspection = inspectColumnChange(makeState(), {
      kind: 'delete',
      tableId: 'tbl_1',
      columnId: 'col_note',
    });

    expect(inspection.ok).toBe(true);
    if (inspection.ok) {
      expect(inspection.summary.invalidCharts).toBe(0);
    }
  });

  it('refuses to delete the primary key', () => {
    const inspection = inspectColumnChange(makeState(), {
      kind: 'delete',
      tableId: 'tbl_1',
      columnId: 'col_id',
    });

    expect(inspection.ok).toBe(false);
    if (!inspection.ok) {
      expect(inspection.error.code).toBe('E_VALIDATION');
    }
  });

  it('summarises a reorder with no target column', () => {
    const inspection = inspectColumnChange(makeState(), {
      kind: 'reorder',
      tableId: 'tbl_1',
      columnIds: ['col_note', 'col_id', 'col_value'],
    });

    expect(inspection.ok).toBe(true);
    if (!inspection.ok) {
      return;
    }
    expect(inspection.summary).toMatchObject({
      kind: 'reorder',
      columnId: null,
      viewUpdates: 1,
      columnCount: 3,
    });
  });

  it('summarises a primary key change', () => {
    const inspection = inspectColumnChange(makeState(), {
      kind: 'primary-key',
      tableId: 'tbl_1',
      columnId: 'col_note',
    });

    expect(inspection.ok).toBe(true);
    if (!inspection.ok) {
      return;
    }
    expect(inspection.summary).toMatchObject({
      kind: 'primary-key',
      primaryKey: 'col_note',
      viewUpdates: 0,
      columnCount: 3,
    });
  });

  it('returns E_TABLE_NOT_FOUND for an unknown table', () => {
    const inspection = inspectColumnChange(makeState(), {
      kind: 'delete',
      tableId: 'tbl_missing',
      columnId: 'col_value',
    });

    expect(inspection.ok).toBe(false);
    if (!inspection.ok) {
      expect(inspection.error.code).toBe('E_TABLE_NOT_FOUND');
    }
  });
});
