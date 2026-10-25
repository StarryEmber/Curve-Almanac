/**
 * Chart mapping editor (T4.4, SPEC §11.1/§11.5).
 *
 * Shared by the inspector's mapping tab and the chart error state ("remap") so
 * a deleted column can be repaired without a second implementation. Selectors
 * only offer type-compatible columns; dangling persisted ids stay visible (so
 * the user knows what broke) and can be replaced or removed.
 */

import {
  canBeChartSeries,
  canBeChartX,
  canBeChartY,
  validateChartMapping,
} from '@curve/chart-model';
import type { ChartMapping, ChartSpec, ColumnDef, TableMeta } from '@curve/domain';
import { Select } from '@curve/ui';
import type { SelectOption } from '@curve/ui';

import { useI18n } from '../../i18n';

import { mappingIssueLabel, mappingPathLabel } from './chart-text';
import { buildChartMapping, canUseChartLayout } from './chart-view-model';

import type { ReactElement } from 'react';

export interface ChartMappingFieldsProps {
  chart: ChartSpec;
  table: TableMeta;
  onChange: (mapping: ChartMapping) => void;
  /** Prefix for data-testid attributes when two editors are mounted at once. */
  testIdPrefix?: string;
}

function hasColumn(table: TableMeta, columnId: string): boolean {
  return table.columns.some((column) => column.id === columnId);
}

function compatibleIds(table: TableMeta, accepts: (column: ColumnDef) => boolean): string[] {
  return table.columns.filter(accepts).map((column) => column.id);
}

