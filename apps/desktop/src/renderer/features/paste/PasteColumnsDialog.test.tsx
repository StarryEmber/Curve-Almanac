// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PasteColumnDraft } from '@curve/app-core';

import { I18nProvider } from '../../i18n';

import { PasteColumnsDialog } from './PasteColumnsDialog';

function drafts(): PasteColumnDraft[] {
  return [
    { label: '列 3', type: 'text' },
    { label: '列 4', type: 'text' },
  ];
}

function renderDialog(overrides: Partial<Parameters<typeof PasteColumnsDialog>[0]> = {}): {
  onChange: ReturnType<typeof vi.fn>;
  onConfirm: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const onChange = vi.fn();
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <I18nProvider initialLocale="zh-CN">
      <PasteColumnsDialog
        open
        count={2}
        drafts={drafts()}
        existingColumnCount={2}
        maxColumns={100}
        busy={false}
        error={null}
        onChange={onChange}
        onConfirm={onConfirm}
        onClose={onClose}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onChange, onConfirm, onClose };
}

afterEach(() => {
  cleanup();
});

describe('PasteColumnsDialog', () => {
  it('lists one name and type field per new column', () => {
    renderDialog();
    expect(screen.getByText('粘贴需要新增 2 列')).toBeTruthy();
    expect((screen.getByTestId('paste-column-label-0') as HTMLInputElement).value).toBe('列 3');
    expect((screen.getByTestId('paste-column-type-1') as HTMLSelectElement).value).toBe('text');
  });

  it('forwards label and type edits and confirms', () => {
    const { onChange, onConfirm } = renderDialog();
    fireEvent.change(screen.getByTestId('paste-column-label-0'), {
      target: { value: 'Score' },
    });
    fireEvent.change(screen.getByTestId('paste-column-type-1'), {
      target: { value: 'number' },
    });
    expect(onChange).toHaveBeenCalledWith(0, { label: 'Score' });
    expect(onChange).toHaveBeenCalledWith(1, { type: 'number' });

    fireEvent.click(screen.getByTestId('paste-columns-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables confirmation when the 100-column cap would be exceeded', () => {
    renderDialog({ existingColumnCount: 99 });
    expect(screen.getByText(/会超过 100 列上限/)).toBeTruthy();
    expect((screen.getByTestId('paste-columns-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a field error and still allows closing', () => {
    const { onClose } = renderDialog({ error: '请填写显示名称。' });
    expect(screen.getByText('请填写显示名称。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
