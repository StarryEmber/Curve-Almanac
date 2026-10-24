import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CHART_BACKGROUNDS,
  CHART_PALETTES,
  MAX_CHART_SERIES,
  canBeChartSeries,
  canBeChartX,
  canBeChartY,
  resolveSeries,
  validateChartMapping,
} from '@curve/chart-model';
import type { ChartIssue, ChartResolveResult } from '@curve/chart-model';
import type { ChartOptions, ChartSpec, ColumnDef, Row, TableMeta } from '@curve/domain';

const ISO = '2026-01-01T00:00:00.000Z';
const DAY0 = Date.UTC(2026, 0, 1, 12);
const DAY1 = DAY0 + 86_400_000;
const DAY2 = DAY0 + 2 * 86_400_000;

/* -------------------------------------------------------------------------- */
/* Fixtures (SPEC §11.1)                                                      */
/* -------------------------------------------------------------------------- */

const COLUMNS: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'x' },
  { id: 'col_a', key: 'sensor_a', label: 'Sensor A', type: 'number', role: 'y', precision: 2 },
  { id: 'col_b', key: 'sensor_b', label: 'Sensor B', type: 'number', role: 'none' },
  { id: 'col_rank', key: 'rank', label: 'Rank', type: 'number', role: 'none' },
  { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' },
  {
    id: 'col_phase',
    key: 'phase',
    label: 'Phase',
    type: 'enum',
    role: 'series',
    enumOptions: [
      { value: 'east', label: 'East' },
      { value: 'west', label: 'West' },
    ],
  },
  { id: 'col_note', key: 'note', label: 'Note', type: 'text', role: 'none' },
];

const TABLE: TableMeta = {
  id: 'tbl_chart',
  name: 'Readings',
  file: 'tables/tbl_chart.jsonl',
  schemaVersion: 1,
  columns: COLUMNS,
  primaryKey: 'col_id',
  rowCount: 3,
  createdAt: ISO,
  updatedAt: ISO,
};

const ROW_1: Row = {
  id: 'row_1',
  values: ['r1', DAY0, 1.5, 10, 1, 'east', 'east', 'alpha'],
};
const ROW_2: Row = {
  id: 'row_2',
  values: ['r2', DAY1, 2.5, null, 2, 'west', 'west', 'beta'],
};
const ROW_3: Row = {
  id: 'row_3',
  values: ['r3', DAY2, null, 30, 3, 'east', 'east', 'gamma'],
};
const ROWS: Row[] = [ROW_1, ROW_2, ROW_3];
const REVERSED: Row[] = [ROW_3, ROW_2, ROW_1];

const OPTIONS: ChartOptions = {
  smooth: false,
  showSymbol: false,
  lineWidth: 2,
  paletteId: 'default',
  background: 'auto',
  showGrid: true,
  legend: 'top',
  yStartAtZero: false,
  numberDigits: 2,
  sampling: { enabled: true, threshold: 2_000, target: 2_000 },
};

function makeSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    id: 'cht_test',
    title: 'Test chart',
    kind: 'line',
    tableId: TABLE.id,
    mapping: { layout: 'wide', xColumnId: 'col_day', yColumnIds: ['col_a', 'col_b'] },
    sort: [],
    options: OPTIONS,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

function modelOf(result: ChartResolveResult): Extract<ChartResolveResult, { ok: true }>['model'] {
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join('; '));
  }
  return result.model;
}

function issuesOf(result: ChartResolveResult): ChartIssue[] {
  if (result.ok) {
    throw new Error('expected the chart resolve to fail');
  }
  return result.issues;
}

/* -------------------------------------------------------------------------- */
/* Column capability helpers (T4.4 selectors reuse them)                       */
/* -------------------------------------------------------------------------- */

