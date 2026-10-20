import { describe, expect, it } from 'vitest';

import {
  formatIssuePath,
  isCell,
  parseCell,
  parseColumnDef,
  parseManifest,
  parseRow,
  parseTableMeta,
} from './schemas';

import type {
  ChartSpec,
  ColumnDef,
  FilterPredicate,
  Row,
  TableMeta,
  TableStyle,
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
      {
        id: 'col_a',
        key: 'sensor_a',
        label: '传感器 A',
        type: 'number',
        role: 'y',
        unit: '°C',
        precision: 1,
      },
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
    sort: [{ columnId: 'col_time', direction: 'asc' }],
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
    name: 'My style',
    builtin: false,
    tokens: {
      density: 'normal',
      fontFamily: 'system-ui',
      fontSize: 13,
      header: { background: '#ffffff', foreground: '#111111', bold: true, borderColor: '#dddddd' },
      body: {
        background: '#ffffff',
        alternateBackground: '#f7f7f7',
        foreground: '#111111',
        borderColor: '#dddddd',
        grid: 'horizontal',
      },
      selection: { background: '#dbeafe', foreground: '#111111' },
      radius: 6,
      cellPaddingX: 8,
      cellPaddingY: 4,
      zebra: true,
    },
    columnOverrides: { col_a: { align: 'right', numberFormat: { style: 'decimal', digits: 1 } } },
    conditionalRules: [
      {
        id: 'rule_1',
        enabled: true,
        target: { kind: 'cell', columnId: 'col_a' },
        when: {
          kind: 'compare',
          columnId: 'col_a',
          op: 'gt',
          value: 30,
        },
        style: { foreground: '#b91c1c', bold: true },
      },
    ],
    ...overrides,
  };
}

