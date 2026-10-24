// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TABLE_STYLE, createTableStyle } from '@curve/domain';
import type { ColumnDef, Row, TableMeta, TableStyle, ViewDef } from '@curve/domain';

import { I18nProvider } from '../../i18n';

import { StyleEditorDialog } from './StyleEditorDialog';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

const columns: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
];

const table: TableMeta = {
  id: 'tbl_1',
  name: 'Readings',
  file: 'tables/tbl_1.jsonl',
  schemaVersion: 1,
  columns,
  primaryKey: 'col_id',
  rowCount: 60,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const rows: Row[] = Array.from({ length: 60 }, (_value, index) => ({
  id: `row_${String(index)}`,
  values: [`r${String(index)}`, index],
}));

const view: ViewDef = {
  id: 'viw_1',
  kind: 'table',
  refId: table.id,
  title: 'Readings',
  tableView: {
    tableId: table.id,
    styleId: 'sty_test',
    columnOrder: columns.map((column) => column.id),
    widths: {},
    hiddenColumnIds: [],
    sort: [],
    frozenColumnCount: 0,
  },
};

function userStyle(): TableStyle {
  return createTableStyle({ id: 'sty_test', name: 'Test' });
}

function renderEditor(tableStyle: TableStyle = userStyle()): {
  onCreateStyle: ReturnType<typeof vi.fn>;
  onUpdateStyle: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const onCreateStyle = vi.fn(async () => ({ ok: true as const }));
  const onUpdateStyle = vi.fn(async () => ({ ok: true as const }));
  const onClose = vi.fn();
  render(
    <I18nProvider initialLocale="zh-CN">
      <StyleEditorDialog
        open
        table={table}
        view={view}
        tableStyle={tableStyle}
        rows={rows}
        onClose={onClose}
        onCreateStyle={onCreateStyle}
        onUpdateStyle={onUpdateStyle}
      />
    </I18nProvider>,
  );
  return { onCreateStyle, onUpdateStyle, onClose };
}

afterEach(() => {
  cleanup();
});

describe('StyleEditorDialog', () => {
  it('renders at most 50 preview rows and commits one undo entry per control', async () => {
    const { onUpdateStyle } = renderEditor();
    expect(screen.getAllByTestId(/^preview-row-/)).toHaveLength(50);
    const preview = screen.getByTestId('style-preview');
    expect(preview.style.getPropertyValue('--cs-table-row-height')).toBe('32px');

    fireEvent.change(screen.getByTestId('style-density'), { target: { value: 'compact' } });
    await waitFor(() => {
      expect(onUpdateStyle).toHaveBeenCalledTimes(1);
    });
    const compactHeight = Number.parseFloat(
      preview.style.getPropertyValue('--cs-table-row-height'),
    );
    expect(compactHeight).toBeLessThan(32);
    // The 100ms budget is asserted in the real Electron E2E; jsdom under the
    // full coverage run does not own that performance gate.
    expect(preview.getAttribute('data-preview-ms')).not.toBe('');
    const densityCall = onUpdateStyle.mock.calls[0]?.[0] as TableStyle;
    expect(densityCall.id).toBe('sty_test');
    expect(densityCall.tokens.density).toBe('compact');

    fireEvent.change(screen.getByTestId('style-font-size'), { target: { value: '14' } });
    fireEvent.blur(screen.getByTestId('style-font-size'));
    await waitFor(() => {
      expect(onUpdateStyle).toHaveBeenCalledTimes(2);
    });
    const fontCall = onUpdateStyle.mock.calls[1]?.[0] as TableStyle;
    expect(fontCall.tokens.fontSize).toBe(14);
  });

  it('does not submit an invalid colour and blocks finishing', () => {
    const { onUpdateStyle } = renderEditor();
    const field = screen.getByLabelText('表头背景');
    fireEvent.change(field, { target: { value: 'not-a-colour' } });
    fireEvent.blur(field);

    expect(onUpdateStyle).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole('alert')
        .map((alert) => alert.textContent)
        .join(' '),
    ).toContain('十六进制颜色');
    expect((screen.getByTestId('style-done') as HTMLButtonElement).disabled).toBe(true);
  });

  it('forks a builtin on the first commit and uses style.update afterwards', async () => {
    const { onCreateStyle, onUpdateStyle } = renderEditor(DEFAULT_TABLE_STYLE);
    expect(screen.getAllByTestId(/^preview-row-/)).toHaveLength(50);

    fireEvent.change(screen.getByTestId('style-density'), { target: { value: 'compact' } });
    await waitFor(() => {
      expect(onCreateStyle).toHaveBeenCalledTimes(1);
    });
    expect(onUpdateStyle).not.toHaveBeenCalled();
    const created = onCreateStyle.mock.calls[0]?.[0] as TableStyle;
    expect(created.id.startsWith('sty_')).toBe(true);
    expect(created.builtin).toBe(false);
    expect(created.tokens.density).toBe('compact');

    fireEvent.change(screen.getByTestId('style-font-size'), { target: { value: '15' } });
    fireEvent.blur(screen.getByTestId('style-font-size'));
    await waitFor(() => {
      expect(onUpdateStyle).toHaveBeenCalledTimes(1);
    });
    const updated = onUpdateStyle.mock.calls[0]?.[0] as TableStyle;
    expect(updated.id).toBe(created.id);
    expect(updated.tokens.fontSize).toBe(15);
  });

  it('adds a conditional rule through the form in one commit', async () => {
    const { onUpdateStyle } = renderEditor();
    fireEvent.click(screen.getByRole('tab', { name: '条件规则' }));
    fireEvent.click(screen.getByTestId('style-rule-add'));

    fireEvent.change(screen.getByLabelText('规则名称'), { target: { value: 'Hot' } });
    fireEvent.change(screen.getByLabelText('列'), { target: { value: 'col_value' } });
    fireEvent.change(screen.getByLabelText('操作符'), { target: { value: 'gt' } });
    fireEvent.change(screen.getByLabelText('值'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('style-rule-save'));

    await waitFor(() => {
      expect(onUpdateStyle).toHaveBeenCalledTimes(1);
    });
    const style = onUpdateStyle.mock.calls[0]?.[0] as TableStyle;
    expect(style.conditionalRules).toHaveLength(1);
    expect(style.conditionalRules[0]?.label).toBe('Hot');
    expect(style.conditionalRules[0]?.when).toEqual({
      kind: 'all',
      children: [{ kind: 'compare', columnId: 'col_value', op: 'gt', value: 30 }],
    });
  });

  it('keeps a rule form open when the condition value is invalid', async () => {
    const { onUpdateStyle } = renderEditor();
    fireEvent.click(screen.getByRole('tab', { name: '条件规则' }));
    fireEvent.click(screen.getByTestId('style-rule-add'));
    fireEvent.change(screen.getByLabelText('列'), { target: { value: 'col_value' } });
    fireEvent.change(screen.getByLabelText('操作符'), { target: { value: 'gt' } });
    fireEvent.change(screen.getByLabelText('值'), { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByTestId('style-rule-save'));

    expect(onUpdateStyle).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('值的类型不正确');
  });
});
