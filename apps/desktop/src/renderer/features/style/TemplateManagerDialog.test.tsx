// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTableStyle } from '@curve/domain';
import type { TableStyle, ViewDef } from '@curve/domain';

import { I18nProvider } from '../../i18n';

import { TemplateManagerDialog } from './TemplateManagerDialog';

const style = createTableStyle({ id: 'sty_mine', name: 'Mine' });

const view: ViewDef = {
  id: 'viw_1',
  kind: 'table',
  refId: 'tbl_1',
  title: 'Readings',
  tableView: {
    tableId: 'tbl_1',
    styleId: 'sty_mine',
    columnOrder: [],
    widths: {},
    hiddenColumnIds: [],
    sort: [],
    frozenColumnCount: 0,
  },
};

function renderManager(styles: readonly TableStyle[] = [style]) {
  const onClose = vi.fn();
  const onImport = vi.fn();
  const onApply = vi.fn(async () => ({ ok: true as const }));
  const onDuplicate = vi.fn(async () => ({
    ok: true as const,
    styleId: 'sty_copy',
    name: 'Mine (2)',
  }));
  const onUpdate = vi.fn(async (_next: TableStyle) => ({ ok: true as const }));
  const onDelete = vi.fn(async () => ({
    ok: true as const,
    fallbackStyleId: 'builtin.report-light',
    affectedViewIds: ['viw_1'],
  }));
  const onExport = vi.fn(async () => ({ ok: true as const, fileName: 'Mine.curvestyle.json' }));

  render(
    <I18nProvider initialLocale="zh-CN">
      <TemplateManagerDialog
        open
        currentStyleId="sty_mine"
        defaultStyleId="builtin.report-light"
        styles={styles}
        views={{ viw_1: view }}
        onClose={onClose}
        onImport={onImport}
        onApply={onApply}
        onDuplicate={onDuplicate}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onExport={onExport}
      />
    </I18nProvider>,
  );
  return { onClose, onImport, onApply, onDuplicate, onUpdate, onDelete, onExport };
}

afterEach(() => {
  cleanup();
});

describe('TemplateManagerDialog', () => {
  it('lists builtins and user styles, marking the current and default template', () => {
    renderManager();
    expect(screen.getByRole('dialog', { name: '模板管理' })).toBeDefined();
    expect(screen.getByTestId('style-template-builtin.dark')).toBeDefined();
    expect(screen.getByTestId('style-template-sty_mine')).toBeDefined();
    expect(screen.getByTestId('style-template-sty_mine').getAttribute('data-current')).toBe('true');
    expect(
      screen.getByTestId('style-template-builtin.report-light').getAttribute('data-default'),
    ).toBe('true');
    expect(screen.queryByTestId('style-template-delete-builtin.dark')).toBeNull();
    expect(screen.queryByTestId('style-template-rename-builtin.dark')).toBeNull();
  });

  it('applies a template, sets the default, duplicates and exports', async () => {
    const { onApply, onDuplicate, onExport } = renderManager();

    fireEvent.click(screen.getByTestId('style-template-apply-builtin.dark'));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith('builtin.dark', 'view');
    });
    expect(screen.getByTestId('style-template-status').textContent).toContain('当前视图');

    fireEvent.click(screen.getByTestId('style-template-default-sty_mine'));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith('sty_mine', 'default');
    });

    fireEvent.click(screen.getByTestId('style-template-duplicate-sty_mine'));
    await waitFor(() => {
      expect(onDuplicate).toHaveBeenCalledWith('sty_mine');
    });
    expect(screen.getByTestId('style-template-status').textContent).toContain('Mine (2)');

    fireEvent.click(screen.getByTestId('style-template-export-sty_mine'));
    await waitFor(() => {
      expect(onExport).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('style-template-status').textContent).toContain(
      'Mine.curvestyle.json',
    );
  });

  it('renames inline, rejecting empty and duplicate names', async () => {
    const { onUpdate } = renderManager();
    fireEvent.click(screen.getByTestId('style-template-rename-sty_mine'));

    const input = screen.getByTestId('style-template-rename-input-sty_mine');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('style-template-rename-save-sty_mine'));
    expect(screen.getByRole('alert').textContent).toContain('名称不能为空');
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '报告（浅）' } });
    fireEvent.click(screen.getByTestId('style-template-rename-save-sty_mine'));
    expect(screen.getByRole('alert').textContent).toContain('已被其他模板使用');
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Readings style' } });
    fireEvent.click(screen.getByTestId('style-template-rename-save-sty_mine'));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });
    expect((onUpdate.mock.calls[0]?.[0] as TableStyle).name).toBe('Readings style');
    expect(screen.getByTestId('style-template-status').textContent).toContain('Readings style');
  });

  it('confirms deletion with the affected views and reports the fallback', async () => {
    const { onDelete } = renderManager();
    fireEvent.click(screen.getByTestId('style-template-delete-sty_mine'));

    expect(screen.getByRole('dialog', { name: '删除模板“Mine”？' })).toBeDefined();
    expect(screen.getByTestId('style-template-delete-references').textContent).toContain(
      'Readings',
    );

    fireEvent.click(screen.getByTestId('style-template-delete-confirm'));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('sty_mine');
    });
    const status = screen.getByTestId('style-template-status').textContent ?? '';
    expect(status).toContain('已删除');
    expect(status).toContain('报告（浅）');
  });

  it('opens the import flow from the toolbar', () => {
    const { onImport } = renderManager();
    fireEvent.click(screen.getByTestId('style-template-import'));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});