function makeManifest(overrides: Partial<WorkspaceManifest> = {}): WorkspaceManifest {
  const table = makeTable();
  return {
    formatVersion: 1,
    id: 'ws_1',
    name: 'Demo',
    appVersion: '0.1.0',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    tables: [table],
    charts: [makeChart()],
    views: [
      {
        id: 'viw_1',
        kind: 'table',
        refId: table.id,
        title: '温度记录',
        tableView: {
          tableId: table.id,
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
    tableStyles: [makeStyle()],
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

function issuesOf(value: unknown): { path: string; code: string }[] {
  const result = parseManifest(value);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues;
}

describe('parseManifest — happy paths', () => {
  it('round-trips a manifest without changing it', () => {
    const manifest = makeManifest();
    const result = parseManifest(manifest);
    expect(result).toEqual({ ok: true, data: manifest });
  });

  it('accepts SPEC §7.2 style short ids', () => {
    const manifest = makeManifest();
    const result = parseManifest({
      ...manifest,
      tables: [makeTable({ id: 'tbl_demo', file: 'tables/tbl_demo.jsonl' })],
      charts: [],
      tableStyles: [],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts nested filter predicates', () => {
    const manifest = makeManifest();
    const view = manifest.views[0]!;
    const filter: FilterPredicate = {
      kind: 'all',
      children: [
        { kind: 'compare', columnId: 'col_a', op: 'gt', value: 30 },
        {
          kind: 'any',
          children: [
            { kind: 'compare', columnId: 'col_a', op: 'isNull' },
            { kind: 'compare', columnId: 'col_a', op: 'between', value: 1, value2: 2 },
          ],
        },
      ],
    };
    const result = parseManifest({
      ...manifest,
      views: [{ ...view, tableView: { ...view.tableView!, filter } }],
    });
    expect(result.ok).toBe(true);
  });
});

describe('parseManifest — structured failures', () => {
  it('reports a future format version as an enum issue', () => {
    const issues = issuesOf({ ...makeManifest(), formatVersion: 2 });
    expect(issues).toContainEqual(
      expect.objectContaining({ path: 'formatVersion', code: 'E_ENUM' }),
    );
  });

  it('reports missing required fields and unknown keys', () => {
    const manifest = makeManifest();
    const withoutName: Record<string, unknown> = { ...manifest };
    delete withoutName['name'];
    expect(issuesOf(withoutName)).toContainEqual(
      expect.objectContaining({ path: 'name', code: 'E_REQUIRED' }),
    );

    const extra = { ...manifest, unexpected: true };
    expect(issuesOf(extra)).toContainEqual(
      expect.objectContaining({ path: '', code: 'E_VALIDATION' }),
    );
  });

  it('rejects invalid column keys, enum shapes and paths', () => {
    const manifest = makeManifest();
    const badKey = makeTable({
      columns: [{ id: 'col_id', key: '1bad', label: 'ID', type: 'text', role: 'none' }],
    });
    expect(issuesOf({ ...manifest, tables: [badKey], charts: [], views: [] })).toContainEqual(
      expect.objectContaining({ path: 'tables[0].columns[0].key' }),
    );

    const enumWithoutOptions = makeTable({
      columns: [{ id: 'col_id', key: 'id', label: 'ID', type: 'enum', role: 'none' }],
    });
    expect(
      issuesOf({ ...manifest, tables: [enumWithoutOptions], charts: [], views: [] }),
    ).toContainEqual(
      expect.objectContaining({ path: 'tables[0].columns[0].enumOptions', code: 'E_VALIDATION' }),
    );

    const duplicateEnum = makeTable({
      columns: [
        {
          id: 'col_id',
          key: 'id',
          label: 'ID',
          type: 'enum',
          role: 'none',
          enumOptions: [
            { value: 'a', label: 'A' },
            { value: 'a', label: 'A again' },
          ],
        },
      ],
    });
    expect(
      issuesOf({ ...manifest, tables: [duplicateEnum], charts: [], views: [] }),
    ).toContainEqual(
      expect.objectContaining({ path: 'tables[0].columns[0].enumOptions[1].value' }),
    );

    const traversal = makeTable({ file: 'tables/../../secret.jsonl' });
    expect(issuesOf({ ...manifest, tables: [traversal] })).toContainEqual(
      expect.objectContaining({ path: 'tables[0].file' }),
    );
  });

  it('rejects timestamps that are not ISO 8601 date-times', () => {
    expect(issuesOf({ ...makeManifest(), createdAt: '2026-01-01' })).toContainEqual(
      expect.objectContaining({ path: 'createdAt' }),
    );
  });

  it('rejects layouts and filters that break their structural limits', () => {
    const manifest = makeManifest();
    const layout = {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.95,
      first: { type: 'pane', viewIds: [], activeViewId: null },
      second: { type: 'pane', viewIds: [], activeViewId: null },
    };
    expect(issuesOf({ ...manifest, layout })).toContainEqual(
      expect.objectContaining({ path: 'layout.ratio', code: 'E_RANGE' }),
    );

    const bigFilter = {
      kind: 'any',
      children: Array.from({ length: 21 }, (_, index) => ({
        kind: 'compare',
        columnId: 'col_a',
        op: 'gt',
        value: index,
      })),
    };
    const withFilter = makeManifest();
    const view = withFilter.views[0];
    expect(view?.tableView).toBeDefined();
    const filtered = {
      ...withFilter,
      views: [
        {
          ...view,
          tableView: { ...view?.tableView, filter: bigFilter },
        },
      ],
    };
    expect(issuesOf(filtered)).toContainEqual(
      expect.objectContaining({ path: 'views[0].tableView.filter.children', code: 'E_RANGE' }),
    );
  });

  it('rejects chart options outside their ranges', () => {
    const chart = makeChart({ options: { ...makeChart().options, lineWidth: 9 } });
    expect(issuesOf({ ...makeManifest(), charts: [chart] })).toContainEqual(
      expect.objectContaining({ path: 'charts[0].options.lineWidth', code: 'E_RANGE' }),
    );
  });
});

describe('parseTableMeta / parseColumnDef / parseRow', () => {
  it('parses a table and rejects an oversized column list', () => {
    expect(parseTableMeta(makeTable()).ok).toBe(true);

    const columns: ColumnDef[] = Array.from({ length: 101 }, (_, index) => ({
      id: `col_${String(index)}`,
      key: `c${String(index)}`,
      label: `Column ${String(index)}`,
      type: 'text',
      role: 'none',
    }));
    const result = parseTableMeta(makeTable({ columns }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: 'columns', code: 'E_RANGE' }),
      );
    }
  });

  it('parses columns and rejects out-of-range precision', () => {
    expect(
      parseColumnDef({ id: 'col_a', key: 'a', label: 'A', type: 'number', role: 'y' }).ok,
    ).toBe(true);
    expect(
      parseColumnDef({
        id: 'col_a',
        key: 'a',
        label: 'A',
        type: 'number',
        role: 'y',
        precision: 11,
      }).ok,
    ).toBe(false);
  });

  it('parses rows and rejects bad ids or extra fields', () => {
    const row: Row = { id: 'row_1', values: ['a', 1735689600000, 21.5] };
    expect(parseRow(row).ok).toBe(true);
    expect(parseRow({ id: 'tbl_1', values: [] }).ok).toBe(false);
    expect(parseRow({ id: 'row_1', values: [], extra: true }).ok).toBe(false);
  });
});

describe('parseCell', () => {
  const numberColumn: ColumnDef = { id: 'col_n', key: 'n', label: 'N', type: 'number', role: 'y' };

  it('accepts the physical shape of each column type', () => {
    expect(parseCell(21.5, numberColumn)).toEqual({ ok: true, value: 21.5 });
    expect(
      parseCell(1735689600000, { id: 'col_d', key: 'd', label: 'D', type: 'date', role: 'x' }),
    ).toEqual({ ok: true, value: 1735689600000 });
    expect(
      parseCell(true, { id: 'col_b', key: 'b', label: 'B', type: 'boolean', role: 'none' }),
    ).toEqual({ ok: true, value: true });
    expect(
      parseCell('text', { id: 'col_t', key: 't', label: 'T', type: 'text', role: 'none' }),
    ).toEqual({ ok: true, value: 'text' });
    expect(
      parseCell('open', {
        id: 'col_e',
        key: 'e',
        label: 'E',
        type: 'enum',
        role: 'none',
        enumOptions: [{ value: 'open', label: 'Open' }],
      }),
    ).toEqual({ ok: true, value: 'open' });
  });

  it('rejects values of the wrong physical type', () => {
    expect(parseCell('21.5', numberColumn).ok).toBe(false);
    expect(parseCell(Number.NaN, numberColumn).ok).toBe(false);
    expect(parseCell(1.5, { id: 'col_d', key: 'd', label: 'D', type: 'date', role: 'x' }).ok).toBe(
      false,
    );
    expect(
      parseCell(1, { id: 'col_b', key: 'b', label: 'B', type: 'boolean', role: 'none' }).ok,
    ).toBe(false);
    expect(parseCell(1, { id: 'col_t', key: 't', label: 'T', type: 'text', role: 'none' }).ok).toBe(
      false,
    );
    expect(
      parseCell('nope', {
        id: 'col_e',
        key: 'e',
        label: 'E',
        type: 'enum',
        role: 'none',
        enumOptions: [{ value: 'open', label: 'Open' }],
      }),
    ).toMatchObject({ ok: false, code: 'E_ENUM' });
    expect(
      parseCell(1, {
        id: 'col_e',
        key: 'e',
        label: 'E',
        type: 'enum',
        role: 'none',
        enumOptions: [{ value: 'open', label: 'Open' }],
      }),
    ).toMatchObject({ ok: false, code: 'E_ENUM' });
  });

  it('enforces required and text-length rules', () => {
    expect(parseCell(null, numberColumn)).toEqual({ ok: true, value: null });
    expect(parseCell(null, { ...numberColumn, required: true })).toMatchObject({
      ok: false,
      code: 'E_REQUIRED',
    });
    expect(
      parseCell('a'.repeat(100_001), {
        id: 'col_t',
        key: 't',
        label: 'T',
        type: 'text',
        role: 'none',
      }),
    ).toMatchObject({ ok: false, code: 'E_RANGE' });
  });
});

describe('helpers', () => {
  it('formats issue paths like JSON pointers for humans', () => {
    expect(formatIssuePath([])).toBe('');
    expect(formatIssuePath(['tables', 0, 'columns', 2, 'key'])).toBe('tables[0].columns[2].key');
    expect(formatIssuePath([0])).toBe('[0]');
  });

  it('narrows cells', () => {
    expect(isCell(1)).toBe(true);
    expect(isCell('a')).toBe(true);
    expect(isCell(true)).toBe(true);
    expect(isCell(null)).toBe(true);
    expect(isCell(Number.NaN)).toBe(false);
    expect(isCell(undefined)).toBe(false);
    expect(isCell({})).toBe(false);
  });
});
