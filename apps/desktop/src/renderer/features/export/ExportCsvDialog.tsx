/**
 * CSV export dialog (T3.6, SPEC §9.6, ADR-039).
 *
 * The view half is presentational so option/summary/progress/error states can
 * be component-tested; the container owns the streaming controller.
 */

import { useCallback, useEffect, useState } from 'react';

import type { AppError, ColumnDef, Row, TableMeta, TableStyle, ViewDef } from '@curve/domain';
import type { CsvValueMode } from '@curve/table-engine';
import { Button, Dialog, Select } from '@curve/ui';

import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { useCsvExport } from './use-export-csv';

import type { CsvExportScope } from './export-csv-plan';
import type { CsvExportPhase, CsvExportResult } from './use-export-csv';
import type { ReactElement } from 'react';

export interface ExportCsvDialogViewProps {
  open: boolean;
  tableMeta: TableMeta;
  visibleColumns: readonly ColumnDef[];
  hiddenCount: number;
  viewRowCount: number;
  allRowCount: number;
  mode: CsvValueMode;
  scope: CsvExportScope;
  phase: CsvExportPhase;
  sentRows: number;
  totalRows: number;
  result: CsvExportResult | null;
  error: AppError | null;
  onModeChange: (mode: CsvValueMode) => void;
  onScopeChange: (scope: CsvExportScope) => void;
  onStart: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function ExportCsvDialogView({
  open,
  tableMeta,
  visibleColumns,
  hiddenCount,
  viewRowCount,
  allRowCount,
  mode,
  scope,
  phase,
  sentRows,
  totalRows,
  result,
  error,
  onModeChange,
  onScopeChange,
  onStart,
  onCancel,
  onClose,
}: ExportCsvDialogViewProps): ReactElement | null {
  const { t } = useI18n();
  const busy = phase === 'starting' || phase === 'running' || phase === 'cancelling';
  const optionsDisabled = busy || phase === 'done' || phase === 'cancelled';
  const rowCount = scope === 'view' ? viewRowCount : allRowCount;
  const progressMax = Math.max(totalRows, 1);

  const footer = busy ? (
    <Button variant="secondary" onClick={onCancel} disabled={phase === 'cancelling'}>
      {t('grid.export.cancel')}
    </Button>
  ) : phase === 'done' || phase === 'cancelled' ? (
    <Button variant="primary" onClick={onClose}>
      {t('common.close')}
    </Button>
  ) : phase === 'error' ? (
    <>
      <Button variant="secondary" onClick={onClose}>
        {t('common.close')}
      </Button>
      <Button variant="primary" onClick={onStart}>
        {t('grid.export.retry')}
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button variant="primary" onClick={onStart} disabled={visibleColumns.length === 0}>
        {t('grid.export.start')}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      title={t('grid.export.title')}
      description={t('grid.export.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={footer}
      className="cs-export-dialog"
    >
      <div className="cs-export" data-testid="export-csv-dialog" data-export-phase={phase}>
        <Select
          label={t('grid.export.mode')}
          value={mode}
          disabled={optionsDisabled}
          hint={
            mode === 'display' ? t('grid.export.mode.display.hint') : t('grid.export.mode.raw.hint')
          }
          options={[
            { value: 'display', label: t('grid.export.mode.display') },
            { value: 'raw', label: t('grid.export.mode.raw') },
          ]}
          onChange={(event) => {
            onModeChange(event.target.value === 'raw' ? 'raw' : 'display');
          }}
        />

        <Select
          label={t('grid.export.scope')}
          value={scope}
          disabled={optionsDisabled}
          hint={
            scope === 'view' ? t('grid.export.scope.view.hint') : t('grid.export.scope.all.hint')
          }
          options={[
            { value: 'view', label: t('grid.export.scope.view') },
            { value: 'all', label: t('grid.export.scope.all') },
          ]}
          onChange={(event) => {
            onScopeChange(event.target.value === 'all' ? 'all' : 'view');
          }}
        />

        <p className="cs-export__summary" role="status">
          {t('grid.export.summary', { rows: rowCount, columns: visibleColumns.length })}
        </p>
        {hiddenCount > 0 ? (
          <p className="cs-export__hint">{t('grid.export.hidden', { count: hiddenCount })}</p>
        ) : null}
        <p className="cs-export__hint">{t('grid.export.fileName', { name: tableMeta.name })}</p>

        {phase === 'starting' ? (
          <p className="cs-export__progress" role="status" data-testid="export-csv-preparing">
            {t('grid.export.preparing')}
          </p>
        ) : null}

        {phase === 'running' || phase === 'cancelling' ? (
          <div
            className="cs-export__progress"
            role="status"
            data-testid="export-csv-progress"
            data-export-sent={sentRows}
            data-export-total={totalRows}
          >
            <progress className="cs-export__bar" value={sentRows} max={progressMax} />
            <span>
              {phase === 'cancelling'
                ? t('grid.export.cancelling')
                : t('grid.export.progress', { sent: sentRows, total: totalRows })}
            </span>
          </div>
        ) : null}

        {phase === 'cancelled' ? (
          <p className="cs-export__cancelled" role="status" data-testid="export-csv-cancelled">
            {t('grid.export.cancelled')}
          </p>
        ) : null}

        {phase === 'done' && result !== null ? (
          <div className="cs-export__done" role="status" data-testid="export-csv-done">
            <p>{t('grid.export.done', { rows: result.rows, path: result.path })}</p>
            <p className="cs-export__hint">{t('grid.export.bytes', { bytes: result.bytes })}</p>
          </div>
        ) : null}

        {phase === 'error' && error !== null ? (
          <p className="cs-export__error" role="alert" data-testid="export-csv-error">
            {t('grid.export.failed', { reason: describeAppError(error, t) })}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

export interface ExportCsvDialogProps {
  open: boolean;
  tableMeta: TableMeta;
  tableStyle: TableStyle;
  view: ViewDef;
  visibleColumns: readonly ColumnDef[];
  /** Grid rows in display order (filtered/sorted). */
  rows: readonly Row[];
  /** Physical rows for the "all rows" scope. */
  allRows: readonly Row[];
  onClose: () => void;
}

export function ExportCsvDialog({
  open,
  tableMeta,
  tableStyle,
  view,
  visibleColumns,
  rows,
  allRows,
  onClose,
}: ExportCsvDialogProps): ReactElement | null {
  const [mode, setMode] = useState<CsvValueMode>('display');
  const [scope, setScope] = useState<CsvExportScope>('view');
  const controller = useCsvExport({ tableMeta, tableStyle, view, visibleColumns, rows, allRows });
  const { reset, start, cancel } = controller;

  useEffect(() => {
    if (!open) {
      return;
    }
    setMode('display');
    setScope('view');
    reset();
  }, [open, reset]);

  const handleClose = useCallback((): void => {
    reset();
    onClose();
  }, [onClose, reset]);

  return (
    <ExportCsvDialogView
      open={open}
      tableMeta={tableMeta}
      visibleColumns={visibleColumns}
      hiddenCount={view.tableView?.hiddenColumnIds.length ?? 0}
      viewRowCount={rows.length}
      allRowCount={allRows.length}
      mode={mode}
      scope={scope}
      phase={controller.phase}
      sentRows={controller.sentRows}
      totalRows={controller.totalRows}
      result={controller.result}
      error={controller.error}
      onModeChange={setMode}
      onScopeChange={setScope}
      onStart={() => {
        void start({ mode, scope });
      }}
      onCancel={cancel}
      onClose={handleClose}
    />
  );
}