export function ChartMappingFields({
  chart,
  table,
  onChange,
  testIdPrefix = 'chart-mapping',
}: ChartMappingFieldsProps): ReactElement {
  const { t } = useI18n();
  const mapping = chart.mapping;
  const issues = validateChartMapping(table, mapping);

  const xOptions: SelectOption[] = compatibleIds(table, canBeChartX).map((columnId) => {
    const column = table.columns.find((candidate) => candidate.id === columnId);
    return { value: columnId, label: column?.label ?? columnId };
  });
  if (!hasColumn(table, mapping.xColumnId)) {
    xOptions.unshift({ value: mapping.xColumnId, label: mapping.xColumnId });
  }

  const layoutOptions: SelectOption[] = (['wide', 'long'] as const).map((layout) => ({
    value: layout,
    label: layout === 'wide' ? t('chart.layout.wide') : t('chart.layout.long'),
  }));
  const disabledLayouts = (['wide', 'long'] as const).filter(
    (layout) => layout !== mapping.layout && !canUseChartLayout(table, layout),
  );

  const changeLayout = (layout: ChartMapping['layout']): void => {
    if (layout === mapping.layout) {
      return;
    }
    const next = buildChartMapping(table, layout, mapping);
    if (next !== null) {
      onChange(next);
    }
  };

  const changeX = (columnId: string): void => {
    if (columnId === mapping.xColumnId) {
      return;
    }
    onChange({ ...mapping, xColumnId: columnId });
  };

  const wideY = mapping.layout === 'wide' ? mapping.yColumnIds : [];
  const danglingY = wideY.filter((columnId) => !hasColumn(table, columnId));
  const yCandidates = table.columns.filter(canBeChartY);

  const setWideY = (selected: readonly string[]): void => {
    if (mapping.layout !== 'wide' || selected.length === 0) {
      return;
    }
    onChange({ layout: 'wide', xColumnId: mapping.xColumnId, yColumnIds: [...selected] });
  };

  const toggleWideY = (columnId: string, checked: boolean): void => {
    if (checked) {
      const next = new Set([...wideY, columnId]);
      const ordered = table.columns
        .filter((column) => next.has(column.id))
        .map((column) => column.id);
      setWideY([...ordered, ...danglingY]);
      return;
    }
    if (wideY.length <= 1) {
      // Removing the only selected Y is only useful when it is a deleted
      // column: substitute the first type-compatible column to repair the chart.
      if (!danglingY.includes(columnId)) {
        return;
      }
      const fallback = table.columns.find(canBeChartY);
      if (fallback !== undefined) {
        setWideY([fallback.id]);
      }
      return;
    }
    setWideY(wideY.filter((id) => id !== columnId));
  };

  const seriesOptions: SelectOption[] = compatibleIds(table, canBeChartSeries).map((columnId) => {
    const column = table.columns.find((candidate) => candidate.id === columnId);
    return { value: columnId, label: column?.label ?? columnId };
  });
  const longSeriesColumnId = mapping.layout === 'long' ? mapping.seriesColumnId : '';
  if (longSeriesColumnId !== '' && !hasColumn(table, longSeriesColumnId)) {
    seriesOptions.unshift({ value: longSeriesColumnId, label: longSeriesColumnId });
  }

  const longYOptions: SelectOption[] = compatibleIds(table, canBeChartY).map((columnId) => {
    const column = table.columns.find((candidate) => candidate.id === columnId);
    return { value: columnId, label: column?.label ?? columnId };
  });
  const longYColumnId = mapping.layout === 'long' ? mapping.yColumnId : '';
  if (longYColumnId !== '' && !hasColumn(table, longYColumnId)) {
    longYOptions.unshift({ value: longYColumnId, label: longYColumnId });
  }

  return (
    <div className="cs-chart-mapping" data-testid={`${testIdPrefix}-fields`}>
      <Select
        label={t('chart.inspector.mapping.layout')}
        options={layoutOptions.map((option) => ({
          ...option,
          disabled: disabledLayouts.includes(option.value as ChartMapping['layout']),
        }))}
        value={mapping.layout}
        data-testid={`${testIdPrefix}-layout`}
        onChange={(event) => {
          changeLayout(event.target.value as ChartMapping['layout']);
        }}
      />
      <Select
        label={t('chart.inspector.mapping.x')}
        options={xOptions}
        value={mapping.xColumnId}
        data-testid={`${testIdPrefix}-x`}
        onChange={(event) => {
          changeX(event.target.value);
        }}
      />

      {mapping.layout === 'wide' ? (
        <fieldset className="cs-chart-mapping__group">
          <legend className="cs-field__label">{t('chart.inspector.mapping.yMulti')}</legend>
          {yCandidates.length === 0 && danglingY.length === 0 ? (
            <p className="cs-field__hint">{t('chart.mapping.noColumns')}</p>
          ) : null}
          {yCandidates.map((column) => {
            const checked = wideY.includes(column.id);
            return (
              <label
                className="cs-chart-check"
                key={column.id}
                htmlFor={`${testIdPrefix}-y-${column.id}`}
              >
                <input
                  id={`${testIdPrefix}-y-${column.id}`}
                  type="checkbox"
                  checked={checked}
                  disabled={checked && wideY.length <= 1}
                  data-testid={`${testIdPrefix}-y-${column.id}`}
                  onChange={(event) => {
                    toggleWideY(column.id, event.target.checked);
                  }}
                />
                <span>{column.label}</span>
              </label>
            );
          })}
          {danglingY.map((columnId) => (
            <label
              className="cs-chart-check"
              key={columnId}
              htmlFor={`${testIdPrefix}-y-${columnId}`}
            >
              <input
                id={`${testIdPrefix}-y-${columnId}`}
                type="checkbox"
                checked
                data-testid={`${testIdPrefix}-y-${columnId}`}
                onChange={(event) => {
                  toggleWideY(columnId, event.target.checked);
                }}
              />
              <span className="cs-chart-mapping__missing">{columnId}</span>
            </label>
          ))}
          {wideY.length <= 1 ? (
            <p className="cs-field__hint">{t('chart.inspector.mapping.keepOne')}</p>
          ) : null}
        </fieldset>
      ) : (
        <>
          <Select
            label={t('chart.inspector.mapping.series')}
            options={seriesOptions}
            value={longSeriesColumnId}
            data-testid={`${testIdPrefix}-series`}
            onChange={(event) => {
              const seriesColumnId = event.target.value;
              if (mapping.layout === 'long' && seriesColumnId !== mapping.seriesColumnId) {
                onChange({ ...mapping, seriesColumnId });
              }
            }}
          />
          <Select
            label={t('chart.inspector.mapping.y')}
            options={longYOptions}
            value={longYColumnId}
            data-testid={`${testIdPrefix}-y`}
            onChange={(event) => {
              const yColumnId = event.target.value;
              if (mapping.layout === 'long' && yColumnId !== mapping.yColumnId) {
                onChange({ ...mapping, yColumnId });
              }
            }}
          />
        </>
      )}

      {issues.length > 0 ? (
        <ul
          className="cs-chart-mapping__issues"
          data-testid={`${testIdPrefix}-issues`}
          role="alert"
        >
          {issues.map((issue, index) => (
            <li key={`${issue.path}-${String(index)}`}>
              {t(mappingPathLabel(issue.path))}: {mappingIssueLabel(issue.code, t)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
