// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ColumnDef, FilterPredicate, TableMeta } from '@curve/domain';

import { I18nProvider } from '../../i18n';

import { FilterDialog } from './FilterDialog';

const columns: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_score', key: 'score', label: 'Score', type: 'number', role: 'y' },
  {
    id: 'col_status',
    key: 'status',
    label: 'Status',
    type: 'enum',
    role: 'none',
    enumOptions: [
      { value: 'open', label: 'Open' },
      { value: 'done', label: 'Done' },
    ],
  },
];

const table: TableMeta = {
  id: 'tbl_filter',
  name: 'Filter',
  file: 'tables/tbl_filter.jsonl',
  schemaVersion: 1,
  columns,
  primaryKey: 'col_id',
  rowCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
});

function renderDialog(
  filter: FilterPredicate | undefined,
  onApply = vi.fn(),
): { onApply: ReturnType<typeof vi.fn> } {
  render(
    <I18nProvider initialLocale="zh-CN">
      <FilterDialog
        open
        table={table}
        filter={filter}
        onClose={() => undefined}
        onApply={onApply}
      />
    </I18nProvider>,
  );
  return { onApply };
}

describe('FilterDialog', () => {
  it('builds a typed predicate from the dialog controls', () => {
    const { onApply } = renderDialog(undefined);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('列'), {
      target: { value: 'col_score' },
    });
    fireEvent.change(within(dialog).getByLabelText('操作符'), {
      target: { value: 'gt' },
    });
    fireEvent.change(within(dialog).getByLabelText('值'), {
      target: { value: '1,000' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '应用筛选' }));

    expect(onApply).toHaveBeenCalledWith({
      kind: 'all',
      children: [{ kind: 'compare', columnId: 'col_score', op: 'gt', value: 1000 }],
    });
  });

  it('reports an invalid value without applying', () => {
    const { onApply } = renderDialog(undefined);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('列'), {
      target: { value: 'col_score' },
    });
    fireEvent.change(within(dialog).getByLabelText('操作符'), {
      target: { value: 'gt' },
    });
    fireEvent.change(within(dialog).getByLabelText('值'), {
      target: { value: 'not-a-number' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '应用筛选' }));

    expect(onApply).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert').textContent).toContain('第 1 条条件：值的类型不正确');
  });

  it('clears an existing filter and adds a second condition', () => {
    const filter: FilterPredicate = {
      kind: 'compare',
      columnId: 'col_id',
      op: 'eq',
      value: 'a',
    };
    const { onApply } = renderDialog(filter);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '添加条件' }));
    expect(within(dialog).getAllByLabelText('列')).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole('button', { name: '清除筛选' }));
    expect(onApply).toHaveBeenCalledWith(undefined);
  });

  it('refuses to flatten a nested persisted filter', () => {
    const nested: FilterPredicate = {
      kind: 'all',
      children: [
        { kind: 'any', children: [{ kind: 'compare', columnId: 'col_id', op: 'eq', value: 'a' }] },
      ],
    };
    renderDialog(nested);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toContain('当前界面只能编辑单层条件');
    expect(
      (within(dialog).getByRole('button', { name: '应用筛选' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
