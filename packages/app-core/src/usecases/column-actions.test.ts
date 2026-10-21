import { describe, expect, it } from 'vitest';

import { createAppError } from '@curve/domain';
import type {
  ChartSpec,
  ColumnDef,
  Row,
  TableMeta,
  ViewDef,
  WorkspaceManifest,
} from '@curve/domain';
import { createEmptyManifest } from '@curve/persistence';
import type {
  BackupEntry,
  CloseWorkspaceRequest,
  CreateWorkspaceRequest,
  OkReply,
  OpenWorkspaceRequest,
  RestoreBackupRequest,
  TableReadResult,
  TableRef,
  WorkspaceOpenResult,
  WorkspaceStore,
  WriteManifestRequest,
  WriteTableRequest,
  WriteTableResult,
} from '@curve/persistence';

import { createAppCore } from '../app-core';

import type { AppLogger } from '../logging';
import type { AppState } from '../state/types';
import type { ColumnDraft } from '../validation/column-draft';

const NOW = new Date('2026-10-21T00:00:00.000Z');
const logger: AppLogger = { error: () => undefined, warn: () => undefined };

class RecordingStore implements WorkspaceStore {
  readonly calls: string[] = [];
  readonly manifests: WorkspaceManifest[] = [];
  readonly writtenTables: Array<{ tableId: string; jsonl: string }> = [];
  failTable = false;
  failManifest = false;

  async create(_request: CreateWorkspaceRequest): Promise<WorkspaceManifest> {
    throw new Error('not used');
  }
  async open(_request: OpenWorkspaceRequest): Promise<WorkspaceOpenResult> {
    throw new Error('not used');
  }
  async close(_request: CloseWorkspaceRequest): Promise<OkReply> {
    return { ok: true };
  }
  async readTable(_request: TableRef): Promise<TableReadResult> {
    throw new Error('not used');
  }
  async writeTable(request: WriteTableRequest): Promise<WriteTableResult> {
    this.calls.push('writeTable');
    if (this.failTable) {
      throw createAppError('E_FS_WRITE', 'disk full');
    }
    this.writtenTables.push({ tableId: request.tableId, jsonl: request.jsonl });
    return { bytes: request.jsonl.length };
  }
  async writeManifest(request: WriteManifestRequest): Promise<OkReply> {
    this.calls.push('manifest');
    if (this.failManifest) {
      throw createAppError('E_FS_WRITE', 'disk full');
    }
    this.manifests.push(request.manifest);
    return { ok: true };
  }
  async trash(_request: TableRef): Promise<OkReply> {
    return { ok: true };
  }
  async listBackups(_request: TableRef): Promise<BackupEntry[]> {
    return [];
  }
  async restore(_request: RestoreBackupRequest): Promise<OkReply> {
    return { ok: true };
  }
}

function workspaceState(): NonNullable<AppState['workspace']> {
  const manifest = createEmptyManifest({
    name: 'Demo',
    appVersion: '0.1.0',
    now: NOW,
    uuid: () => 'ws',
  });
  return {
    formatVersion: 1,
    id: manifest.id,
    name: manifest.name,
    root: 'C:\\tmp\\Demo.cstudio',
    appVersion: manifest.appVersion,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    settings: manifest.settings,
    warnings: [],
  };
}

