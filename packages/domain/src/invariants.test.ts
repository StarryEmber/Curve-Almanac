import { describe, expect, it } from 'vitest';

import { assertInvariants, checkInvariants, checkTable } from './invariants';
import { DEFAULT_TABLE_STYLE_TOKENS } from './table-style';

import type {
  ChartSpec,
  ConditionalRule,
  LayoutNode,
  Row,
  TableMeta,
  TableStyle,
  TableViewState,
  ViewDef,
  WorkspaceManifest,
} from './types';

const TIMESTAMP = '2026-10-20T05:00:00.000Z';

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: '温度记录',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' },
      { id: 'col_time', key: 'time', label: '时间', type: 'date', role: 'x' },
      { id: 'col_a', key: 'sensor_a', label: '传感器 A', type: 'number', role: 'y' },
    ],
    primaryKey: 'col_id',
    rowCount: 2,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function makeChart(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    id: 'cht_1',
    title: '温度曲线',
    kind: 'line',
    tableId: 'tbl_1',
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_a'] },
    sort: [],
    options: {
      smooth: false,
      showSymbol: true,
      lineWidth: 2,
      paletteId: 'default',
      background: 'auto',
      showGrid: true,
      legend: 'top',
      yStartAtZero: false,
      numberDigits: 1,
      sampling: { enabled: true, threshold: 2000, target: 1000 },
    },
    version: 1,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function makeStyle(overrides: Partial<TableStyle> = {}): TableStyle {
  return {
    id: 'sty_1',
    name: 'Style',
    builtin: false,
    tokens: {
      ...DEFAULT_TABLE_STYLE_TOKENS,
      header: { ...DEFAULT_TABLE_STYLE_TOKENS.header },
      body: { ...DEFAULT_TABLE_STYLE_TOKENS.body },
      selection: { ...DEFAULT_TABLE_STYLE_TOKENS.selection },
    },
    columnOverrides: {},
    conditionalRules: [],
    ...overrides,
  };
}

function makeRule(id = 'rule_1'): ConditionalRule {
  return {
    id,
    enabled: true,
    target: { kind: 'row' },
    when: { kind: 'compare', columnId: 'col_a', op: 'gt', value: 30 },
    style: { background: '#fde2e2', bold: true },
  };
}

function makeManifest(overrides: Partial<WorkspaceManifest> = {}): WorkspaceManifest {
  return {
    formatVersion: 1,
    id: 'ws_1',
    name: 'Demo',
    appVersion: '0.1.0',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    tables: [makeTable()],
    charts: [makeChart()],
    views: [
      {
        id: 'viw_1',
        kind: 'table',
        refId: 'tbl_1',
        title: '温度记录',
        tableView: {
          tableId: 'tbl_1',
          styleId: 'builtin.report-light',
          columnOrder: ['col_id', 'col_time', 'col_a'],
          widths: { col_time: 160 },
          hiddenColumnIds: [],
          sort: [{ columnId: 'col_time', direction: 'asc' }],
          frozenColumnCount: 1,
        },
      },
      { id: 'viw_2', kind: 'chart', refId: 'cht_1', title: '温度曲线' },
    ],
    tableStyles: [],
    layout: {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'pane', viewIds: ['viw_1'], activeViewId: 'viw_1' },
      second: { type: 'pane', viewIds: ['viw_2'], activeViewId: 'viw_2' },
    },
    settings: {
      theme: 'system',
      locale: 'zh-CN',
      defaultTableStyleId: 'builtin.report-light',
      autosave: true,
    },
    ...overrides,
  };
}

function makeRows(): Row[] {
  return [
    { id: 'row_1', values: ['a', 1735689600000, 21.5] },
    { id: 'row_2', values: ['b', 1735689660000, 23.1] },
  ];
}

/** Replaces the views and rebuilds a matching single-pane layout. */
function withViews(views: WorkspaceManifest['views']): Partial<WorkspaceManifest> {
  return {
    views,
    layout: {
      type: 'pane',
      viewIds: views.map((view) => view.id),
      activeViewId: views[0]?.id ?? null,
    },
  };
}

