// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n';

import { PasteProgressDialog } from './PasteProgressDialog';

function renderDialog(overrides: Partial<Parameters<typeof PasteProgressDialog>[0]> = {}): {
  onCancel: ReturnType<typeof vi.fn>;
} {
  const onCancel = vi.fn();
  render(
    <I18nProvider initialLocale="zh-CN">
      <PasteProgressDialog
        open
        progress={{ processedRows: 100, totalRows: 200, done: 5_000, total: 10_000 }}
        phase="validating"
        onCancel={onCancel}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onCancel };
}

afterEach(() => {
  cleanup();
});

describe('PasteProgressDialog', () => {
  it('shows validation progress and a percentage', () => {
    renderDialog();
    expect(screen.getByText('正在校验 5000 / 10000 个单元格…')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    const bar = screen.getByRole('progressbar') as HTMLProgressElement;
    expect(bar.value).toBe(5_000);
    expect(bar.max).toBe(10_000);
  });

  it('cancels while validating', () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByTestId('paste-progress-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables cancellation while saving because the command already committed', () => {
    renderDialog({ phase: 'saving' });
    expect(screen.getByText('正在保存…')).toBeTruthy();
    expect((screen.getByTestId('paste-progress-cancel') as HTMLButtonElement).disabled).toBe(true);
  });
});
