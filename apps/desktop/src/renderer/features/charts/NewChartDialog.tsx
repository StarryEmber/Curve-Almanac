/**
 * New-chart wizard (T4.4, SPEC §11.5: table → mapping → columns → preview).
 *
 * The view is presentational: it builds a throwaway `ChartSpec` for the live
 * preview through the same `resolveSeries` contract the chart view uses, and
 * only the container talks to app-core. Create stays disabled until the mapping
 * validates, so an invalid chart is never persisted.
 */

import { useMemo, useState } from 'react';

import type { ChartCreateRequest } from '@curve/app-core';
import { validateChartMapping } from '@curve/chart-model';
import type { AppError, ChartKind, ChartMapping } from '@curve/domain';
import type { TableData } from '@curve/table-engine';
import { Button, Dialog, Input, Select } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';

import { chartKindLabel } from './chart-text';
import { buildChartMapping, chartRenderStatus, createPreviewChart } from './chart-view-model';
import { ChartCanvas } from './ChartCanvas';
import { ChartMappingFields } from './ChartMappingFields';

import type { ReactElement } from 'react';

export type NewChartOutcome = { ok: true } | { ok: false; error: AppError };

export interface NewChartDialogViewProps {
  tables: readonly TableData[];
  initialTableId: string | null;
  onClose: () => void;
  onCreate: (request: ChartCreateRequest) => Promise<NewChartOutcome>;
}

const KINDS: readonly ChartKind[] = ['line', 'scatter', 'bar'];

function initialTable(
  tables: readonly TableData[],
  initialTableId: string | null,
): TableData | undefined {
  return tables.find((entry) => entry.table.id === initialTableId) ?? tables[0];
}

export function NewChartDialogView({
  tables,
  initialTableId,
  onClose,
  onCreate,
}: NewChartDialogViewProps): ReactElement {
  const { t, locale } = useI18n();
  const { resolved } = useTheme();
  const first = initialTable(tables, initialTableId);
  const [tableId, setTableId] = useState(first?.table.id ?? '');
  const [title, setTitle] = useState(first?.table.name ?? '');
  const [kind, setKind] = useState<ChartKind>('line');
  const [mapping, setMapping] = useState<ChartMapping | null>(
    first === undefined ? null : buildChartMapping(first.table, 'wide'),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tableData = tables.find((entry) => entry.table.id === tableId);

  const changeTable = (nextId: string): void => {
    const nextData = tables.find((entry) => entry.table.id === nextId);
    setTableId(nextId);
    setMapping(nextData === undefined ? null : buildChartMapping(nextData.table, 'wide'));
    setTitle(nextData?.table.name ?? '');
    setError(null);
  };

  const mappingIssues = useMemo(
    () =>
      tableData === undefined || mapping === null
        ? []
        : validateChartMapping(tableData.table, mapping),
    [mapping, tableData],
  );

  const preview = useMemo(() => {
    if (tableData === undefined || mapping === null) {
      return null;
    }
    return chartRenderStatus({
      chart: createPreviewChart({
        tableId: tableData.table.id,
        title,
        kind,
        mapping,
      }),
      table: tableData.table,
      rows: tableData.rows,
      locale,
      theme: resolved,
    });
  }, [kind, locale, mapping, resolved, tableData, title]);

  const canCreate =
    !busy &&
    tableData !== undefined &&
    mapping !== null &&
    title.trim().length > 0 &&
    mappingIssues.length === 0;

  const submit = async (): Promise<void> => {
    if (tableData === undefined || mapping === null) {
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await onCreate({
      tableId: tableData.table.id,
      title: title.trim(),
      kind,
      mapping,
    });
    setBusy(false);
    if (outcome.ok) {
      onClose();
      return;
    }
    setError(describeAppError(outcome.error, t));
  };

  const tableOptions = tables.map((entry) => ({
    value: entry.table.id,
    label: entry.table.name,
  }));
  const kindOptions = KINDS.map((entry) => ({ value: entry, label: chartKindLabel(entry, t) }));

  return (
    <Dialog
      open
      title={t('chart.new.title')}
      description={t('chart.new.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      className="cs-chart-new"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!canCreate}
            data-testid="chart-new-create"
            onClick={() => {
              void submit();
            }}
          >
            {t('chart.new.create')}
          </Button>
        </>
      }
    >
      <div className="cs-chart-new__body">
        <div className="cs-chart-new__controls" data-testid="chart-new-form">
          <h3 className="cs-chart-new__heading">{t('chart.new.sectionTable')}</h3>
          {tables.length === 0 ? (
            <p className="cs-chart-new__hint" data-testid="chart-new-no-tables">
              {t('chart.new.noTables')}
            </p>
          ) : (
            <Select
              label={t('chart.new.table')}
              options={tableOptions}
              value={tableId}
              data-testid="chart-new-table"
              onChange={(event) => {
                changeTable(event.target.value);
              }}
            />
          )}
          <Input
            label={t('chart.new.name')}
            value={title}
            maxLength={80}
            data-testid="chart-new-name"
            error={title.trim().length === 0 ? t('chart.new.nameRequired') : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
          <Select
            label={t('chart.new.kind')}
            options={kindOptions}
            value={kind}
            data-testid="chart-new-kind"
            onChange={(event) => {
              setKind(event.target.value as ChartKind);
            }}
          />

          <h3 className="cs-chart-new__heading">{t('chart.new.sectionMapping')}</h3>
          {tableData === undefined || mapping === null ? (
            <p className="cs-chart-new__hint" data-testid="chart-new-no-columns">
              {t('chart.mapping.noColumns')}
            </p>
          ) : (
            <ChartMappingFields
              chart={createPreviewChart({
                tableId: tableData.table.id,
                title,
                kind,
                mapping,
              })}
              table={tableData.table}
              testIdPrefix="chart-new"
              onChange={(next: ChartMapping) => {
                setMapping(next);
              }}
            />
          )}
          {mappingIssues.length > 0 ? (
            <p className="cs-chart-new__hint" role="alert" data-testid="chart-new-invalid">
              {t('chart.new.invalid')}
            </p>
          ) : null}
          {error === null ? null : (
            <p className="cs-chart-new__error" role="alert" data-testid="chart-new-error">
              {error}
            </p>
          )}
        </div>

        <div className="cs-chart-new__preview" data-testid="chart-new-preview">
          <h3 className="cs-chart-new__heading">{t('chart.new.sectionPreview')}</h3>
          {preview !== null && preview.kind === 'ready' ? (
            <ChartCanvas
              model={preview.model}
              label={t('chart.new.previewLabel')}
              testId="chart-new-canvas"
            />
          ) : (
            <p className="cs-chart-new__hint" data-testid="chart-new-preview-empty">
              {t('chart.new.previewEmpty')}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Container: reads the open tables and dispatches `chart.create`. */
export function NewChartDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement | null {
  const { core } = useRendererCore();
  const tables = useAppState((state) => state.tables);
  const activeTableId = useAppState((state) => state.ui.activeTableId);
  const orderedTables = useMemo(() => Object.values(tables), [tables]);

  if (!open) {
    return null;
  }

  return (
    <NewChartDialogView
      tables={orderedTables}
      initialTableId={activeTableId}
      onClose={onClose}
      onCreate={async (request) => {
        const outcome = await core.actions.createChart(request);
        if (!outcome.ok) {
          core.store.getState().actions.setError(outcome.error);
          return { ok: false, error: outcome.error };
        }
        return { ok: true };
      }}
    />
  );
}
