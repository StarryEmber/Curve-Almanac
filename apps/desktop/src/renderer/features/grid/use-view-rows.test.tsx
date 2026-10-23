// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppError } from '@curve/domain';
import type { FilterPredicate, Row, SortSpec, TableMeta, TableViewState } from '@curve/domain';
import type { TableData } from '@curve/table-engine';

import { AppCoreProvider } from '../../app-core/use-app-core';
import { I18nProvider } from '../../i18n';

import { useViewRows } from './use-view-rows';

import type { RendererCore } from '../../app-core/renderer-core';
import type { QueryClient } from '../../query/client';
import type { ReactElement } from 'react';

const columns: TableMeta['columns'] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'none' },
];

const table: TableMeta = {
  id: 'tbl_rows',
  name: 'Rows',
  file: 'tables/tbl_rows.jsonl',
  schemaVersion: 1,
  columns,
  primaryKey: 'col_id',
  rowCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const rows: Row[] = [
  { id: 'row_a', values: ['a', 'Alpha'] },
  { id: 'row_b', values: ['b', 'Beta'] },
  { id: 'row_c', values: ['c', 'Gamma'] },
];

function tableView(overrides: Partial<TableViewState> = {}): TableViewState {
  return {
    tableId: table.id,
    styleId: 'builtin.report-light',
    columnOrder: columns.map((column) => column.id),
    widths: {},
    hiddenColumnIds: [],
    sort: [],
    frozenColumnCount: 0,
    ...overrides,
  };
}

function fakeQuery(overrides: Partial<QueryClient> = {}): QueryClient {
  return {
    syncTable: vi.fn(async () => ({
      ok: true as const,
      result: { tableId: table.id, rowCount: 3 },
    })),
    query: vi.fn(async () => ({
      ok: true as const,
      result: { rowIds: ['row_c'], visibleRows: 1, durationMs: 12.5 },
    })),
    terminate: vi.fn(),
    pending: 0,
    trackedTables: 0,
    ...overrides,
  } as QueryClient;
}

function Harness({
  tableData,
  view,
}: {
  tableData: TableData;
  view: TableViewState | undefined;
}): ReactElement {
  const result = useViewRows(tableData, view);
  return (
    <div>
      <span data-testid="ids">{result.rows.map((row) => row.id).join(',')}</span>
      <span data-testid="mode">{result.mode}</span>
      <span data-testid="busy">{String(result.busy)}</span>
      <span data-testid="warning">{result.warning?.code ?? ''}</span>
      <span data-testid="error">{result.error?.code ?? ''}</span>
      <span data-testid="ms">{result.queryMs === null ? '' : String(result.queryMs)}</span>
    </div>
  );
}

function mount(tableData: TableData, view: TableViewState | undefined, query: QueryClient): void {
  const core = {
    query,
    tableIo: { terminate: vi.fn() },
  } as unknown as RendererCore;
  render(
    <AppCoreProvider core={core}>
      <I18nProvider initialLocale="zh-CN">
        <Harness tableData={tableData} view={view} />
      </I18nProvider>
    </AppCoreProvider>,
  );
}

afterEach(() => {
  cleanup();
});

const filter: FilterPredicate = {
  kind: 'compare',
  columnId: 'col_name',
  op: 'startsWith',
  value: 'Al',
};

const largeFilter: FilterPredicate = {
  kind: 'compare',
  columnId: 'col_name',
  op: 'contains',
  value: 'Name',
};

describe('useViewRows', () => {
  it('returns the physical rows when there is no filter or sort', () => {
    const query = fakeQuery();
    mount({ table, rows }, tableView(), query);
    expect(screen.getByTestId('ids').textContent).toBe('row_a,row_b,row_c');
    expect(screen.getByTestId('mode').textContent).toBe('plain');
    expect(query.syncTable).not.toHaveBeenCalled();
    expect(query.query).not.toHaveBeenCalled();
  });

  it('filters small tables on the main thread', async () => {
    mount({ table, rows }, tableView({ filter }), fakeQuery());
    await waitFor(() => {
      expect(screen.getByTestId('mode').textContent).toBe('sync');
    });
    expect(screen.getByTestId('ids').textContent).toBe('row_a');
  });

  it('uses the query worker above the threshold', async () => {
    const largeRows: Row[] = Array.from({ length: 20_001 }, (_value, index) => ({
      id: `row_${String(index)}`,
      values: [`r${String(index)}`, `Name ${String(index)}`],
    }));
    const query = fakeQuery({
      query: vi.fn(async () => ({
        ok: true as const,
        result: { rowIds: ['row_42'], visibleRows: 1, durationMs: 7 },
      })),
    });
    mount({ table, rows: largeRows }, tableView({ filter: largeFilter }), query);
    await waitFor(() => {
      expect(screen.getByTestId('mode').textContent).toBe('worker');
    });
    expect(query.syncTable).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ids').textContent).toBe('row_42');
    expect(screen.getByTestId('ms').textContent).toBe('7');
  });

  it('falls back to the main thread when the worker query fails', async () => {
    const largeRows: Row[] = Array.from({ length: 20_001 }, (_value, index) => ({
      id: `row_${String(index)}`,
      values: [`r${String(index)}`, `Name ${String(index)}`],
    }));
    const query = fakeQuery({
      query: vi.fn(async () => ({
        ok: false as const,
        error: createAppError('E_UNKNOWN', 'worker failed'),
      })),
    });
    mount({ table, rows: largeRows }, tableView({ filter: largeFilter }), query);
    await waitFor(() => {
      expect(screen.getByTestId('mode').textContent).toBe('fallback');
    });
    expect(screen.getByTestId('warning').textContent).toBe('E_UNKNOWN');
    expect(screen.getByTestId('ids').textContent.length).toBeGreaterThan(0);
  });

  it('reports an invalid filter instead of rendering wrong rows', async () => {
    const invalid: FilterPredicate = {
      kind: 'compare',
      columnId: 'col_name',
      op: 'gt',
      value: 'x',
    };
    mount({ table, rows }, tableView({ filter: invalid }), fakeQuery());
    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('E_VALIDATION');
    });
    expect(screen.getByTestId('ids').textContent).toBe('');
  });

  it('keeps the previous result while a new sort query is running', async () => {
    const sort: SortSpec[] = [{ columnId: 'col_name', direction: 'desc' }];
    const query = fakeQuery({
      query: vi.fn(async () => ({
        ok: true as const,
        result: { rowIds: ['row_b', 'row_a'], visibleRows: 2, durationMs: 3 },
      })),
    });
    mount({ table, rows: largeRowsForSort() }, tableView({ sort }), query);
    await waitFor(() => {
      expect(screen.getByTestId('mode').textContent).toBe('worker');
    });
    expect(screen.getByTestId('ids').textContent).toBe('row_b,row_a');
  });
});

function largeRowsForSort(): Row[] {
  return Array.from({ length: 20_001 }, (_value, index) => ({
    id: index < 2 ? (index === 0 ? 'row_a' : 'row_b') : `row_${String(index)}`,
    values: [`r${String(index)}`, String(index)],
  }));
}
