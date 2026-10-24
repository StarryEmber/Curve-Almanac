// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ColumnDef, TableMeta } from '@curve/domain';

import { I18nProvider } from '../../i18n';

import { ExportCsvDialogView } from './ExportCsvDialog';

import type { ExportCsvDialogViewProps } from './ExportCsvDialog';

const columns: ColumnDef[] = [
  { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'none' },
  { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'none' },
];

const table: TableMeta = {
  id: 'tbl_export',
  name: 'Readings',
  file: 'tables/tbl_export.jsonl',
  schemaVersion: 1,
  columns,
  primaryKey: 'col_name',
  rowCount: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderView(overrides: Partial<ExportCsvDialogViewProps> = {}) {
  const props: ExportCsvDialogViewProps = {
    open: true,
    tableMeta: table,
    visibleColumns: columns,
    hiddenCount: 1,
    viewRowCount: 5,
    allRowCount: 42,
    mode: 'display',
    scope: 'view',
    phase: 'idle',
    sentRows: 0,
    totalRows: 0,
    result: null,
    error: null,
    onModeChange: vi.fn(),
    onScopeChange: vi.fn(),
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider initialLocale="zh-CN">
      <ExportCsvDialogView {...props} />
    </I18nProvider>,
  );
  return props;
}

afterEach(() => {
  cleanup();
});

describe('ExportCsvDialogView', () => {
  it('shows the export scope, hidden-column hint and default file name', () => {
    renderView();

    expect(screen.getByRole('dialog', { name: '导出 CSV' })).toBeDefined();
    expect(screen.getByTestId('export-csv-dialog').getAttribute('data-export-phase')).toBe('idle');
    expect(screen.getByText('将导出 5 行 × 2 列。')).toBeDefined();
    expect(screen.getByText('1 个隐藏列不会导出。')).toBeDefined();
    expect(screen.getByText('默认文件名：Readings-<日期时间>.csv')).toBeDefined();
    expect(screen.getByRole('button', { name: '导出' })).toBeDefined();
  });

  it('changes the value format and row scope', () => {
    const props = renderView();
    const selects = screen.getAllByRole('combobox');

    fireEvent.change(selects[0] as HTMLSelectElement, { target: { value: 'raw' } });
    expect(props.onModeChange).toHaveBeenCalledWith('raw');
    fireEvent.change(selects[1] as HTMLSelectElement, { target: { value: 'all' } });
    expect(props.onScopeChange).toHaveBeenCalledWith('all');
  });

  it('summarises the all-rows scope with the physical row count', () => {
    renderView({ scope: 'all', allRowCount: 42 });
    expect(screen.getByText('将导出 42 行 × 2 列。')).toBeDefined();
  });

  it('shows progress and lets the user cancel while running', () => {
    const props = renderView({ phase: 'running', sentRows: 2, totalRows: 5 });

    expect(screen.getByTestId('export-csv-progress').getAttribute('data-export-sent')).toBe('2');
    expect(screen.getByText('正在导出 2 / 5 行…')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '取消导出' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables the cancel button while cancelling', () => {
    renderView({ phase: 'cancelling', sentRows: 2, totalRows: 5 });
    expect(screen.getByText('正在取消…')).toBeDefined();
    expect((screen.getByRole('button', { name: '取消导出' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('shows the exported path and row count on success', () => {
    renderView({
      phase: 'done',
      result: { path: 'C:\\exports\\Readings-20261024-1605.csv', rows: 5, bytes: 128 },
    });

    expect(screen.getByTestId('export-csv-done').textContent).toContain(
      '已导出 5 行到 C:\\exports\\Readings-20261024-1605.csv',
    );
    expect(screen.getByText('文件大小：128 字节')).toBeDefined();
    expect(screen.getAllByRole('button', { name: '关闭' }).length).toBeGreaterThan(0);
  });

  it('shows a localised failure and offers a retry', () => {
    const props = renderView({
      phase: 'error',
      error: { code: 'E_EXPORT_FAILED', message: 'RAW_SECRET' },
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('导出失败：导出失败。 (E_EXPORT_FAILED)');
    expect(alert.textContent).not.toContain('RAW_SECRET');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });

  it('shows the cancelled state with a close action', () => {
    const props = renderView({ phase: 'cancelled' });
    expect(screen.getByTestId('export-csv-cancelled').textContent).toContain('已取消导出。');
    fireEvent.click(screen.getAllByRole('button', { name: '关闭' }).at(-1) as HTMLElement);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the start button when the view has no visible columns', () => {
    renderView({ visibleColumns: [] });
    expect((screen.getByRole('button', { name: '导出' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