function check(manifest: WorkspaceManifest, rows: readonly Row[] = makeRows()) {
  const rowsByTable = new Map<string, readonly Row[]>([[manifest.tables[0]?.id ?? '', rows]]);
  return checkInvariants(manifest, { rowsByTable });
}

function expectIssue(
  report: ReturnType<typeof checkInvariants>,
  path: string,
  code?: string,
): void {
  expect(report.issues).toContainEqual(
    code === undefined
      ? expect.objectContaining({ path })
      : expect.objectContaining({ path, code }),
  );
}

describe('checkInvariants — clean workspace', () => {
  it('accepts a consistent manifest and its rows', () => {
    const report = check(makeManifest());
    expect(report.issues).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('warns when the rowCount hint is stale instead of failing', () => {
    const report = check(makeManifest({ tables: [makeTable({ rowCount: 99 })] }));
    expect(report.issues).toEqual([]);
    expect(report.warnings).toContainEqual(expect.stringContaining('rowCount 99'));
  });
});

describe('checkInvariants — columns and primary key', () => {
  it('rejects duplicate column ids and keys', () => {
    const duplicateId = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' },
        { id: 'col_id', key: 'other', label: 'Other', type: 'text', role: 'none' },
      ],
    });
    expectIssue(
      check(makeManifest({ tables: [duplicateId] })),
      'tables[0].columns[1].id',
      'E_DUPLICATE_KEY',
    );

    const duplicateKey = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none' },
        { id: 'col_other', key: 'id', label: 'Other', type: 'text', role: 'none' },
      ],
    });
    expectIssue(
      check(makeManifest({ tables: [duplicateKey] })),
      'tables[0].columns[1].key',
      'E_DUPLICATE_KEY',
    );
  });

  it('rejects a primary key that is missing or not text', () => {
    expectIssue(
      check(makeManifest({ tables: [makeTable({ primaryKey: 'col_missing' })] })),
      'tables[0].primaryKey',
      'E_VALIDATION',
    );
    expectIssue(
      check(makeManifest({ tables: [makeTable({ primaryKey: 'col_a' })] })),
      'tables[0].primaryKey',
      'E_TYPE',
    );
  });

  it('checks field types when a resolver is available', () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', fieldTypeId: 'rating' },
      ],
      primaryKey: 'col_id',
    });
    const report = checkInvariants(makeManifest({ tables: [table], charts: [], ...withViews([]) }));
    expect(report.issues).toEqual([]);
    expect(report.warnings).toContainEqual(expect.stringContaining('field type "rating"'));

    const unresolved = checkInvariants(
      makeManifest({ tables: [table], charts: [], ...withViews([]) }),
      {
        resolveFieldTypeStorage: () => undefined,
      },
    );
    expectIssue(unresolved, 'tables[0].columns[0].fieldTypeId', 'E_VALIDATION');

    const wrongStorage = checkInvariants(
      makeManifest({ tables: [table], charts: [], ...withViews([]) }),
      {
        resolveFieldTypeStorage: () => 'number',
      },
    );
    expectIssue(wrongStorage, 'tables[0].columns[0].fieldTypeId', 'E_TYPE');

    const matching = checkInvariants(
      makeManifest({ tables: [table], charts: [], ...withViews([]) }),
      {
        resolveFieldTypeStorage: () => 'text',
      },
    );
    expect(matching.issues).toEqual([]);
  });
});

