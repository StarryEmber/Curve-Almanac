/**
 * Chart inspector (T4.4, SPEC §11.5).
 *
 * Four groups: data (table, filter, sort), mapping, appearance and axes. Every
 * control writes one complete `ChartSpec` through `useChartEditor`; the command
 * bus validates it, persists the manifest and feeds the same chart back to the
 * renderer, so the inspector never keeps a parallel document.
 */

import { useMemo, useState } from 'react';

import { MAX_SORT_LEVELS } from '@curve/domain';
import type {
  ChartKind,
  ChartMapping,
  ChartOptions,
  ChartSpec,
  ColumnDef,
  SortSpec,
  TableMeta,
} from '@curve/domain';
import { Button, Select, Tabs } from '@curve/ui';
import type { SelectOption } from '@curve/ui';

import { useI18n } from '../../i18n';
import { FilterDialog } from '../filter/FilterDialog';

import { ChartCheckbox, ChartNumberField, ChartTextField } from './chart-fields';
import {
  CHART_BACKGROUND_KEYS,
  CHART_LEGEND_KEYS,
  CHART_PALETTE_KEYS,
  chartKindLabel,
} from './chart-text';
import { ChartMappingFields } from './ChartMappingFields';
import { useChartEditor } from './use-chart-editor';

import type { ReactElement } from 'react';

export interface ChartInspectorProps {
  chart: ChartSpec;
  table: TableMeta;
  /** Physical rows shown by the data group (authoritative, unlike `rowCount`). */
  rowCount: number;
}

const KINDS: readonly ChartKind[] = ['line', 'scatter', 'bar'];

function optionsOf(chart: ChartSpec, patch: Partial<ChartOptions>): ChartSpec {
  return { ...chart, options: { ...chart.options, ...patch } };
}

function labelOf(chart: ChartSpec, key: 'xLabel' | 'yLabel', value: string): ChartSpec {
  const options = { ...chart.options };
  if (value === '') {
    delete options[key];
  } else {
    options[key] = value;
  }
  return { ...chart, options };
}

