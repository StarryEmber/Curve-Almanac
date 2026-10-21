// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ColumnDef } from '@curve/domain';

import { I18nProvider } from '../../../i18n';

import { CellEditor } from './CellEditor';

import type { CellEditorProps } from './CellEditor';

afterEach(() => {
  cleanup();
});

const TEXT: ColumnDef = { id: 'col_text', key: 'text', label: 'Name', type: 'text', role: 'none' };
const DATE: ColumnDef = { id: 'col_date', key: 'date', label: 'Day', type: 'date', role: 'none' };
const BOOLEAN: ColumnDef = {
  id: 'col_boolean',
  key: 'flag',
  label: 'Flag',
  type: 'boolean',
  role: 'none',
};
const ENUM: ColumnDef = {
  id: 'col_enum',
  key: 'status',
  label: 'Status',
  type: 'enum',
  role: 'none',
  enumOptions: [
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
  ],
};

function renderEditor(
  column: ColumnDef,
  overrides: Partial<CellEditorProps> = {},
): ReturnType<typeof render> {
  const props: CellEditorProps = {
    column,
    value: '',
    error: null,
    busy: false,
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
    onBlur: vi.fn(),
    registerRef: vi.fn(),
    ...overrides,
  };
  return render(
    <I18nProvider initialLocale="zh-CN">
      <CellEditor {...props} />
    </I18nProvider>,
  );
}

function editor(): HTMLInputElement | HTMLSelectElement {
  return screen.getByTestId('cell-editor') as HTMLInputElement | HTMLSelectElement;
}

describe('CellEditor', () => {
  it('renders a text input with a localised label and no error state by default', () => {
    renderEditor(TEXT, { value: 'hello' });
    const input = editor();
    expect(input.tagName).toBe('INPUT');
    expect((input as HTMLInputElement).value).toBe('hello');
    expect(input.getAttribute('aria-label')).toBe('编辑 Name');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('uses a date input for date columns', () => {
    renderEditor(DATE, { value: '2026-02-03' });
    expect((editor() as HTMLInputElement).type).toBe('date');
  });

  it('commits down on Enter, sideways on Tab/Shift+Tab and cancels on Escape', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    renderEditor(TEXT, { onCommit, onCancel });

    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith('down');

    fireEvent.keyDown(editor(), { key: 'Tab' });
    expect(onCommit).toHaveBeenLastCalledWith('right');

    fireEvent.keyDown(editor(), { key: 'Tab', shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith('left');

    fireEvent.keyDown(editor(), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not commit Enter while an IME composition is active', () => {
    const onCommit = vi.fn();
    renderEditor(TEXT, { onCommit });
    const input = editor();

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('down');
  });

  it('marks the control invalid and points at the status-bar error text', () => {
    renderEditor(TEXT, { error: '第 1 行 · 列 Name：类型不匹配' });
    const input = editor();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('cs-edit-status');
  });

  it('offers a three-state boolean select', () => {
    const onChange = vi.fn();
    renderEditor(BOOLEAN, { value: 'true', onChange });
    const select = editor() as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map((option) => option.value)).toEqual(['', 'true', 'false']);

    fireEvent.change(select, { target: { value: 'false' } });
    expect(onChange).toHaveBeenCalledWith('false');
  });

  it('offers the enum values plus a blank option', () => {
    renderEditor(ENUM, { value: 'active' });
    const select = editor() as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(['', 'active', 'paused']);
    expect([...select.options].map((option) => option.textContent)).toEqual([
      '（空）',
      'Active',
      'Paused',
    ]);
  });
});
