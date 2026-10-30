// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ColumnDef } from '@curve/domain';
import type { ImportColumnMapping } from '@curve/table-engine';

import { I18nProvider } from '../../i18n';

import { ImportWizardDialog } from './ImportWizardDialog';

import type { ImportPlanView } from './import-plan-view';
import type { ImportPreview } from '../../import/worker-protocol';

afterEach(() => {
  cleanup();
});

const COLUMNS: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' },
  { id: 'col_amount', key: 'amount', label: 'Amount', type: 'number', role: 'none' },
];

const PREVIEW: ImportPreview = {
  format: 'csv',
  encoding: 'gb18030',
  encodingMismatch: false,
  delimiter: ';',
  hasHeader: true,
  headers: ['id', 'amount', 'note'],
  columns: [
    { index: 0, name: 'id', type: 'text', confidence: 1, sampleSize: 2 },
    { index: 1, name: 'amount', type: 'number', confidence: 1, sampleSize: 2 },
    { index: 2, name: 'note', type: 'text', confidence: 1, sampleSize: 2 },
  ],
  previewRows: [
    ['a', '1', 'x'],
    ['b', '2', 'y'],
  ],
  totalRows: 2,
  warnings: [],
};

const MAPPINGS: ImportColumnMapping[] = [
  { sourceIndex: 0, target: { kind: 'existing', columnId: 'col_id' } },
  { sourceIndex: 1, target: { kind: 'existing', columnId: 'col_amount' } },
  { sourceIndex: 2, target: { kind: 'new', newColumnIndex: 2 } },
];

function plan(): ImportPlanView {
  return {
    ok: true,
    stats: { total: 2, accepted: 2, skipped: 0 },
    issues: [],
    totalIssues: 0,
    finalRowCount: 2,
  };
}

function renderDialog(overrides: Record<string, unknown> = {}) {
  const props = {
    open: true,
    tableName: 'Import',
    fileName: 'data.csv',
    fileSize: 42,
    existingRowCount: 0,
    step: 1 as const,
    preview: PREVIEW,
    importers: [],
    importerId: null,
    existingColumns: COLUMNS,
    encoding: 'auto' as const,
    delimiter: ';' as const,
    hasHeader: true,
    drafts: [],
    mappings: MAPPINGS,
    plan: plan(),
    skipInvalid: false,
    mode: 'append' as const,
    busy: false,
    busyLabel: null,
    canCancelBusy: true,
    error: null,
    requiredMissing: [],
    duplicateTarget: false,
    largeRows: false,
    replaceConfirmed: false,
    largeConfirmed: false,
    onEncodingChange: vi.fn(),
    onDelimiterChange: vi.fn(),
    onHeaderChange: vi.fn(),
    onImporterChange: vi.fn(),
    onMappingChange: vi.fn(),
    onDraftChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onValidate: vi.fn(),
    onSkipChange: vi.fn(),
    onExportErrors: vi.fn(),
    onModeChange: vi.fn(),
    onReplaceConfirmChange: vi.fn(),
    onLargeConfirmChange: vi.fn(),
    onCommit: vi.fn(),
    onClose: vi.fn(),
    onCancelBusy: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider initialLocale="en-US">
      <ImportWizardDialog {...props} />
    </I18nProvider>,
  );
  return props;
}

describe('ImportWizardDialog', () => {
  it('shows file metadata and encoding on step 1', () => {
    const props = renderDialog();

    expect(screen.getByTestId('import-step-file')).toBeDefined();
    expect(screen.getByText('data.csv')).toBeDefined();
    expect(screen.getByText('42 B')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Encoding'), { target: { value: 'gb18030' } });
    expect(props.onEncodingChange).toHaveBeenCalledWith('gb18030');
  });

  it('shows the 20-row preview and parse controls on step 2', () => {
    renderDialog({ step: 2 });

    expect(screen.getByTestId('import-step-preview')).toBeDefined();
    expect(screen.getByText(/2 data rows/)).toBeDefined();
    expect(screen.getAllByText('a').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText('First row is a header'));
    expect(screen.getByTestId('import-step-preview')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Delimiter'), { target: { value: ',' } });
  });

  it('shows mapping selects and blocks validation when required columns are missing', () => {
    renderDialog({
      step: 3,
      drafts: [
        { label: 'id', type: 'text' },
        { label: 'amount', type: 'number' },
        { label: 'note', type: 'text' },
      ],
      requiredMissing: ['Name'],
    });

    expect(screen.getByTestId('import-step-mapping')).toBeDefined();
    expect(screen.getByTestId('import-required-missing')).toBeDefined();
    expect((screen.getByTestId('import-validate') as HTMLButtonElement).disabled).toBe(true);
  });

  it('requires the replace and large-row confirmations on step 5', () => {
    renderDialog({
      step: 5,
      mode: 'replace',
      largeRows: true,
      requiredMissing: [],
    });

    expect(screen.getByTestId('import-replace-confirm')).toBeDefined();
    expect(screen.getByTestId('import-large-confirm')).toBeDefined();
    expect((screen.getByTestId('import-commit') as HTMLButtonElement).disabled).toBe(true);
  });
});
