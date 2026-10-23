import { describe, expect, it } from 'vitest';

import { createAppError } from '@curve/domain';
import type {
  ColumnDef,
  FilterPredicate,
  Row,
  TableMeta,
  ViewDef,
  WorkspaceManifest,
} from '@curve/domain';
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

const NOW = new Date('2026-10-21T00:00:00.000Z');
const logger: AppLogger = { error: () => undefined, warn: () => undefined };

class RecordingStore implements WorkspaceStore {
  readonly calls: string[] = [];
  readonly writtenTables: Array<{ tableId: string; jsonl: string }> = [];
  readonly manifests: WorkspaceManifest[] = [];
  failTable = false;

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

const COLUMNS: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'Id', type: 'text', role: 'none', required: true },
  { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'label' },
  { id: 'col_amount', key: 'amount', label: 'Amount', type: 'number', role: 'y' },
];

const TABLE: TableMeta = {
  id: 'tbl_paste',
  name: 'Paste',
  file: 'tables/tbl_paste.jsonl',
  schemaVersion: 1,
  columns: COLUMNS,
  primaryKey: 'col_id',
  rowCount: 2,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

const ROWS: Row[] = [
  { id: 'row_a', values: ['alpha', 'First', 10] },
  { id: 'row_b', values: ['beta', 'Second', 20] },
];

const COLUMN_IDS = COLUMNS.map((column) => column.id);

function view(filter?: FilterPredicate): ViewDef {
  return {
    id: 'viw_paste',
    kind: 'table',
    refId: TABLE.id,
    title: 'Paste',
    tableView: {
      tableId: TABLE.id,
      styleId: 'builtin.report-light',
      columnOrder: [...COLUMN_IDS],
      widths: {},
      hiddenColumnIds: [],
      sort: [],
      ...(filter === undefined ? {} : { filter }),
      frozenColumnCount: 1,
    },
  };
}

function workspaceState(): NonNullable<AppState['workspace']> {
  return {
    formatVersion: 1,
    id: 'ws_paste',
    name: 'Paste',
    root: 'C:\\tmp\\Paste.cstudio',
    appVersion: '0.1.0',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    settings: {
      theme: 'system',
      locale: 'zh-CN',
      defaultTableStyleId: 'builtin.report-light',
      autosave: true,
    },
    warnings: [],
  };
}

function setup(options: { filter?: FilterPredicate; rows?: Row[] } = {}) {
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
  const rows = options.rows ?? ROWS;
  core.store.setState({
    workspace: workspaceState(),
    tables: { [TABLE.id]: { table: { ...TABLE, rowCount: rows.length }, rows } },
    views: { viw_paste: view(options.filter) },
    layout: { type: 'pane', viewIds: ['viw_paste'], activeViewId: 'viw_paste' },
  });
  return { core, store };
}

function request(
  text = 'alpha\tRenamed\t1,234.5\r\nbeta\tSecond\t20\r\ngamma\tThird\t30',
  rowIds?: readonly string[],
) {
  return {
    tableId: TABLE.id,
    viewId: 'viw_paste',
    columnIds: COLUMN_IDS,
    ...(rowIds === undefined ? {} : { rowIds }),
    anchor: { rowId: 'row_a', columnId: 'col_id' },
    text,
  };
}

describe('paste actions', () => {
  it('parses and validates a full matrix without touching the document', async () => {
    const { core, store } = setup();
    const before = core.store.getState();
    const progress: Array<{
      processedRows: number;
      totalRows: number;
      done: number;
      total: number;
    }> = [];

    const outcome = await core.actions.preparePaste(request(), {
      onProgress: (entry) => {
        progress.push(entry);
      },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.data.large).toBe(false);
    expect(outcome.data.plan.summary).toMatchObject({
      updatedRows: 2,
      appendedRows: 1,
      totalCells: 9,
    });
    expect(outcome.data.plan.rows).toHaveLength(3);
    expect(core.store.getState().tables).toBe(before.tables);
    expect(core.store.getState().ui.dirtyTables).toEqual([]);
    expect(store.calls).toEqual([]);
    expect(progress.at(-1)).toEqual({ processedRows: 3, totalRows: 3, done: 9, total: 9 });
  });

  it('reports how many columns are needed before a plan can be built', async () => {
    const { core } = setup();
    const outcome = await core.actions.preparePaste(request('alpha\tRenamed\t1,234.5\tx'));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.kind).toBe('needs-columns');
    if (outcome.kind === 'needs-columns') {
      expect(outcome.newColumnsRequired).toBe(1);
      expect(outcome.large).toBe(false);
    }
  });

  it('accepts new column definitions and plans the widened schema', async () => {
    const { core } = setup();
    const outcome = await core.actions.preparePaste({
      ...request('alpha\tRenamed\t1,234.5\tx'),
      newColumns: [{ id: 'col_extra', key: 'extra', label: 'Extra', type: 'text', role: 'none' }],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.data.plan.summary.addedColumns).toBe(1);
    expect(outcome.data.plan.table.columns).toHaveLength(4);
    expect(outcome.data.plan.rows[0]?.values).toEqual(['alpha', 'Renamed', 1234.5, 'x']);
  });

  it('returns structured cell issues when a value does not coerce', async () => {
    const { core } = setup();
    const outcome = await core.actions.preparePaste(request('alpha\tRenamed\tnot-a-number'));
    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.kind !== 'invalid') {
      return;
    }
    expect(outcome.issues[0]).toMatchObject({
      matrixRow: 0,
      matrixColumn: 2,
      columnId: 'col_amount',
      reason: 'type',
    });
    expect(outcome.totalIssues).toBe(1);
  });

  it('blocks paste while a view filter is active', async () => {
    const { core, store } = setup({
      filter: { kind: 'compare', columnId: 'col_name', op: 'eq', value: 'First' },
    });
    const prepared = await core.actions.preparePaste(request());
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.kind).toBe('blocked');
      if (prepared.kind === 'blocked') {
        expect(prepared.reason).toBe('filter-active');
      }
    }
    const applied = await core.actions.applyPaste({
      ...request(),
      matrix: [
        ['alpha', 'Renamed', '1'],
        ['beta', 'Second', '2'],
      ],
    });
    expect(applied.ok).toBe(false);
    expect(store.calls).toEqual([]);
    expect(core.store.getState().tables[TABLE.id]?.rows).toEqual(ROWS);
  });

  it('writes only the visible rows when the view is filtered', async () => {
    const { core, store } = setup({
      filter: { kind: 'compare', columnId: 'col_name', op: 'eq', value: 'First' },
    });
    const rowIds = ['row_a'];
    const prepared = await core.actions.preparePaste(request('alpha\tRenamed\t1', rowIds));
    expect(prepared.ok).toBe(true);

    const applied = await core.actions.applyPaste({
      tableId: TABLE.id,
      viewId: 'viw_paste',
      columnIds: COLUMN_IDS,
      rowIds,
      anchor: { rowId: 'row_a', columnId: 'col_id' },
      matrix: [['alpha', 'Renamed', '1']],
    });
    expect(applied.ok).toBe(true);
    const rows = core.store.getState().tables[TABLE.id]?.rows ?? [];
    expect(rows[0]?.values).toEqual(['alpha', 'Renamed', 1]);
    expect(rows[1]?.values).toEqual(['beta', 'Second', 20]);
    expect(store.writtenTables.at(-1)?.jsonl).toContain('"Renamed"');
    expect(store.calls.filter((call) => call === 'manifest')).toHaveLength(1);
  });

  it('blocks a filtered paste when the matrix exceeds the visible rows', async () => {
    const { core, store } = setup({
      filter: { kind: 'compare', columnId: 'col_name', op: 'eq', value: 'First' },
    });
    const before = core.store.getState().tables[TABLE.id]?.rows;
    const outcome = await core.actions.preparePaste(
      request('alpha\tA\t1\r\nbeta\tB\t2\r\ngamma\tC\t3', ['row_a']),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.kind === 'blocked') {
      expect(outcome.reason).toBe('filter-visible-exceeded');
    }
    expect(core.store.getState().tables[TABLE.id]?.rows).toBe(before);
    expect(store.calls).toEqual([]);
  });

  it('blocks a filtered paste whose anchor row is not visible', async () => {
    const { core } = setup({
      filter: { kind: 'compare', columnId: 'col_name', op: 'eq', value: 'First' },
    });
    const outcome = await core.actions.preparePaste(request('alpha\tA\t1', ['row_b']));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.kind === 'blocked') {
      expect(outcome.reason).toBe('filter-anchor-hidden');
    }
  });

  it('reports an empty clipboard as a no-op', async () => {
    const { core } = setup();
    const outcome = await core.actions.preparePaste(request(''));
    expect(outcome).toEqual({ ok: false, kind: 'empty' });
  });

  it('cancels a chunked preview without dispatching or changing state', async () => {
    const manyRows = Array.from({ length: 200 }, (_, rowIndex) => [
      `id${String(rowIndex)}`,
      `name${String(rowIndex)}`,
    ]);
    const text = manyRows.map((row) => row.join('\t')).join('\n');
    const { core } = setup();
    const before = core.store.getState();
    const controller = new AbortController();

    const outcome = await core.actions.preparePaste(
      { ...request(text), anchor: { rowId: 'row_a', columnId: 'col_id' } },
      {
        signal: controller.signal,
        chunkCells: 20,
        yieldControl: async () => {
          controller.abort();
        },
      },
    );

    expect(outcome).toEqual({ ok: false, kind: 'cancelled' });
    expect(core.store.getState().tables).toBe(before.tables);
    expect(core.store.getState().ui.dirtyTables).toEqual([]);
  });

  it('marks a 10k-cell matrix as large even before columns are resolved', async () => {
    const wide = Array.from({ length: 100 }, () => Array<string>(100).fill('x'));
    const text = wide.map((row) => row.join('\t')).join('\n');
    const { core } = setup();
    const outcome = await core.actions.preparePaste(request(text));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.kind === 'needs-columns') {
      expect(outcome.large).toBe(true);
    }
  });

  it('applies one paste command, saves the table and manifest, and supports one undo', async () => {
    const { core, store } = setup();
    const applied = await core.actions.applyPaste({
      ...request(),
      matrix: [
        ['alpha', 'Renamed', '1,234.5'],
        ['beta', 'Second', '20'],
        ['gamma', 'Third', '30'],
      ],
    });
    expect(applied.ok).toBe(true);
    expect(core.store.getState().tables[TABLE.id]?.rows).toHaveLength(3);
    expect(core.history.size()).toBe(1);
    expect(store.calls).toEqual(['writeTable', 'manifest']);
    expect(store.writtenTables[0]?.jsonl).toContain('"gamma","Third",30');

    const undone = await core.actions.undo();
    expect(undone.ok).toBe(true);
    expect(core.store.getState().tables[TABLE.id]?.rows).toEqual(ROWS);
    await core.actions.flushSaves();
    expect(store.calls).toEqual(['writeTable', 'manifest', 'writeTable', 'manifest']);
  });

  it('keeps the committed paste dirty when the save fails', async () => {
    const { core, store } = setup();
    store.failTable = true;
    const applied = await core.actions.applyPaste({
      ...request(),
      matrix: [['alpha', 'Renamed', '1']],
    });
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.committed).toBe(true);
      expect(applied.error.code).toBe('E_FS_WRITE');
    }
    expect(core.store.getState().tables[TABLE.id]?.rows[0]?.values[1]).toBe('Renamed');
    expect(core.store.getState().ui.dirtyTables.map((entry) => entry.tableId)).toEqual([TABLE.id]);
  });

  it('returns structured issues when the command rejects a stale preview', async () => {
    const { core, store } = setup();
    const applied = await core.actions.applyPaste({
      ...request(),
      matrix: [['alpha', 'Renamed', 'not-a-number']],
    });
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.issues?.[0]).toMatchObject({
        matrixRow: 0,
        matrixColumn: 2,
        reason: 'type',
      });
    }
    expect(store.calls).toEqual([]);
    expect(core.store.getState().tables[TABLE.id]?.rows).toEqual(ROWS);
  });

  it('does not treat a new column as required when planning a paste', async () => {
    const { core } = setup();
    const outcome = await core.actions.preparePaste({
      ...request('alpha\tRenamed\t1\tx'),
      newColumns: [{ id: 'col_extra', key: 'extra', label: 'Extra', type: 'text', role: 'none' }],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.plan.addedColumns[0]?.required).not.toBe(true);
    }
  });
});
