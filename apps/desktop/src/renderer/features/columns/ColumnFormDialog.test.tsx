// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ColumnDef, TableMeta } from '@curve/domain';
import { RATING_FIELD_TYPE_ID } from '@curve/plugin-sample';

import { I18nProvider } from '../../i18n';
import { activateRendererPlugins } from '../../plugins';

import { ColumnFormDialog } from './ColumnFormDialog';

import type { ColumnFormSubmitResult } from './ColumnFormDialog';
import type { ComponentProps } from 'react';

const TIMESTAMP = '2026-10-21T00:00:00.000Z';

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Readings',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    ],
    primaryKey: 'col_id',
    rowCount: 0,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function renderForm(props: Partial<ComponentProps<typeof ColumnFormDialog>> = {}): {
  onSubmit: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  onRequestDelete: ReturnType<typeof vi.fn>;
  onRequestPrimaryKey: ReturnType<typeof vi.fn>;
} {
  const onSubmit = vi.fn(async (): Promise<ColumnFormSubmitResult> => ({ kind: 'done' }));
  const onClose = vi.fn();
  const onRequestDelete = vi.fn();
  const onRequestPrimaryKey = vi.fn();
  render(
    <I18nProvider initialLocale="zh-CN">
      <ColumnFormDialog
        open
        mode="add"
        table={makeTable()}
        onClose={onClose}
        onRequestDelete={onRequestDelete}
        onRequestPrimaryKey={onRequestPrimaryKey}
        onSubmit={onSubmit}
        {...props}
      />
    </I18nProvider>,
  );
  return { onSubmit, onClose, onRequestDelete, onRequestPrimaryKey };
}

afterEach(() => {
  cleanup();
});

beforeAll(async () => {
  // T6.3: the storage-type list is the builtin field-type registration, so the
  // host must be activated before the dialog offers any type.
  await activateRendererPlugins();
});