describe('chart column capabilities', () => {
  it('accepts number/date/text x columns only', () => {
    expect(canBeChartX(COLUMNS[1] as ColumnDef)).toBe(true);
    expect(canBeChartX(COLUMNS[3] as ColumnDef)).toBe(true);
    expect(canBeChartX(COLUMNS[0] as ColumnDef)).toBe(true);
    expect(canBeChartX(COLUMNS[6] as ColumnDef)).toBe(false);
  });

  it('accepts number y columns only', () => {
    expect(canBeChartY(COLUMNS[2] as ColumnDef)).toBe(true);
    expect(canBeChartY(COLUMNS[3] as ColumnDef)).toBe(true);
    expect(canBeChartY(COLUMNS[0] as ColumnDef)).toBe(false);
    expect(canBeChartY(COLUMNS[6] as ColumnDef)).toBe(false);
  });

  it('accepts text/enum series columns only', () => {
    expect(canBeChartSeries(COLUMNS[5] as ColumnDef)).toBe(true);
    expect(canBeChartSeries(COLUMNS[6] as ColumnDef)).toBe(true);
    expect(canBeChartSeries(COLUMNS[2] as ColumnDef)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Mapping validation (SPEC §11.1)                                            */
/* -------------------------------------------------------------------------- */

describe('validateChartMapping', () => {
  it('accepts a wide and a long mapping', () => {
    expect(validateChartMapping(TABLE, makeSpec().mapping)).toEqual([]);
    expect(
      validateChartMapping(TABLE, {
        layout: 'long',
        xColumnId: 'col_day',
        seriesColumnId: 'col_site',
        yColumnId: 'col_a',
      }),
    ).toEqual([]);
  });

  it('reports a missing x column', () => {
    const issues = validateChartMapping(TABLE, {
      layout: 'wide',
      xColumnId: 'col_missing',
      yColumnIds: ['col_a'],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ path: 'mapping.xColumnId', code: 'E_REQUIRED' });
  });

  it('rejects an x column with a non-comparable type', () => {
    const issues = validateChartMapping(TABLE, {
      layout: 'wide',
      xColumnId: 'col_phase',
      yColumnIds: ['col_a'],
    });
    expect(issues[0]).toMatchObject({ path: 'mapping.xColumnId', code: 'E_TYPE' });
  });

  it('rejects an x column whose role is not x/none', () => {
    const issues = validateChartMapping(TABLE, {
      layout: 'wide',
      xColumnId: 'col_a',
      yColumnIds: ['col_b'],
    });
    expect(issues[0]).toMatchObject({ path: 'mapping.xColumnId', code: 'E_VALIDATION' });
  });

  it('reports a missing y column', () => {
    const issues = validateChartMapping(TABLE, {
      layout: 'wide',
      xColumnId: 'col_day',
      yColumnIds: ['col_missing'],
    });
    expect(issues[0]).toMatchObject({ path: 'mapping.yColumnIds[0]', code: 'E_REQUIRED' });
  });

  it('rejects a y column that is not numeric', () => {
    const issues = validateChartMapping(TABLE, {
      layout: 'wide',
      xColumnId: 'col_day',
      yColumnIds: ['col_note'],
    });
    expect(issues[0]).toMatchObject({ path: 'mapping.yColumnIds[0]', code: 'E_TYPE' });
  });

  it('rejects a y column whose role is not y/none', () => {
    const roleTable: TableMeta = {
      ...TABLE,
      columns: [
        ...COLUMNS,
        { id: 'col_axis', key: 'axis', label: 'Axis', type: 'number', role: 'x' },
      ],
    };
    const issues = validateChartMapping(roleTable, {
      layout: 'wide',
      xColumnId: 'col_day',
      yColumnIds: ['col_axis'],
    });
    expect(issues[0]).toMatchObject({ path: 'mapping.yColumnIds[0]', code: 'E_VALIDATION' });
  });

  it('rejects duplicate y columns and an empty y list', () => {
    const duplicate = validateChartMapping(TABLE, {
      layout: 'wide',
      xColumnId: 'col_day',
      yColumnIds: ['col_a', 'col_a'],
    });
    expect(duplicate).toEqual([
      expect.objectContaining({ path: 'mapping.yColumnIds[1]', code: 'E_DUPLICATE_KEY' }),
    ]);

    const empty = validateChartMapping(TABLE, {
      layout: 'wide',
      xColumnId: 'col_day',
      yColumnIds: [],
    });
    expect(empty[0]).toMatchObject({ path: 'mapping.yColumnIds', code: 'E_REQUIRED' });
  });

  it('validates the long series column', () => {
    const missing = validateChartMapping(TABLE, {
      layout: 'long',
      xColumnId: 'col_day',
      seriesColumnId: 'col_missing',
      yColumnId: 'col_a',
    });
    expect(missing[0]).toMatchObject({ path: 'mapping.seriesColumnId', code: 'E_REQUIRED' });

    const wrongType = validateChartMapping(TABLE, {
      layout: 'long',
      xColumnId: 'col_day',
      seriesColumnId: 'col_a',
      yColumnId: 'col_a',
    });
    expect(wrongType[0]).toMatchObject({ path: 'mapping.seriesColumnId', code: 'E_TYPE' });

    const wrongRole = validateChartMapping(
      {
        ...TABLE,
        columns: [
          ...COLUMNS,
          { id: 'col_kind', key: 'kind', label: 'Kind', type: 'text', role: 'label' },
        ],
      },
      {
        layout: 'long',
        xColumnId: 'col_day',
        seriesColumnId: 'col_kind',
        yColumnId: 'col_a',
      },
    );
    expect(wrongRole[0]).toMatchObject({ path: 'mapping.seriesColumnId', code: 'E_VALIDATION' });
  });

  it('validates the long y column', () => {
    const issues = validateChartMapping(TABLE, {
      layout: 'long',
      xColumnId: 'col_day',
      seriesColumnId: 'col_site',
      yColumnId: 'col_note',
    });
    expect(issues[0]).toMatchObject({ path: 'mapping.yColumnId', code: 'E_TYPE' });
  });

  it('returns every mapping issue at once', () => {
    const issues = validateChartMapping(TABLE, {
      layout: 'wide',
      xColumnId: 'col_missing',
      yColumnIds: ['col_note'],
    });
    expect(issues).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/* resolveSeries — request level validation                                   */
/* -------------------------------------------------------------------------- */

describe('resolveSeries validation', () => {
  it('rejects a chart that points at another table', () => {
    const issues = issuesOf(resolveSeries(TABLE, ROWS, makeSpec({ tableId: 'tbl_other' })));
    expect(issues[0]).toMatchObject({ path: 'spec.tableId', code: 'E_VALIDATION' });
  });

  it('surfaces mapping issues instead of a model', () => {
    const issues = issuesOf(
      resolveSeries(
        TABLE,
        ROWS,
        makeSpec({ mapping: { layout: 'wide', xColumnId: 'col_missing', yColumnIds: [] } }),
      ),
    );
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects an invalid chart filter', () => {
    const issues = issuesOf(
      resolveSeries(
        TABLE,
        ROWS,
        makeSpec({
          filter: { kind: 'compare', columnId: 'col_missing', op: 'eq', value: 'x' },
        }),
      ),
    );
    expect(issues[0]?.code).toBe('E_VALIDATION');
    expect(issues[0]?.message).toContain('unknown column');
  });

  it('rejects more than three sort levels', () => {
    const issues = issuesOf(
      resolveSeries(
        TABLE,
        ROWS,
        makeSpec({
          sort: [
            { columnId: 'col_a', direction: 'asc' },
            { columnId: 'col_b', direction: 'asc' },
            { columnId: 'col_day', direction: 'asc' },
            { columnId: 'col_rank', direction: 'asc' },
          ],
        }),
      ),
    );
    expect(issues[0]).toMatchObject({ path: 'sort', code: 'E_RANGE' });
  });
});

/* -------------------------------------------------------------------------- */
/* Wide layout (SPEC §11.1)                                                   */
/* -------------------------------------------------------------------------- */

describe('resolveSeries — wide layout', () => {
  it('orders numeric/time x ascending by default and emits one series per y column', () => {
    const model = modelOf(resolveSeries(TABLE, REVERSED, makeSpec()));

    expect(model.kind).toBe('line');
    expect(model.x).toMatchObject({ type: 'time', label: 'Day' });
    expect(model.x.values).toEqual([DAY0, DAY1, DAY2]);
    expect(model.series.map((series) => series.id)).toEqual(['col_a', 'col_b']);
    expect(model.series.map((series) => series.name)).toEqual(['Sensor A', 'Sensor B']);
    expect(model.series[0]?.values).toEqual([1.5, 2.5, null]);
    expect(model.series[1]?.values).toEqual([10, null, 30]);
    expect(model.series[0]?.color).toBe(CHART_PALETTES.default[0]);
    expect(model.series[1]?.color).toBe(CHART_PALETTES.default[1]);
    expect(model.meta).toEqual({
      sampled: false,
      sourcePoints: 4,
      renderedPoints: 4,
      warnings: [],
    });
  });

  it('keeps the physical row order for a text x column and normalises null to a category', () => {
    const nullNote: Row = {
      id: 'row_9',
      values: ['r9', DAY0, 7, null, 9, 'east', 'east', null],
    };
    const model = modelOf(
      resolveSeries(
        TABLE,
        [nullNote, ROW_3, ROW_1],
        makeSpec({ mapping: { layout: 'wide', xColumnId: 'col_note', yColumnIds: ['col_a'] } }),
      ),
    );

    expect(model.x.type).toBe('category');
    expect(model.x.values).toEqual(['', 'gamma', 'alpha']);
    expect(model.series[0]?.values).toEqual([7, null, 1.5]);
  });

  it('reports a number x column as a numeric axis', () => {
    const model = modelOf(
      resolveSeries(
        TABLE,
        REVERSED,
        makeSpec({ mapping: { layout: 'wide', xColumnId: 'col_rank', yColumnIds: ['col_a'] } }),
      ),
    );
    expect(model.x.type).toBe('number');
    expect(model.x.values).toEqual([1, 2, 3]);
  });

  it('lets the chart label override the x column label', () => {
    const model = modelOf(
      resolveSeries(TABLE, ROWS, makeSpec({ options: { ...OPTIONS, xLabel: 'Timestamp' } })),
    );
    expect(model.x.label).toBe('Timestamp');
  });

  it('keeps null y values as gaps without warnings', () => {
    const model = modelOf(resolveSeries(TABLE, [ROW_2], makeSpec()));
    expect(model.series.map((series) => series.values)).toEqual([[2.5], [null]]);
    expect(model.meta.warnings).toEqual([]);
  });

  it('turns non-numeric y values into gaps and warns once per column', () => {
    const broken: Row = {
      id: 'row_4',
      values: ['r4', DAY2 + 86_400_000, 'n/a', 5, 4, 'east', 'east', 'delta'],
    };
    const model = modelOf(resolveSeries(TABLE, [...ROWS, broken], makeSpec()));

    expect(model.series[0]?.values).toEqual([1.5, 2.5, null, null]);
    expect(model.meta.warnings).toEqual([
      'Column "Sensor A" has 1 non-numeric value(s); they are rendered as gaps.',
    ]);
    expect(model.meta.sourcePoints).toBe(5);
  });

  it('warns about duplicate x values while keeping every point', () => {
    const duplicate: Row = {
      id: 'row_5',
      values: ['r5', DAY0, 9, 4, 5, 'east', 'east', 'epsilon'],
    };
    const model = modelOf(resolveSeries(TABLE, [...ROWS, duplicate], makeSpec()));

    expect(model.x.values).toEqual([DAY0, DAY0, DAY1, DAY2]);
    expect(model.meta.warnings).toEqual([
      'The x column has 1 duplicate value(s); points are connected in sorted row order.',
    ]);
    expect(model.meta.sourcePoints).toBe(6);
  });

  it('returns an empty model for an empty row set', () => {
    const model = modelOf(resolveSeries(TABLE, [], makeSpec()));
    expect(model.x.values).toEqual([]);
    expect(model.series.map((series) => series.values)).toEqual([[], []]);
    expect(model.meta).toEqual({
      sampled: false,
      sourcePoints: 0,
      renderedPoints: 0,
      warnings: [],
    });
  });

  it('dedupes series names taken from duplicate column labels', () => {
    const columns: ColumnDef[] = [
      { id: 'col_x', key: 'x', label: 'X', type: 'number', role: 'x' },
      { id: 'col_y1', key: 'y1', label: 'Sensor', type: 'number', role: 'none' },
      { id: 'col_y2', key: 'y2', label: 'Sensor', type: 'number', role: 'none' },
    ];
    const table: TableMeta = { ...TABLE, columns, rowCount: 1 };
    const rows: Row[] = [{ id: 'row_1', values: [1, 2, 3] }];
    const model = modelOf(
      resolveSeries(
        table,
        rows,
        makeSpec({
          mapping: { layout: 'wide', xColumnId: 'col_x', yColumnIds: ['col_y1', 'col_y2'] },
        }),
      ),
    );
    expect(model.series.map((series) => series.name)).toEqual(['Sensor', 'Sensor (2)']);
  });

  it('truncates wide series above the 20 series limit', () => {
    const columns: ColumnDef[] = [{ id: 'col_x', key: 'x', label: 'X', type: 'number', role: 'x' }];
    const yValues: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      columns.push({
        id: `col_y${String(index)}`,
        key: `y${String(index)}`,
        label: `Y ${String(index)}`,
        type: 'number',
        role: 'none',
      });
      yValues.push(index);
    }
    const table: TableMeta = { ...TABLE, columns, rowCount: 1 };
    const rows: Row[] = [{ id: 'row_1', values: [0, ...yValues] }];
    const model = modelOf(
      resolveSeries(
        table,
        rows,
        makeSpec({
          mapping: {
            layout: 'wide',
            xColumnId: 'col_x',
            yColumnIds: columns.slice(1).map((column) => column.id),
          },
        }),
      ),
    );

    expect(model.series).toHaveLength(MAX_CHART_SERIES);
    expect(model.meta.warnings).toEqual([
      'The chart has 21 series; only the first 20 are rendered.',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Long layout (SPEC §11.1)                                                   */
/* -------------------------------------------------------------------------- */

describe('resolveSeries — long layout', () => {
  const LONG_SPEC = makeSpec({
    mapping: {
      layout: 'long',
      xColumnId: 'col_day',
      seriesColumnId: 'col_site',
      yColumnId: 'col_a',
    },
  });

  it('splits one series per distinct value in first-appearance order', () => {
    const model = modelOf(resolveSeries(TABLE, REVERSED, LONG_SPEC));

    expect(model.x.values).toEqual([DAY0, DAY1, DAY2]);
    expect(model.series.map((series) => series.id)).toEqual(['col_site:east', 'col_site:west']);
    expect(model.series.map((series) => series.name)).toEqual(['east', 'west']);
    expect(model.series[0]?.values).toEqual([1.5, null, null]);
    expect(model.series[1]?.values).toEqual([null, 2.5, null]);
    expect(model.meta.sourcePoints).toBe(2);
    expect(model.meta.warnings).toEqual([]);
  });

  it('uses the enum option label as the series name and the stored value as its id', () => {
    const model = modelOf(
      resolveSeries(
        TABLE,
        ROWS,
        makeSpec({
          mapping: {
            layout: 'long',
            xColumnId: 'col_day',
            seriesColumnId: 'col_phase',
            yColumnId: 'col_a',
          },
        }),
      ),
    );
    expect(model.series.map((series) => series.id)).toEqual(['col_phase:east', 'col_phase:west']);
    expect(model.series.map((series) => series.name)).toEqual(['East', 'West']);
  });

  it('groups a null series value under the `(空)` series', () => {
    const emptySite: Row = {
      id: 'row_6',
      values: ['r6', DAY2, 4, null, 6, null, null, 'zeta'],
    };
    const model = modelOf(resolveSeries(TABLE, [...ROWS, emptySite], LONG_SPEC));

    expect(model.series.map((series) => series.name)).toEqual(['east', 'west', '(空)']);
    expect(model.series.map((series) => series.id)).toEqual([
      'col_site:east',
      'col_site:west',
      'col_site:',
    ]);
    expect(model.series[2]?.values).toEqual([null, null, null, 4]);
  });

  it('truncates long series above the 20 series limit', () => {
    const rows: Row[] = [];
    for (let index = 0; index < 25; index += 1) {
      rows.push({
        id: `row_${String(index)}`,
        values: [
          `r${String(index)}`,
          DAY0 + index * 1_000,
          index,
          null,
          index,
          `site_${String(index)}`,
          'east',
          `note_${String(index)}`,
        ],
      });
    }
    const model = modelOf(resolveSeries(TABLE, rows, LONG_SPEC));

    expect(model.series).toHaveLength(MAX_CHART_SERIES);
    expect(model.series[0]?.name).toBe('site_0');
    expect(model.meta.warnings).toEqual([
      'The chart has 25 series; only the first 20 are rendered.',
    ]);
  });

  it('warns about non-numeric values in the long y column', () => {
    const broken: Row = {
      id: 'row_7',
      values: ['r7', DAY2, 'oops', null, 7, 'east', 'east', 'eta'],
    };
    const model = modelOf(resolveSeries(TABLE, [broken], LONG_SPEC));
    expect(model.series[0]?.values).toEqual([null]);
    expect(model.meta.warnings).toEqual([
      'Column "Sensor A" has 1 non-numeric value(s); they are rendered as gaps.',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Filter and sort integration (SPEC §11.2)                                   */
/* -------------------------------------------------------------------------- */

describe('resolveSeries — filter and sort', () => {
  it('applies the chart filter before sorting', () => {
    const model = modelOf(
      resolveSeries(
        TABLE,
        ROWS,
        makeSpec({
          filter: { kind: 'compare', columnId: 'col_a', op: 'gte', value: 1.5 },
          sort: [{ columnId: 'col_day', direction: 'desc' }],
        }),
      ),
    );

    expect(model.x.values).toEqual([DAY1, DAY0]);
    expect(model.series[0]?.values).toEqual([2.5, 1.5]);
  });

  it('sorts by a non-x column when the chart configures one', () => {
    const model = modelOf(
      resolveSeries(TABLE, ROWS, makeSpec({ sort: [{ columnId: 'col_rank', direction: 'desc' }] })),
    );
    expect(model.x.values).toEqual([DAY2, DAY1, DAY0]);
  });

  it('drops rows with a missing numeric x value and warns about it', () => {
    const missingX: Row = {
      id: 'row_8',
      values: ['r8', null, 11, 12, 8, 'east', 'east', 'theta'],
    };
    const model = modelOf(resolveSeries(TABLE, [ROW_1, missingX], makeSpec()));

    expect(model.x.values).toEqual([DAY0]);
    expect(model.series[0]?.values).toEqual([1.5]);
    expect(model.meta.warnings).toEqual([
      '1 row(s) were skipped because the x value is missing or not a number.',
    ]);
    expect(model.meta.sourcePoints).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Style (SPEC §11.3)                                                         */
/* -------------------------------------------------------------------------- */

describe('resolveSeries — style', () => {
  it('copies the chart options into the render style', () => {
    const model = modelOf(
      resolveSeries(
        TABLE,
        ROWS,
        makeSpec({
          kind: 'bar',
          options: {
            ...OPTIONS,
            lineWidth: 4,
            smooth: true,
            showSymbol: true,
            numberDigits: 3,
            yStartAtZero: true,
            legend: 'right',
            showGrid: false,
          },
        }),
      ),
    );

    expect(model.kind).toBe('bar');
    expect(model.style).toEqual({
      palette: [...CHART_PALETTES.default],
      background: CHART_BACKGROUNDS.light,
      showGrid: false,
      lineWidth: 4,
      smooth: true,
      showSymbol: true,
      legend: 'right',
      numberDigits: 3,
      yStartAtZero: true,
    });
  });

  it('resolves every palette id', () => {
    for (const paletteId of ['default', 'muted', 'vivid', 'colorblind'] as const) {
      const model = modelOf(
        resolveSeries(TABLE, ROWS, makeSpec({ options: { ...OPTIONS, paletteId } })),
      );
      expect(model.style.palette).toEqual([...CHART_PALETTES[paletteId]]);
      expect(model.series[0]?.color).toBe(CHART_PALETTES[paletteId][0]);
    }
  });

  it('resolves the background from the option, the theme and an explicit override', () => {
    const darkOption = modelOf(
      resolveSeries(TABLE, ROWS, makeSpec({ options: { ...OPTIONS, background: 'dark' } })),
    );
    expect(darkOption.style.background).toBe(CHART_BACKGROUNDS.dark);

    const darkTheme = modelOf(resolveSeries(TABLE, ROWS, makeSpec(), { theme: 'dark' }));
    expect(darkTheme.style.background).toBe(CHART_BACKGROUNDS.dark);

    const forcedLight = modelOf(
      resolveSeries(TABLE, ROWS, makeSpec({ options: { ...OPTIONS, background: 'dark' } }), {
        background: '#123456',
      }),
    );
    expect(forcedLight.style.background).toBe('#123456');
  });

  it('cycles the palette when there are more series than colours', () => {
    const columns: ColumnDef[] = [{ id: 'col_x', key: 'x', label: 'X', type: 'number', role: 'x' }];
    const values: number[] = [0];
    for (let index = 0; index < 9; index += 1) {
      columns.push({
        id: `col_y${String(index)}`,
        key: `y${String(index)}`,
        label: `Y ${String(index)}`,
        type: 'number',
        role: 'none',
      });
      values.push(index);
    }
    const table: TableMeta = { ...TABLE, columns, rowCount: 1 };
    const model = modelOf(
      resolveSeries(
        table,
        [{ id: 'row_1', values }],
        makeSpec({
          mapping: {
            layout: 'wide',
            xColumnId: 'col_x',
            yColumnIds: columns.slice(1).map((column) => column.id),
          },
        }),
      ),
    );

    expect(model.series).toHaveLength(9);
    expect(model.series[8]?.color).toBe(CHART_PALETTES.default[0]);
  });
});

/* -------------------------------------------------------------------------- */
/* Golden snapshot (TASKS T4.1 acceptance)                                    */
/* -------------------------------------------------------------------------- */

describe('RenderModel golden snapshot', () => {
  it('matches the fixture model for a wide date chart', () => {
    const model = modelOf(
      resolveSeries(TABLE, REVERSED, makeSpec({ id: 'cht_golden', title: 'Golden' }), {
        theme: 'light',
      }),
    );
    expect(model).toMatchSnapshot();
  });

  it('matches the fixture model for a long enum chart', () => {
    const model = modelOf(
      resolveSeries(
        TABLE,
        REVERSED,
        makeSpec({
          id: 'cht_golden_long',
          kind: 'scatter',
          mapping: {
            layout: 'long',
            xColumnId: 'col_day',
            seriesColumnId: 'col_phase',
            yColumnId: 'col_a',
          },
          options: { ...OPTIONS, paletteId: 'colorblind', background: 'dark' },
        }),
      ),
    );
    expect(model).toMatchSnapshot();
  });
});

/* -------------------------------------------------------------------------- */
/* Package boundary (TASKS T4.1: no ECharts import)                           */
/* -------------------------------------------------------------------------- */

describe('@curve/chart-model boundaries', () => {
  it('never imports ECharts, React or Electron from its sources', () => {
    const sourceDir = fileURLToPath(new URL('.', import.meta.url));
    const sources = readdirSync(sourceDir).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    );
    expect(sources.length).toBeGreaterThan(0);

    for (const file of sources) {
      const text = readFileSync(join(sourceDir, file), 'utf8');
      expect(text).not.toMatch(/from ['"](echarts|react|react-dom|electron)/u);
      expect(text).not.toMatch(/require\(['"](echarts|react|electron)/u);
    }
  });

  it('exposes the 20 series limit', () => {
    expect(MAX_CHART_SERIES).toBe(20);
  });
});