export function ChartInspector({ chart, table, rowCount }: ChartInspectorProps): ReactElement {
  const { t } = useI18n();
  const commit = useChartEditor();
  const [filterOpen, setFilterOpen] = useState(false);
  const [addSortColumnId, setAddSortColumnId] = useState('');

  const columnLabel = useMemo(() => {
    const labels = new Map(table.columns.map((column) => [column.id, column.label]));
    return (columnId: string): string => labels.get(columnId) ?? columnId;
  }, [table.columns]);

  const kindOptions: SelectOption[] = KINDS.map((kind) => ({
    value: kind,
    label: chartKindLabel(kind, t),
  }));
  const paletteOptions: SelectOption[] = (['default', 'muted', 'vivid', 'colorblind'] as const).map(
    (id) => ({ value: id, label: t(CHART_PALETTE_KEYS[id]) }),
  );
  const backgroundOptions: SelectOption[] = (['auto', 'light', 'dark'] as const).map((id) => ({
    value: id,
    label: t(CHART_BACKGROUND_KEYS[id]),
  }));
  const legendOptions: SelectOption[] = (['top', 'right', 'bottom', 'none'] as const).map((id) => ({
    value: id,
    label: t(CHART_LEGEND_KEYS[id]),
  }));

  const sortCandidates = table.columns.filter(
    (column: ColumnDef) => !chart.sort.some((spec) => spec.columnId === column.id),
  );
  const addSortOptions: SelectOption[] = [
    { value: '', label: t('chart.inspector.sort.add') },
    ...sortCandidates.map((column) => ({ value: column.id, label: column.label })),
  ];

  const updateSort = (sort: readonly SortSpec[]): void => {
    commit({ ...chart, sort: [...sort] });
  };

  const toggleSortDirection = (index: number): void => {
    const current = chart.sort[index];
    if (current === undefined) {
      return;
    }
    updateSort(
      chart.sort.map((spec, position) =>
        position === index
          ? { columnId: spec.columnId, direction: spec.direction === 'asc' ? 'desc' : 'asc' }
          : spec,
      ),
    );
  };

  const dataTab = (
    <section className="cs-chart-inspector__group" data-testid="chart-inspector-data">
      <dl className="cs-chart-facts">
        <div className="cs-chart-facts__row">
          <dt>{t('chart.inspector.table')}</dt>
          <dd data-testid="chart-inspector-table">{table.name}</dd>
        </div>
        <div className="cs-chart-facts__row">
          <dt>{t('chart.inspector.rows')}</dt>
          <dd data-testid="chart-inspector-rows">
            {t('chart.inspector.rowCount', { count: rowCount })}
          </dd>
        </div>
      </dl>

      <div className="cs-chart-inspector__section">
        <div className="cs-chart-inspector__section-header">
          <h3 className="cs-chart-inspector__heading">{t('chart.inspector.filter')}</h3>
          <Button
            size="sm"
            variant="secondary"
            data-testid="chart-filter-edit"
            onClick={() => {
              setFilterOpen(true);
            }}
          >
            {t('chart.inspector.filter.edit')}
          </Button>
        </div>
        {chart.filter === undefined ? (
          <p className="cs-chart-inspector__hint" data-testid="chart-filter-summary">
            {t('chart.inspector.filter.none')}
          </p>
        ) : (
          <>
            <p className="cs-chart-inspector__hint" data-testid="chart-filter-summary">
              {t('chart.inspector.filter.active')}
            </p>
            <Button
              size="sm"
              variant="ghost"
              data-testid="chart-filter-clear"
              onClick={() => {
                const next = { ...chart };
                delete next.filter;
                commit(next);
              }}
            >
              {t('chart.inspector.filter.clear')}
            </Button>
          </>
        )}
      </div>

      <div className="cs-chart-inspector__section">
        <h3 className="cs-chart-inspector__heading">{t('chart.inspector.sort')}</h3>
        {chart.sort.length === 0 ? (
          <p className="cs-chart-inspector__hint" data-testid="chart-sort-none">
            {t('chart.inspector.sort.none')}
          </p>
        ) : (
          <ul className="cs-chart-sort" data-testid="chart-sort-list">
            {chart.sort.map((spec, index) => (
              <li
                className="cs-chart-sort__row"
                key={`${spec.columnId}-${String(index)}`}
                data-testid={`chart-sort-row-${index}`}
              >
                <span className="cs-chart-sort__label">{columnLabel(spec.columnId)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={
                    spec.direction === 'asc'
                      ? t('chart.inspector.sort.desc')
                      : t('chart.inspector.sort.asc')
                  }
                  data-testid={`chart-sort-direction-${index}`}
                  onClick={() => {
                    toggleSortDirection(index);
                  }}
                >
                  <span aria-hidden="true">{spec.direction === 'asc' ? '↑' : '↓'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={t('chart.inspector.sort.remove', { index: index + 1 })}
                  data-testid={`chart-sort-remove-${index}`}
                  onClick={() => {
                    updateSort(chart.sort.filter((_entry, position) => position !== index));
                  }}
                >
                  <span aria-hidden="true">×</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        {chart.sort.length >= MAX_SORT_LEVELS ? (
          <p className="cs-chart-inspector__hint">
            {t('chart.inspector.sort.limit', { count: MAX_SORT_LEVELS })}
          </p>
        ) : (
          <Select
            label={t('chart.inspector.sort.column')}
            options={addSortOptions}
            value={addSortColumnId}
            data-testid="chart-sort-add"
            onChange={(event) => {
              const columnId = event.target.value;
              setAddSortColumnId('');
              if (columnId === '') {
                return;
              }
              updateSort([...chart.sort, { columnId, direction: 'asc' }]);
            }}
          />
        )}
      </div>

      <FilterDialog
        open={filterOpen}
        table={table}
        filter={chart.filter}
        onClose={() => {
          setFilterOpen(false);
        }}
        onApply={(filter) => {
          setFilterOpen(false);
          if (filter === undefined) {
            const next = { ...chart };
            delete next.filter;
            commit(next);
            return;
          }
          commit({ ...chart, filter });
        }}
      />
    </section>
  );

  const mappingTab = (
    <section className="cs-chart-inspector__group" data-testid="chart-inspector-mapping">
      <ChartMappingFields
        chart={chart}
        table={table}
        onChange={(mapping: ChartMapping) => {
          commit({ ...chart, mapping });
        }}
      />
    </section>
  );

  const appearanceTab = (
    <section className="cs-chart-inspector__group" data-testid="chart-inspector-appearance">
      <Select
        label={t('chart.inspector.kind')}
        options={kindOptions}
        value={chart.kind}
        data-testid="chart-kind"
        onChange={(event) => {
          commit({ ...chart, kind: event.target.value as ChartKind });
        }}
      />
      <Select
        label={t('chart.inspector.palette')}
        options={paletteOptions}
        value={chart.options.paletteId}
        data-testid="chart-palette"
        onChange={(event) => {
          commit(optionsOf(chart, { paletteId: event.target.value as ChartOptions['paletteId'] }));
        }}
      />
      <Select
        label={t('chart.inspector.background')}
        options={backgroundOptions}
        value={chart.options.background}
        data-testid="chart-background"
        onChange={(event) => {
          commit(
            optionsOf(chart, { background: event.target.value as ChartOptions['background'] }),
          );
        }}
      />
      <Select
        label={t('chart.inspector.legend')}
        options={legendOptions}
        value={chart.options.legend}
        data-testid="chart-legend"
        onChange={(event) => {
          commit(optionsOf(chart, { legend: event.target.value as ChartOptions['legend'] }));
        }}
      />
      <ChartCheckbox
        label={t('chart.inspector.showGrid')}
        checked={chart.options.showGrid}
        testId="chart-show-grid"
        onChange={(checked) => {
          commit(optionsOf(chart, { showGrid: checked }));
        }}
      />
      <ChartCheckbox
        label={t('chart.inspector.smooth')}
        checked={chart.options.smooth}
        testId="chart-smooth"
        onChange={(checked) => {
          commit(optionsOf(chart, { smooth: checked }));
        }}
      />
      <ChartCheckbox
        label={t('chart.inspector.showSymbol')}
        checked={chart.options.showSymbol}
        testId="chart-show-symbol"
        onChange={(checked) => {
          commit(optionsOf(chart, { showSymbol: checked }));
        }}
      />
      <ChartNumberField
        label={t('chart.inspector.lineWidth')}
        value={chart.options.lineWidth}
        min={1}
        max={6}
        invalidText={t('chart.inspector.invalidNumber', { min: 1, max: 6 })}
        testId="chart-line-width"
        onCommit={(value) => {
          commit(optionsOf(chart, { lineWidth: value }));
        }}
      />
      {chart.kind === 'line' ? null : (
        <p className="cs-chart-inspector__hint">{t('chart.inspector.lineOnlyHint')}</p>
      )}
    </section>
  );

  const axesTab = (
    <section className="cs-chart-inspector__group" data-testid="chart-inspector-axes">
      <ChartTextField
        label={t('chart.inspector.xLabel')}
        value={chart.options.xLabel ?? ''}
        placeholder={columnLabel(chart.mapping.xColumnId)}
        testId="chart-x-label"
        onCommit={(value) => {
          commit(labelOf(chart, 'xLabel', value));
        }}
      />
      <ChartTextField
        label={t('chart.inspector.yLabel')}
        value={chart.options.yLabel ?? ''}
        testId="chart-y-label"
        onCommit={(value) => {
          commit(labelOf(chart, 'yLabel', value));
        }}
      />
      <ChartNumberField
        label={t('chart.inspector.numberDigits')}
        value={chart.options.numberDigits}
        min={0}
        max={6}
        invalidText={t('chart.inspector.invalidNumber', { min: 0, max: 6 })}
        testId="chart-number-digits"
        onCommit={(value) => {
          commit(optionsOf(chart, { numberDigits: value }));
        }}
      />
      <ChartCheckbox
        label={t('chart.inspector.yStartAtZero')}
        checked={chart.options.yStartAtZero}
        testId="chart-y-start-at-zero"
        onChange={(checked) => {
          commit(optionsOf(chart, { yStartAtZero: checked }));
        }}
      />
    </section>
  );

  return (
    <Tabs
      label={t('chart.inspector.label')}
      className="cs-chart-inspector"
      tabs={[
        { id: 'data', label: t('chart.inspector.tab.data'), content: dataTab },
        { id: 'mapping', label: t('chart.inspector.tab.mapping'), content: mappingTab },
        { id: 'appearance', label: t('chart.inspector.tab.appearance'), content: appearanceTab },
        { id: 'axes', label: t('chart.inspector.tab.axes'), content: axesTab },
      ]}
    />
  );
}