describe('ColumnFormDialog', () => {
  it('adds a column and derives a unique key from the label', async () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Sensor A' } });
    expect((screen.getByLabelText('Key') as HTMLInputElement).value).toBe('sensor_a');

    fireEvent.click(screen.getByRole('button', { name: '添加列' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const [draft] = onSubmit.mock.calls[0] as [Record<string, unknown>];
    expect(draft).toMatchObject({
      label: 'Sensor A',
      key: 'sensor_a',
      type: 'text',
      role: 'none',
    });
  });

  it('blocks an empty label and shows a field error', () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: '添加列' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('该字段必填。')).toBeDefined();
    expect(
      (screen.getByLabelText('显示名称') as HTMLInputElement).getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('cannot add a required column to a non-empty table', () => {
    const { onSubmit } = renderForm({ table: makeTable({ rowCount: 2 }) });

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Required' } });
    fireEvent.click(screen.getByLabelText('必填'));
    fireEvent.click(screen.getByRole('button', { name: '添加列' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText('表内已有数据时不能直接新增必填列；请先添加普通列并填写数据。'),
    ).toBeDefined();
  });

  it('edits enum options and submits the trimmed values', async () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Status' } });
    fireEvent.change(screen.getByLabelText('存储类型'), { target: { value: 'enum' } });
    const group = screen.getByRole('group', { name: '枚举选项' });
    expect(group).toBeDefined();

    fireEvent.change(screen.getByLabelText('选项值 1'), { target: { value: ' active ' } });
    fireEvent.change(screen.getByLabelText('显示名 1'), { target: { value: ' Active ' } });
    fireEvent.click(screen.getByRole('button', { name: '添加列' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const [draft] = onSubmit.mock.calls[0] as [{ enumOptions: { value: string; label: string }[] }];
    expect(draft.enumOptions).toEqual([{ value: 'active', label: 'Active' }]);
  });

  it('loads an existing column, offers delete/primary-key actions and closes on confirm', async () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_code', key: 'code', label: 'Code', type: 'text', role: 'none' },
      ],
    });
    const { onClose, onRequestDelete, onRequestPrimaryKey } = renderForm({
      mode: 'edit',
      table,
      column: table.columns[1] as ColumnDef,
    });

    expect((screen.getByLabelText('显示名称') as HTMLInputElement).value).toBe('Code');
    expect((screen.getByLabelText('存储类型') as HTMLSelectElement).value).toBe('text');

    fireEvent.click(screen.getByTestId('column-form-delete'));
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('column-form-primary-key'));
    expect(onRequestPrimaryKey).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Label' } });
    fireEvent.click(screen.getByRole('button', { name: '保存列' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('locks the type selector on the primary key column', () => {
    renderForm({ mode: 'edit', column: makeTable().columns[0] as ColumnDef });

    expect((screen.getByLabelText('存储类型') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByTestId('column-form-delete')).toBeNull();
    expect(screen.queryByTestId('column-form-primary-key')).toBeNull();
  });

  it('asks the panel to confirm a destructive type change', async () => {
    const confirmSubmit = vi.fn(async (): Promise<ColumnFormSubmitResult> => ({ kind: 'confirm' }));
    const { onClose } = renderForm({
      mode: 'edit',
      column: makeTable().columns[1] as ColumnDef,
      onSubmit: confirmSubmit,
    });

    fireEvent.change(screen.getByLabelText('存储类型'), { target: { value: 'text' } });
    fireEvent.click(screen.getByRole('button', { name: '保存列' }));

    await waitFor(() => {
      expect(confirmSubmit).toHaveBeenCalledTimes(1);
    });
    // The panel owns the confirmation state; the form must not close it.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers the plugin semantic types that match the storage type (T6.2)', async () => {
    await activateRendererPlugins();
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Rating' } });
    fireEvent.change(screen.getByLabelText('存储类型'), { target: { value: 'number' } });

    const fieldType = screen.getByTestId('column-form-field-type') as HTMLSelectElement;
    expect(fieldType.value).toBe('');
    fireEvent.change(fieldType, { target: { value: RATING_FIELD_TYPE_ID } });

    fireEvent.click(screen.getByRole('button', { name: '添加列' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const [draft] = onSubmit.mock.calls[0] as [Record<string, unknown>];
    expect(draft).toMatchObject({
      label: 'Rating',
      type: 'number',
      fieldTypeId: RATING_FIELD_TYPE_ID,
    });
  });

  it('marks plugin semantic types with their source (T6.3)', async () => {
    const { onSubmit } = renderForm();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('存储类型'), { target: { value: 'number' } });
    const fieldType = screen.getByTestId('column-form-field-type') as HTMLSelectElement;
    const option = fieldType.querySelector(`option[value="${RATING_FIELD_TYPE_ID}"]`);
    expect(option?.textContent).toContain('Rating');
    expect(option?.textContent).toContain('Sample');

    // The storage-type list itself only holds the five builtin field types.
    const typeSelect = screen.getByLabelText('存储类型') as HTMLSelectElement;
    expect(Array.from(typeSelect.options).map((entry) => entry.value)).toEqual([
      'text',
      'number',
      'date',
      'boolean',
      'enum',
    ]);
  });

  it('clears the semantic type when the storage type changes', async () => {
    await activateRendererPlugins();
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        {
          id: 'col_rating',
          key: 'rating',
          label: 'Rating',
          type: 'number',
          role: 'none',
          fieldTypeId: RATING_FIELD_TYPE_ID,
        },
      ],
    });
    const { onSubmit } = renderForm({
      mode: 'edit',
      table,
      column: table.columns[1] as ColumnDef,
    });

    expect((screen.getByTestId('column-form-field-type') as HTMLSelectElement).value).toBe(
      RATING_FIELD_TYPE_ID,
    );
    fireEvent.change(screen.getByLabelText('存储类型'), { target: { value: 'text' } });
    expect(screen.queryByTestId('column-form-field-type')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '保存列' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const [draft] = onSubmit.mock.calls[0] as [Record<string, unknown>];
    expect(draft['fieldTypeId']).toBeNull();
  });
});
