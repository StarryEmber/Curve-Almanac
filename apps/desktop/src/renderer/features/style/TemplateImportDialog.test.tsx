// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_TABLE_STYLE,
  createStyleExportDocument,
  serializeStyleExportDocument,
} from '@curve/domain';
import type { ColumnDef, Row, TableMeta, TableStyle, ViewDef } from '@curve/domain';

import { I18nProvider } from '../../i18n';

import { TemplateImportDialog } from './TemplateImportDialog';

import type { PickStyleFileResult } from './TemplateImportDialog';

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
  rowCount: 2,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const rows: Row[] = [
  { id: 'row_1', values: ['a', 1] },
  { id: 'row_2', values: ['b', 2] },
];

const view: ViewDef = {
  id: 'viw_1',
  kind: 'table',
  refId: 'tbl_1',
  title: 'Readings',
  tableView: {
    tableId: 'tbl_1',
    styleId: 'builtin.report-light',
    columnOrder: ['col_id', 'col_value'],
    widths: {},
    hiddenColumnIds: [],
    sort: [],
    frozenColumnCount: 0,
  },
};

function importedStyle(): TableStyle {
  return {
    ...DEFAULT_TABLE_STYLE,
    id: 'sty_exported',
    name: 'Imported',
    builtin: false,
    columnOverrides: { col_value: { align: 'right' }, col_missing: { width: 90 } },
  };
}

function exportText(): string {
  return serializeStyleExportDocument(
    createStyleExportDocument(importedStyle(), { now: new Date('2026-10-24T00:00:00.000Z') }),
  );
}

function renderDialog(pick: () => Promise<PickStyleFileResult>) {
  const onClose = vi.fn();
  const onImport = vi.fn(async () => ({ ok: true as const }));
  render(
    <I18nProvider initialLocale="zh-CN">
      <TemplateImportDialog
        open
        table={table}
        view={view}
        rows={rows}
        existingNames={[]}
        onClose={onClose}
        onPickFile={pick}
        onImport={onImport}
      />
    </I18nProvider>,
  );
  return { onClose, onImport };
}

afterEach(() => {
  cleanup();
});

describe('TemplateImportDialog', () => {
  it('shows a specific error for invalid JSON', async () => {
    renderDialog(async () => ({
      ok: true,
      file: { name: 'bad.curvestyle.json', text: '{' },
    }));

    fireEvent.click(screen.getByTestId('style-import-pick'));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('JSON');
    });
    expect(screen.queryByTestId('style-import-confirm')).toBeNull();
  });

  it('reports an unsupported version', async () => {
    renderDialog(async () => ({
      ok: true,
      file: {
        name: 'future.curvestyle.json',
        text: JSON.stringify({ kind: 'curve-table-style', version: 9 }),
      },
    }));

    fireEvent.click(screen.getByTestId('style-import-pick'));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('版本');
    });
  });

  it('previews the imported style, warns about missing columns and applies it', async () => {
    const { onImport, onClose } = renderDialog(async () => ({
      ok: true,
      file: { name: 'imported.curvestyle.json', text: exportText() },
    }));

    fireEvent.click(screen.getByTestId('style-import-pick'));
    await waitFor(() => {
      expect(screen.getByTestId('style-import-summary')).toBeDefined();
    });
    expect(screen.getByTestId('style-import-summary').textContent).toContain('Imported');
    expect(screen.getByTestId('style-import-missing').textContent).toContain('col_missing');
    expect(screen.getAllByTestId(/^preview-row-/)).toHaveLength(2);

    fireEvent.click(screen.getByTestId('style-import-confirm'));
    await waitFor(() => {
      expect(onImport).toHaveBeenCalledTimes(1);
    });
    const [style, apply] = onImport.mock.calls[0] as unknown as [TableStyle, boolean];
    expect(style.id.startsWith('sty_')).toBe(true);
    expect(style.id).not.toBe('sty_exported');
    expect(style.columnOverrides['col_missing']).toEqual({ width: 90 });
    expect(apply).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can import without applying to the current view', async () => {
    const { onImport } = renderDialog(async () => ({
      ok: true,
      file: { name: 'imported.curvestyle.json', text: exportText() },
    }));

    fireEvent.click(screen.getByTestId('style-import-pick'));
    await waitFor(() => {
      expect(screen.getByTestId('style-import-apply')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('style-import-apply'));
    fireEvent.click(screen.getByTestId('style-import-confirm'));
    await waitFor(() => {
      expect(onImport).toHaveBeenCalledTimes(1);
    });
    expect((onImport.mock.calls[0] as unknown as [TableStyle, boolean])[1]).toBe(false);
  });

  it('keeps the dialog open when the file picker is cancelled', async () => {
    renderDialog(async () => ({ ok: true, file: null }));
    fireEvent.click(screen.getByTestId('style-import-pick'));
    await waitFor(() => {
      expect(screen.getByTestId('style-import-pick')).toBeDefined();
    });
    expect(screen.queryByTestId('style-import-confirm')).toBeNull();
  });
});