describe('checkInvariants — rows', () => {
  it('rejects wrong row lengths and wrong cell types', () => {
    const short = [{ id: 'row_1', values: ['a'] }];
    expectIssue(check(makeManifest(), short), 'tables[0].rows[0].values', 'E_RANGE');

    const badCell = [{ id: 'row_1', values: ['a', 'not-a-date', 1] }];
    expectIssue(check(makeManifest(), badCell), 'tables[0].rows[0].values[1]', 'E_TYPE');
  });

  it('rejects null and duplicate primary keys', () => {
    const nullKey = [{ id: 'row_1', values: [null, 1735689600000, 1] }];
    expectIssue(check(makeManifest(), nullKey), 'tables[0].rows[0].values[0]', 'E_REQUIRED');

    const duplicateKey = [
      { id: 'row_1', values: ['a', 1735689600000, 1] },
      { id: 'row_2', values: ['a', 1735689660000, 2] },
    ];
    expectIssue(
      check(makeManifest(), duplicateKey),
      'tables[0].rows[1].values[0]',
      'E_DUPLICATE_KEY',
    );
  });

  it('rejects duplicate row ids', () => {
    const rows = [
      { id: 'row_1', values: ['a', 1735689600000, 1] },
      { id: 'row_1', values: ['b', 1735689660000, 2] },
    ];
    expectIssue(check(makeManifest(), rows), 'tables[0].rows[1].id', 'E_DUPLICATE_KEY');
  });

  it('truncates very large issue reports', () => {
    const rows: Row[] = Array.from({ length: 150 }, (_, index) => ({
      id: `row_${String(index)}`,
      values: [null, 1735689600000, index],
    }));
    const report = check(makeManifest({ tables: [makeTable({ rowCount: 150 })] }), rows);
    expect(report.issues).toHaveLength(101);
    expect(report.issues.at(-1)?.message).toContain('truncated');
  });
});

describe('checkInvariants — views', () => {
  it('rejects views that point at missing tables or charts', () => {
    const manifest = makeManifest();
    const tableView = manifest.views[0]!;
    const missingTable: ViewDef = {
      ...tableView,
      refId: 'tbl_missing',
      tableView: { ...tableView.tableView!, tableId: 'tbl_missing' },
    };
    expectIssue(check(makeManifest({ views: [missingTable] })), 'views[0].refId', 'E_VALIDATION');

    const missingChart: ViewDef = { ...manifest.views[1]!, refId: 'cht_missing' };
    expectIssue(
      check(makeManifest({ views: [tableView, missingChart] })),
      'views[1].refId',
      'E_VALIDATION',
    );
  });

  it('requires tableView state exactly on table views', () => {
    const manifest = makeManifest();
    const source = manifest.views[0]!;
    const view: ViewDef = { ...source };
    delete view.tableView;
    expectIssue(check(makeManifest(withViews([view]))), 'views[0].tableView', 'E_REQUIRED');

    const chartView: ViewDef = { ...manifest.views[1]!, tableView: source.tableView };
    expectIssue(
      check(makeManifest(withViews([source, chartView]))),
      'views[1].tableView',
      'E_VALIDATION',
    );
  });

  it('checks tableView.tableId against the view refId', () => {
    const source = makeManifest().views[0]!;
    const view: ViewDef = {
      ...source,
      tableView: { ...source.tableView!, tableId: 'tbl_other' },
    };
    expectIssue(check(makeManifest(withViews([view]))), 'views[0].tableView.tableId');
  });

  it('checks columnOrder, widths, sort, filter and hidden columns', () => {
    const base = makeManifest().views[0]!;
    const tableView = base.tableView!;

    expectIssue(
      check(
        makeManifest(
          withViews([
            { ...base, tableView: { ...tableView, columnOrder: ['col_id', 'col_time'] } },
          ]),
        ),
      ),
      'views[0].tableView.columnOrder',
      'E_VALIDATION',
    );

    expectIssue(
      check(
        makeManifest(
          withViews([
            {
              ...base,
              tableView: {
                ...tableView,
                columnOrder: ['col_id', 'col_time', 'col_a', 'col_time'],
              },
            },
          ]),
        ),
      ),
      'views[0].tableView.columnOrder[3]',
      'E_DUPLICATE_KEY',
    );

    expectIssue(
      check(
        makeManifest(
          withViews([{ ...base, tableView: { ...tableView, widths: { col_ghost: 120 } } }]),
        ),
      ),
      'views[0].tableView.widths',
    );

    expectIssue(
      check(
        makeManifest(
          withViews([
            {
              ...base,
              tableView: { ...tableView, sort: [{ columnId: 'col_ghost', direction: 'asc' }] },
            },
          ]),
        ),
      ),
      'views[0].tableView.sort[0].columnId',
    );

    expectIssue(
      check(
        makeManifest(
          withViews([
            {
              ...base,
              tableView: {
                ...tableView,
                filter: { kind: 'compare', columnId: 'col_ghost', op: 'eq', value: 1 },
              },
            },
          ]),
        ),
      ),
      'views[0].tableView.filter',
    );

    const hidden = check(
      makeManifest(
        withViews([{ ...base, tableView: { ...tableView, hiddenColumnIds: ['col_ghost'] } }]),
      ),
    );
    expect(hidden.issues).toEqual([]);
    expect(hidden.warnings).toContainEqual(expect.stringContaining('col_ghost'));
  });

  it('warns when a style cannot be resolved', () => {
    const base = makeManifest().views[0]!;
    const report = check(
      makeManifest(
        withViews([{ ...base, tableView: { ...base.tableView!, styleId: 'sty_missing' } }]),
      ),
    );
    expect(report.issues).toEqual([]);
    expect(report.warnings).toContainEqual(expect.stringContaining('falling back'));
  });
});

