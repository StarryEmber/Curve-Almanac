// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_TABLE_STYLE } from '@curve/domain';
import type { ColumnDef, Row, TableMeta, ViewDef } from '@curve/domain';

import { AppCoreProvider } from '../../app-core/use-app-core';
import { I18nProvider } from '../../i18n';

import { useCsvExport } from './use-export-csv';

import type { IpcResult } from '../../../shared/contracts/envelope';
import type { CurveApi, ExportCsvReply, ExportCsvRequest } from '../../../shared/contracts/ipc';
import type { RendererCore } from '../../app-core/renderer-core';
import type { ReactElement, ReactNode } from 'react';

const columns: ColumnDef[] = [
  { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'none' },
  { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'none' },
  { id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'none' },
];

const table: TableMeta = {
  id: 'tbl_export',
  name: 'Readings',
  file: 'tables/tbl_export.jsonl',
  schemaVersion: 1,
  columns,
  primaryKey: 'col_name',
  rowCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const rows: Row[] = [
  { id: 'row_1', values: ['alpha', 1234.5, 1_700_000_000_000] },
  { id: 'row_2', values: ['beta', 2, 1_700_000_100_000] },
];

const view: ViewDef = {
  id: 'viw_1',
  kind: 'table',
  refId: table.id,
  title: 'Readings',
  tableView: {
    tableId: table.id,
    styleId: 'builtin.report-light',
    columnOrder: columns.map((column) => column.id),
    widths: {},
    hiddenColumnIds: [],
    sort: [{ columnId: 'col_value', direction: 'asc' }],
    frozenColumnCount: 0,
  },
};

type ExportHandler = (request: ExportCsvRequest) => Promise<IpcResult<ExportCsvReply | null>>;

function createCore(handler: ExportHandler): {
  core: RendererCore;
  calls: ExportCsvRequest[];
} {
  const calls: ExportCsvRequest[] = [];
  const exportCsv = vi.fn(async (request: ExportCsvRequest) => {
    calls.push(request);
    return handler(request);
  });
  const api = {
    file: { exportCsv },
  } as unknown as CurveApi;
  const core = {
    api,
    tableIo: { terminate: vi.fn() },
    query: { terminate: vi.fn() },
  } as unknown as RendererCore;
  return { core, calls };
}

function wrapperFor(core: RendererCore): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <AppCoreProvider core={core}>
        <I18nProvider initialLocale="zh-CN">{children}</I18nProvider>
      </AppCoreProvider>
    );
  };
}

function input() {
  return {
    tableMeta: table,
    tableStyle: DEFAULT_TABLE_STYLE,
    view,
    visibleColumns: columns,
    rows,
    allRows: rows,
  };
}

function successfulHandler(): ExportHandler {
  return async (request) => {
    if (request.op === 'begin') {
      return { ok: true, data: { op: 'begin', token: 'tok_1', path: 'C:/out.csv' } };
    }
    if (request.op === 'append') {
      return { ok: true, data: { op: 'append', bytes: request.chunk.length } };
    }
    if (request.op === 'finish') {
      return {
        ok: true,
        data: { op: 'finish', path: 'C:/out.csv', bytes: 42, rows: request.rows },
      };
    }
    return { ok: true, data: { op: 'cancel', removed: true } };
  };
}

