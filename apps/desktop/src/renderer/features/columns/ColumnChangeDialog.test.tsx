// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ColumnChangeInspection, ColumnChangeSummary } from '@curve/app-core';

import { I18nProvider } from '../../i18n';

import { ColumnChangeDialog } from './ColumnChangeDialog';

function summary(overrides: Partial<ColumnChangeSummary> = {}): ColumnChangeSummary {
  return {
    tableId: 'tbl_1',
    kind: 'update',
    columnId: 'col_value',
    affectedRows: 3,
    convertedCells: 2,
    viewUpdates: 1,
    invalidCharts: 0,
    columnCount: 3,
    primaryKey: 'col_id',
    ...overrides,
  };
}

function renderDialog(
  inspection: ColumnChangeInspection,
  overrides: { intent?: 'delete' | 'update' | 'primary-key'; error?: string | null } = {},
): ReturnType<typeof vi.fn> {
  const onConfirm = vi.fn();
  render(
    <I18nProvider initialLocale="zh-CN">
      <ColumnChangeDialog
        open
        intent={overrides.intent ?? 'update'}
        columnName="Value"
        inspection={inspection}
        busy={false}
        error={overrides.error ?? null}
        onConfirm={onConfirm}
        onClose={() => undefined}
      />
    </I18nProvider>,
  );
  return onConfirm;
}

afterEach(() => {
  cleanup();
});

describe('ColumnChangeDialog', () => {
  it('shows the affected counts and confirms a successful preview', () => {
    const onConfirm = renderDialog({ ok: true, summary: summary() });

    expect(screen.getByRole('dialog', { name: '修改列“Value”？' })).toBeDefined();
    expect(screen.getByText('受影响行数：3')).toBeDefined();
    expect(screen.getByText('需转换单元格：2')).toBeDefined();
    expect(screen.getByText('需清理视图：1')).toBeDefined();

    fireEvent.click(screen.getByTestId('column-change-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('lists failures, blocks the confirmation and never dispatches', () => {
    const onConfirm = renderDialog({
      ok: false,
      error: { code: 'E_TYPE', message: 'conversion failed' },
      failures: [
        { rowNumber: 2, rowId: 'row_2', value: 'abc', code: 'E_TYPE', message: 'not a number' },
        { rowNumber: 5, rowId: 'row_5', value: null, code: 'E_REQUIRED', message: 'required' },
      ],
      totalFailures: 12,
    });

    expect(screen.getByRole('dialog', { name: '无法修改列“Value”' })).toBeDefined();
    expect(
      screen.getByRole('heading', { name: '无法转换的行（显示前 2 行，共 12 行）' }),
    ).toBeDefined();
    expect(screen.getByTestId('column-change-failures').children).toHaveLength(2);
    expect(screen.getByText('第 2 行：abc（类型不匹配）')).toBeDefined();
    expect(screen.getByText('第 5 行：（空）（必填）')).toBeDefined();
    expect(screen.getByText('整批操作已取消，数据未修改。')).toBeDefined();

    const confirm = screen.getByTestId('column-change-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('warns that charts will stay invalid on a delete and uses the danger action name', () => {
    renderDialog(
      { ok: true, summary: summary({ kind: 'delete', convertedCells: 0, invalidCharts: 2 }) },
      { intent: 'delete' },
    );

    expect(screen.getByRole('dialog', { name: '删除列“Value”？' })).toBeDefined();
    expect(screen.getByText('将失效图表：2')).toBeDefined();
    expect(
      screen.getByText('图表映射不会自动修改；相关图表会显示“列已删除”，需要重新映射。'),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: '删除列' })).toBeDefined();
  });

  it('renders a save error passed by the panel', () => {
    renderDialog({ ok: true, summary: summary() }, { error: '文件写入失败。 (E_FS_WRITE)' });

    expect(screen.getByRole('alert').textContent).toContain('E_FS_WRITE');
  });
});