describe('checkInvariants — charts, styles and layout', () => {
  it('recurses into nested filters and chart filters for removed columns', () => {
    const base = makeManifest().views[0]!;
    const tableView: TableViewState = {
      ...base.tableView!,
      filter: {
        kind: 'all',
        children: [{ kind: 'compare', columnId: 'col_ghost', op: 'gt', value: 1 }],
      },
    };
    expectIssue(
      check(makeManifest(withViews([{ ...base, tableView }]))),
      'views[0].tableView.filter',
      'E_VALIDATION',
    );

    const chart = makeChart({
      filter: { kind: 'compare', columnId: 'col_ghost', op: 'eq', value: 1 },
    });
    const report = check(makeManifest({ charts: [chart] }));
    expect(report.warnings).toContainEqual(expect.stringContaining('col_ghost'));
  });

  it('warns about chart mappings whose columns disappeared', () => {
    const chart = makeChart({
      mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_ghost'] },
    });
    const report = check(makeManifest({ charts: [chart] }));
    expect(report.issues).toEqual([]);
    expect(report.warnings).toContainEqual(expect.stringContaining('col_ghost'));
  });

  it('rejects charts whose table is gone', () => {
    expectIssue(
      check(makeManifest({ charts: [makeChart({ tableId: 'tbl_missing' })] })),
      'charts[0].tableId',
      'E_VALIDATION',
    );
  });

  it('rejects persisted builtin styles and duplicate ids', () => {
    expectIssue(
      check(makeManifest({ tableStyles: [makeStyle({ id: 'builtin.sneaky' })] })),
      'tableStyles[0].id',
      'E_VALIDATION',
    );
    expectIssue(
      check(makeManifest({ tableStyles: [makeStyle({ builtin: true })] })),
      'tableStyles[0].builtin',
      'E_VALIDATION',
    );
    expectIssue(
      check(
        makeManifest({
          tableStyles: [makeStyle({ conditionalRules: [makeRule(), makeRule()] })],
        }),
      ),
      'tableStyles[0].conditionalRules[1].id',
      'E_DUPLICATE_KEY',
    );

    const duplicateTables = [makeTable(), makeTable({ file: 'tables/tbl_2.jsonl' })];
    expectIssue(
      check(makeManifest({ tables: duplicateTables }), makeRows()),
      'tables[1].id',
      'E_DUPLICATE_KEY',
    );
  });

  it('warns when the workspace default style cannot be resolved', () => {
    const base = makeManifest();
    const report = check(
      makeManifest({
        settings: { ...base.settings, defaultTableStyleId: 'builtin.missing' },
      }),
    );
    expect(report.issues).toEqual([]);
    expect(report.warnings).toContainEqual(expect.stringContaining('falling back'));
  });

  it('enforces the layout view rules', () => {
    const missingView: LayoutNode = {
      type: 'pane',
      viewIds: ['viw_ghost'],
      activeViewId: null,
    };
    expectIssue(check(makeManifest({ layout: missingView })), 'layout.viewIds[0]', 'E_VALIDATION');

    const duplicatePanels: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'pane', viewIds: ['viw_1'], activeViewId: 'viw_1' },
      second: { type: 'pane', viewIds: ['viw_1'], activeViewId: 'viw_1' },
    };
    expectIssue(
      check(makeManifest({ layout: duplicatePanels })),
      'layout.second.viewIds[0]',
      'E_DUPLICATE_KEY',
    );

    const badActive: LayoutNode = { type: 'pane', viewIds: ['viw_1'], activeViewId: 'viw_2' };
    expectIssue(check(makeManifest({ layout: badActive })), 'layout.activeViewId', 'E_VALIDATION');
  });

  it('rejects more than four panes and more than twenty tables', () => {
    const fivePanes: LayoutNode = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: {
          type: 'split',
          direction: 'horizontal',
          ratio: 0.5,
          first: { type: 'pane', viewIds: ['viw_1'], activeViewId: 'viw_1' },
          second: { type: 'pane', viewIds: ['viw_2'], activeViewId: 'viw_2' },
        },
        second: {
          type: 'split',
          direction: 'horizontal',
          ratio: 0.5,
          first: { type: 'pane', viewIds: [], activeViewId: null },
          second: { type: 'pane', viewIds: [], activeViewId: null },
        },
      },
      second: { type: 'pane', viewIds: [], activeViewId: null },
    };
    expectIssue(check(makeManifest({ layout: fivePanes })), 'layout', 'E_RANGE');

    const tables: TableMeta[] = Array.from({ length: 21 }, (_, index) => {
      const id = `tbl_${String(index)}`;
      return makeTable({ id, file: `tables/${id}.jsonl` });
    });
    expectIssue(
      checkInvariants(makeManifest({ tables, charts: [], ...withViews([]) })),
      'tables',
      'E_RANGE',
    );
  });
});