function makeTable(overrides: Partial<TableMeta> = {}): TableMeta {
  return {
    id: 'tbl_1',
    name: 'Readings',
    file: 'tables/tbl_1.jsonl',
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
      { id: 'col_time', key: 'time', label: 'Time', type: 'date', role: 'x' },
      { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
    ],
    primaryKey: 'col_id',
    rowCount: 2,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function makeRows(): Row[] {
  return [
    { id: 'row_1', values: ['a', 1_735_689_600_000, 21.5] },
    { id: 'row_2', values: ['b', 1_735_689_660_000, 23.1] },
  ];
}

function makeView(): ViewDef {
  return {
    id: 'viw_1',
    kind: 'table',
    refId: 'tbl_1',
    title: 'Readings',
    tableView: {
      tableId: 'tbl_1',
      styleId: 'builtin.report-light',
      columnOrder: ['col_id', 'col_time', 'col_value'],
      widths: { col_value: 120 },
      hiddenColumnIds: [],
      sort: [{ columnId: 'col_time', direction: 'asc' }],
      filter: {
        kind: 'all',
        children: [{ kind: 'compare', columnId: 'col_time', op: 'gt', value: 0 }],
      },
      frozenColumnCount: 1,
    },
  };
}

function makeChart(): ChartSpec {
  return {
    id: 'cht_1',
    title: 'Chart',
    kind: 'line',
    tableId: 'tbl_1',
    mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_value'] },
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
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function setup(overrides: { table?: TableMeta; rows?: Row[] } = {}) {
  const store = new RecordingStore();
  let next = 0;
  const core = createAppCore({
    workspaceStore: store,
    logger,
    now: () => NOW,
    uuid: () => {
      next += 1;
      return `u${String(next)}`;
    },
  });
  core.store.setState({
    workspace: workspaceState(),
    tables: {
      tbl_1: { table: overrides.table ?? makeTable(), rows: overrides.rows ?? makeRows() },
    },
    views: { viw_1: makeView() },
    charts: { cht_1: makeChart() },
    layout: { type: 'pane', viewIds: ['viw_1'], activeViewId: 'viw_1' },
    ui: {
      activeTableId: 'tbl_1',
      activeViewId: 'viw_1',
      error: null,
      dirtyTables: [],
      save: { status: 'idle', pending: 0, error: null },
      editIssue: null,
    },
  });
  return { store, core };
}

function draft(overrides: Partial<ColumnDraft> = {}): ColumnDraft {
  return {
    label: 'Note',
    key: 'note',
    type: 'text',
    role: 'none',
    ...overrides,
  };
}

function emptyRowsTable(): TableMeta {
  return makeTable({ rowCount: 0 });
}

describe('column actions', () => {
  it('adds a column to an empty table with a manifest write only', async () => {
    const { store, core } = setup({ table: emptyRowsTable(), rows: [] });

    const outcome = await core.actions.addColumn('tbl_1', draft());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.data.columnId).toMatch(/^col_u\d+$/);
    expect(store.calls).toEqual(['manifest']);
    expect(store.writtenTables).toEqual([]);
    expect(core.store.getState().tables['tbl_1']?.table.columns).toHaveLength(4);
    expect(core.store.getState().views['viw_1']?.tableView?.columnOrder).toHaveLength(4);
  });

  it('adds a column to a non-empty table through the table save queue', async () => {
    const { store, core } = setup();

    const outcome = await core.actions.addColumn('tbl_1', draft());

    expect(outcome.ok).toBe(true);
    expect(store.calls).toEqual(['writeTable', 'manifest']);
    expect(store.writtenTables[0]?.jsonl).toContain('"v":["a",1735689600000,21.5,null]');
    expect(store.manifests.at(-1)?.tables[0]?.columns).toHaveLength(4);
  });

  it('returns form issues without touching the store or the disk', async () => {
    const { store, core } = setup();

    const outcome = await core.actions.addColumn('tbl_1', draft({ label: ' ', key: ' ' }));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues?.map((issue) => issue.field)).toEqual(['label', 'key']);
    }
    expect(store.calls).toEqual([]);
  });

  it('rejects the 101st column before dispatching', async () => {
    const columns: ColumnDef[] = [
      { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
    ];
    for (let index = 1; index < 100; index += 1) {
      columns.push({
        id: `col_${String(index)}`,
        key: `field_${String(index)}`,
        label: `Field ${String(index)}`,
        type: 'text',
        role: 'none',
      });
    }
    const { store, core } = setup({
      table: makeTable({ columns, rowCount: 0 }),
      rows: [],
    });

    const outcome = await core.actions.addColumn('tbl_1', draft());

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_VALIDATION');
    }
    expect(store.calls).toEqual([]);
  });

  it('persists metadata-only edits with the manifest and no table rewrite', async () => {
    const { store, core } = setup();

    const outcome = await core.actions.updateColumn(
      'tbl_1',
      'col_value',
      draft({ label: 'Amount', key: 'value', type: 'number', role: 'y' }),
    );

    expect(outcome.ok).toBe(true);
    expect(store.calls).toEqual(['manifest']);
    expect(core.store.getState().tables['tbl_1']?.table.columns[2]?.label).toBe('Amount');
  });

  it('persists a successful type conversion through the save queue', async () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_value', key: 'value', label: 'Value', type: 'text', role: 'y' },
      ],
    });
    const { store, core } = setup({
      table,
      rows: [{ id: 'row_1', values: ['a', '1,234.5'] }],
    });

    const outcome = await core.actions.updateColumn(
      'tbl_1',
      'col_value',
      draft({ label: 'Value', key: 'value', type: 'number', role: 'y' }),
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.convertedCells).toBe(1);
    }
    expect(store.calls).toEqual(['writeTable', 'manifest']);
    expect(core.store.getState().tables['tbl_1']?.rows[0]?.values[1]).toBe(1234.5);
  });

  it('returns row failures and leaves memory/disk untouched when a conversion fails', async () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_value', key: 'value', label: 'Value', type: 'text', role: 'y' },
      ],
    });
    const { store, core } = setup({
      table,
      rows: [{ id: 'row_1', values: ['a', 'not a number'] }],
    });
    const before = core.store.getState();

    const outcome = await core.actions.updateColumn(
      'tbl_1',
      'col_value',
      draft({ label: 'Value', key: 'value', type: 'number', role: 'y' }),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_TYPE');
      expect(outcome.failures).toHaveLength(1);
      expect(outcome.totalFailures).toBe(1);
    }
    expect(core.store.getState().tables).toBe(before.tables);
    expect(store.calls).toEqual([]);
  });

  it('deletes a column through the save queue and reports the invalid chart', async () => {
    const { store, core } = setup();

    const outcome = await core.actions.deleteColumn('tbl_1', 'col_time');

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.invalidCharts).toBe(1);
      expect(outcome.data.viewUpdates).toBe(1);
    }
    expect(store.calls).toEqual(['writeTable', 'manifest']);
    expect(core.store.getState().views['viw_1']?.tableView?.columnOrder).toEqual([
      'col_id',
      'col_value',
    ]);
  });

  it('deletes a column from an empty table with a manifest write only', async () => {
    const { store, core } = setup({ table: emptyRowsTable(), rows: [] });

    const outcome = await core.actions.deleteColumn('tbl_1', 'col_time');

    expect(outcome.ok).toBe(true);
    expect(store.calls).toEqual(['manifest']);
  });

  it('reorders columns and persists the reordered JSONL', async () => {
    const { store, core } = setup();

    const outcome = await core.actions.reorderColumns('tbl_1', ['col_value', 'col_id', 'col_time']);

    expect(outcome.ok).toBe(true);
    expect(store.calls).toEqual(['writeTable', 'manifest']);
    expect(core.store.getState().tables['tbl_1']?.rows[0]?.values).toEqual([
      21.5,
      'a',
      1_735_689_600_000,
    ]);
  });

  it('changes the primary key with a manifest write only', async () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_code', key: 'code', label: 'Code', type: 'text', role: 'none' },
      ],
    });
    const { store, core } = setup({
      table,
      rows: [
        { id: 'row_1', values: ['a', 'x'] },
        { id: 'row_2', values: ['b', 'y'] },
      ],
    });

    const outcome = await core.actions.changePrimaryKey('tbl_1', 'col_code');

    expect(outcome.ok).toBe(true);
    expect(store.calls).toEqual(['manifest']);
    expect(core.store.getState().tables['tbl_1']?.table.primaryKey).toBe('col_code');
  });

  it('refuses an invalid primary key change without writing', async () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_code', key: 'code', label: 'Code', type: 'text', role: 'none' },
      ],
    });
    const { store, core } = setup({
      table,
      rows: [
        { id: 'row_1', values: ['a', 'dup'] },
        { id: 'row_2', values: ['b', 'dup'] },
      ],
    });

    const outcome = await core.actions.changePrimaryKey('tbl_1', 'col_code');

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failures).toHaveLength(1);
    }
    expect(store.calls).toEqual([]);
  });

  it('previews a change without dispatching or writing', async () => {
    const { store, core } = setup();

    const inspection = core.actions.inspectColumnChange({
      kind: 'delete',
      tableId: 'tbl_1',
      columnId: 'col_time',
    });

    expect(inspection.ok).toBe(true);
    if (inspection.ok) {
      expect(inspection.summary.invalidCharts).toBe(1);
    }
    expect(store.calls).toEqual([]);
  });

  it('surfaces a table write failure while keeping the in-memory change', async () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        { id: 'col_value', key: 'value', label: 'Value', type: 'text', role: 'y' },
      ],
    });
    const { store, core } = setup({
      table,
      rows: [{ id: 'row_1', values: ['a', '1,234.5'] }],
    });
    store.failTable = true;

    const outcome = await core.actions.updateColumn(
      'tbl_1',
      'col_value',
      draft({ label: 'Value', key: 'value', type: 'number', role: 'y' }),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_FS_WRITE');
    }
    expect(store.calls).toEqual(['writeTable']);
    expect(core.store.getState().tables['tbl_1']?.rows[0]?.values[1]).toBe(1234.5);
  });

  it('preserves a field type on metadata edits and drops it on a type change', async () => {
    const table = makeTable({
      columns: [
        { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
        {
          id: 'col_value',
          key: 'value',
          label: 'Value',
          type: 'number',
          role: 'y',
          fieldTypeId: 'com.curvestudio.rating',
        },
      ],
      rowCount: 1,
    });
    const { core } = setup({ table, rows: [{ id: 'row_1', values: ['a', 3] }] });

    expect(
      (
        await core.actions.updateColumn(
          'tbl_1',
          'col_value',
          draft({ label: 'Rating', key: 'value', type: 'number', role: 'y' }),
        )
      ).ok,
    ).toBe(true);
    expect(core.store.getState().tables['tbl_1']?.table.columns[1]?.fieldTypeId).toBe(
      'com.curvestudio.rating',
    );

    expect(
      (
        await core.actions.updateColumn(
          'tbl_1',
          'col_value',
          draft({ label: 'Rating', key: 'value', type: 'text', role: 'y' }),
        )
      ).ok,
    ).toBe(true);
    expect(core.store.getState().tables['tbl_1']?.table.columns[1]?.fieldTypeId).toBeUndefined();
  });
});
