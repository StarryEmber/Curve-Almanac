// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChartMapping, ChartSpec, ColumnDef, TableMeta } from '@curve/domain';

import { I18nProvider } from '../../i18n';

import { ChartMappingFields } from './ChartMappingFields';

const ISO = '2026-01-01T00:00:00.000Z';

const COLUMNS: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_time', key: 'time', label: 'Time', type: 'number', role: 'x' },
  { id: 'col_a', key: 'a', label: 'Sensor A', type: 'number', role: 'y' },
  { id: 'col_b', key: 'b', label: 'Sensor B', type: 'number', role: 'none' },
  { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' },
  { id: 'col_flag', key: 'flag', label: 'Flag', type: 'boolean', role: 'none' },
];

const TABLE: TableMeta = {
  id: 'tbl_chart',
  name: 'Readings',
  file: 'tables/tbl_chart.jsonl',
  schemaVersion: 1,
  columns: COLUMNS,
  primaryKey: 'col_id',
  rowCount: 0,
  createdAt: ISO,
  updatedAt: ISO,
};

function makeChart(mapping: ChartMapping): ChartSpec {
  return {
    id: 'cht_test',
    title: 'Readings chart',
    kind: 'line',
    tableId: TABLE.id,
    mapping,
    sort: [],
    options: {
      smooth: false,
      showSymbol: false,
      lineWidth: 2,
      paletteId: 'default',
      background: 'auto',
      showGrid: true,
      legend: 'top',
      yStartAtZero: false,
      numberDigits: 2,
      sampling: { enabled: true, threshold: 5_000, target: 2_000 },
    },
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

const WIDE: ChartMapping = {
  layout: 'wide',
  xColumnId: 'col_time',
  yColumnIds: ['col_a', 'col_b'],
};

afterEach(() => {
  cleanup();
});

function mount(
  mapping: ChartMapping,
  table: TableMeta = TABLE,
  prefix = 'chart-mapping',
): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();
  render(
    <I18nProvider initialLocale="zh-CN">
      <ChartMappingFields
        chart={makeChart(mapping)}
        table={table}
        onChange={onChange}
        testIdPrefix={prefix}
      />
    </I18nProvider>,
  );
  return { onChange };
}

describe('ChartMappingFields', () => {
  it('offers only type-compatible X columns', () => {
    mount(WIDE);
    const select = screen.getByTestId('chart-mapping-x');
    const values = Array.from(select.querySelectorAll('option')).map((option) => option.value);
    expect(values).toEqual(['col_id', 'col_time', 'col_b']);
    expect(values).not.toContain('col_flag');
    expect(values).not.toContain('col_site');
  });

  it('changes the X column and keeps the rest of the mapping', () => {
    const { onChange } = mount(WIDE);
    fireEvent.change(screen.getByTestId('chart-mapping-x'), {
      target: { value: 'col_id' },
    });
    expect(onChange).toHaveBeenCalledWith({
      layout: 'wide',
      xColumnId: 'col_id',
      yColumnIds: ['col_a', 'col_b'],
    });
  });

  it('adds Y columns in table order and prevents removing the last one', () => {
    const { onChange } = mount({ layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_b'] });
    expect((screen.getByTestId('chart-mapping-y-col_b') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('chart-mapping-y-col_a'));
    expect(onChange).toHaveBeenCalledWith({
      layout: 'wide',
      xColumnId: 'col_time',
      yColumnIds: ['col_a', 'col_b'],
    });

    onChange.mockClear();
    expect((screen.getByTestId('chart-mapping-y-col_b') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('chart-mapping-y-col_b'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches to the long layout keeping the X column', () => {
    const { onChange } = mount(WIDE);
    fireEvent.change(screen.getByTestId('chart-mapping-layout'), { target: { value: 'long' } });
    expect(onChange).toHaveBeenCalledWith({
      layout: 'long',
      xColumnId: 'col_time',
      seriesColumnId: 'col_site',
      yColumnId: 'col_a',
    });
  });

  it('disables a layout the table cannot express', () => {
    const noSeries: TableMeta = {
      ...TABLE,
      columns: COLUMNS.filter((column) => column.type !== 'text'),
    };
    mount(WIDE, noSeries);
    const select = screen.getByTestId('chart-mapping-layout');
    const long = select.querySelector('option[value="long"]');
    expect(long).not.toBeNull();
    expect((long as HTMLOptionElement).disabled).toBe(true);
  });

  it('shows a deleted Y column and repairs the mapping by removing it', () => {
    const { onChange } = mount({
      layout: 'wide',
      xColumnId: 'col_time',
      yColumnIds: ['col_gone'],
    });
    expect((screen.getByTestId('chart-mapping-y-col_gone') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('chart-mapping-y-col_gone'));
    expect(onChange).toHaveBeenCalledWith({
      layout: 'wide',
      xColumnId: 'col_time',
      yColumnIds: ['col_a'],
    });
  });

  it('reports localized mapping issues', () => {
    mount({ layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_flag'] });
    const issues = screen.getByTestId('chart-mapping-issues');
    expect(within(issues).getByText('Y 轴（多列）: 列类型不兼容')).toBeTruthy();
  });
});