describe('useCsvExport', () => {
  it('streams the view rows with the display formatter and reports completion', async () => {
    const { core, calls } = createCore(successfulHandler());
    const { result } = renderHook(() => useCsvExport(input()), {
      wrapper: wrapperFor(core),
    });

    await act(async () => {
      await result.current.start({ mode: 'display', scope: 'view' });
    });

    await waitFor(() => {
      expect(result.current.phase).toBe('done');
    });
    expect(result.current.result).toEqual({ path: 'C:/out.csv', rows: 2, bytes: 42 });
    expect(result.current.sentRows).toBe(2);
    expect(result.current.totalRows).toBe(2);

    const chunks = calls
      .filter((call): call is Extract<ExportCsvRequest, { op: 'append' }> => call.op === 'append')
      .map((call) => call.chunk);
    const text = chunks.join('');
    expect(text.startsWith('\uFEFFName,Value,Day\r\n')).toBe(true);
    expect(text).toContain('1,234.5');
    expect(text).not.toContain('1700000000000');
    expect(calls.filter((call) => call.op === 'append')).toHaveLength(2);
    expect(calls.filter((call) => call.op !== 'append').map((call) => call.op)).toEqual([
      'begin',
      'finish',
    ]);
  });

  it('uses stored values and the current sort for the all-rows scope', async () => {
    const { core, calls } = createCore(successfulHandler());
    const { result } = renderHook(() => useCsvExport(input()), {
      wrapper: wrapperFor(core),
    });

    await act(async () => {
      await result.current.start({ mode: 'raw', scope: 'all' });
    });
    await waitFor(() => {
      expect(result.current.phase).toBe('done');
    });

    const text = calls
      .filter((call): call is Extract<ExportCsvRequest, { op: 'append' }> => call.op === 'append')
      .map((call) => call.chunk)
      .join('');
    expect(text).toContain('beta,2,1700000100000');
    expect(text).toContain('alpha,1234.5,1700000000000');
    expect(text.indexOf('beta,2')).toBeLessThan(text.indexOf('alpha,1234.5'));
  });

  it('cancels after the in-flight chunk and never finishes the file', async () => {
    const calls: ExportCsvRequest[] = [];
    let releaseAppend: (() => void) | null = null;
    const { core } = createCore(async (request) => {
      calls.push(request);
      if (request.op === 'begin') {
        return { ok: true, data: { op: 'begin', token: 'tok_1', path: 'C:/out.csv' } };
      }
      if (request.op === 'append') {
        await new Promise<void>((resolve) => {
          releaseAppend = resolve;
        });
        return { ok: true, data: { op: 'append', bytes: request.chunk.length } };
      }
      return { ok: true, data: { op: 'cancel', removed: true } };
    });
    const { result } = renderHook(() => useCsvExport(input()), {
      wrapper: wrapperFor(core),
    });

    let pending: Promise<void> | null = null;
    act(() => {
      pending = result.current.start({ mode: 'display', scope: 'view' });
    });
    await waitFor(() => {
      expect(result.current.phase).toBe('running');
      expect(releaseAppend).not.toBeNull();
    });

    act(() => {
      result.current.cancel();
    });
    expect(result.current.phase).toBe('cancelling');

    await act(async () => {
      releaseAppend?.();
      await pending;
    });
    await waitFor(() => {
      expect(result.current.phase).toBe('cancelled');
    });
    expect(calls.some((call) => call.op === 'cancel')).toBe(true);
    expect(calls.some((call) => call.op === 'finish')).toBe(false);
  });

  it('returns to idle when the save dialog is cancelled', async () => {
    const { core } = createCore(async () => ({ ok: true, data: null }));
    const { result } = renderHook(() => useCsvExport(input()), {
      wrapper: wrapperFor(core),
    });

    await act(async () => {
      await result.current.start({ mode: 'display', scope: 'view' });
    });
    expect(result.current.phase).toBe('idle');
  });

  it('reports an append failure and cancels the session', async () => {
    const calls: ExportCsvRequest[] = [];
    const { core } = createCore(async (request) => {
      calls.push(request);
      if (request.op === 'begin') {
        return { ok: true, data: { op: 'begin', token: 'tok_1', path: 'C:/out.csv' } };
      }
      if (request.op === 'append') {
        return { ok: false, error: { code: 'E_EXPORT_FAILED', message: 'disk full' } };
      }
      return { ok: true, data: { op: 'cancel', removed: true } };
    });
    const { result } = renderHook(() => useCsvExport(input()), {
      wrapper: wrapperFor(core),
    });

    await act(async () => {
      await result.current.start({ mode: 'display', scope: 'view' });
    });
    await waitFor(() => {
      expect(result.current.phase).toBe('error');
    });
    expect(result.current.error).toMatchObject({ code: 'E_EXPORT_FAILED' });
    expect(calls.some((call) => call.op === 'cancel')).toBe(true);
  });
});
