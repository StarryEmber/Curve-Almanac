// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PasteIssue } from '@curve/app-core';

import { I18nProvider } from '../../i18n';

import { PasteErrorDialog } from './PasteErrorDialog';

function issue(overrides: Partial<PasteIssue> = {}): PasteIssue {
  return {
    reason: 'type',
    code: 'E_TYPE',
    columnId: 'col_amount',
    rowNumber: 2,
    matrixRow: 1,
    matrixColumn: 0,
    value: 'abc',
    message: 'column "amount" expects a number',
    ...overrides,
  };
}

function renderDialog(overrides: Partial<Parameters<typeof PasteErrorDialog>[0]> = {}): {
  onLocate: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const onLocate = vi.fn();
  const onClose = vi.fn();
  render(
    <I18nProvider initialLocale="zh-CN">
      <PasteErrorDialog
        open
        title="粘贴失败"
        body="整批未提交，数据没有修改。"
        issues={[issue(), issue({ rowNumber: 3, matrixRow: 2, value: 'xyz' })]}
        totalIssues={2}
        columnLabels={new Map([['col_amount', 'Amount']])}
        canLocate
        locateHint="无法定位"
        onLocate={onLocate}
        onClose={onClose}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onLocate, onClose };
}

afterEach(() => {
  cleanup();
});

describe('PasteErrorDialog', () => {
  it('lists the first issues with localised row, column and reason', () => {
    renderDialog();
    expect(screen.getByText('粘贴失败')).toBeTruthy();
    expect(screen.getByText('整批未提交，数据没有修改。')).toBeTruthy();
    expect(screen.getByText('第 2 行 · 列 Amount：类型不匹配（值：abc）')).toBeTruthy();
    expect(screen.getByText('第 3 行 · 列 Amount：类型不匹配（值：xyz）')).toBeTruthy();
    expect(screen.getByText('问题单元格（显示前 2 条，共 2 条）')).toBeTruthy();
  });

  it('calls back to locate and close', () => {
    const { onLocate, onClose } = renderDialog();
    fireEvent.click(screen.getByTestId('paste-locate-error'));
    expect(onLocate).toHaveBeenCalledTimes(1);
    const closeButtons = screen.getAllByRole('button', { name: '关闭' });
    fireEvent.click(closeButtons[closeButtons.length - 1] as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables locate and explains why when the target is not in the grid yet', () => {
    renderDialog({ canLocate: false });
    expect((screen.getByTestId('paste-locate-error') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('无法定位')).toBeTruthy();
  });

  it('renders a message-only dialog without an issue list', () => {
    renderDialog({
      issues: [],
      totalIssues: 0,
      title: '筛选激活时无法粘贴',
      body: '当前视图有筛选条件。',
    });
    expect(screen.getByText('筛选激活时无法粘贴')).toBeTruthy();
    expect(screen.getByText('当前视图有筛选条件。')).toBeTruthy();
    expect(screen.queryByTestId('paste-error-list')).toBeNull();
  });
});