describe('checkTable — standalone', () => {
  it('reports paths relative to the table and enforces the column limit', () => {
    const report = checkTable(makeTable({ primaryKey: 'col_missing' }));
    expect(report.issues).toContainEqual(
      expect.objectContaining({ path: 'primaryKey', code: 'E_VALIDATION' }),
    );

    const columns = Array.from({ length: 101 }, (_, index) => ({
      id: `col_${String(index)}`,
      key: `c${String(index)}`,
      label: `C${String(index)}`,
      type: 'text' as const,
      role: 'none' as const,
    }));
    const tooWide = checkTable(makeTable({ columns, primaryKey: columns[0]?.id ?? 'col_0' }));
    expect(tooWide.issues).toContainEqual(
      expect.objectContaining({ path: 'columns', code: 'E_RANGE' }),
    );
  });
});

describe('assertInvariants', () => {
  it('does nothing for a clean report', () => {
    expect(() => assertInvariants({ issues: [], warnings: [] })).not.toThrow();
  });

  it('throws a typed E_WS_INVALID_MANIFEST error with a detail', () => {
    try {
      assertInvariants({
        issues: [
          { path: 'tables[0].primaryKey', code: 'E_VALIDATION', message: 'missing column' },
          { path: '', code: 'E_VALIDATION', message: 'second issue' },
        ],
        warnings: [],
      });
      expect.unreachable('expected assertInvariants to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'E_WS_INVALID_MANIFEST',
        detail: 'tables[0].primaryKey: missing column; second issue',
      });
    }
  });
});
