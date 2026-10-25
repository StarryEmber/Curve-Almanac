import { describe, expect, it } from 'vitest';

import { createAppError } from '@curve/domain';
import type { ColumnDef, TableMeta, ViewDef, WorkspaceManifest } from '@curve/domain';
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

const NOW = new Date('2026-10-25T00:00:00.000Z');
const logger: AppLogger = { error: () => undefined, warn: () => undefined };

class RecordingStore implements WorkspaceStore {
  readonly manifests: WorkspaceManifest[] = [];
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
    return { bytes: request.jsonl.length };
  }
  async writeManifest(request: WriteManifestRequest): Promise<OkReply> {
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

const COLUMNS: ColumnDef[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_time', key: 'time', label: 'Time', type: 'number', role: 'x' },
  { id: 'col_a', key: 'a', label: 'Sensor A', type: 'number', role: 'y' },
  { id: 'col_b', key: 'b', label: 'Sensor B', type: 'number', role: 'y' },
  { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' },
];

const TABLE: TableMeta = {
  id: 'tbl_chart',
  name: 'Readings',
  file: 'tables/tbl_chart.jsonl',
  schemaVersion: 1,
  columns: COLUMNS,
  primaryKey: 'col_id',
  rowCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function tableView(): ViewDef {
  return {
    id: 'viw_table',
    kind: 'table',
    refId: TABLE.id,
    title: 'Readings',
    tableView: {
      tableId: TABLE.id,
      styleId: 'builtin.report-light',
      columnOrder: COLUMNS.map((column) => column.id),
      widths: {},
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: 1,
    },
  };
}

function workspaceState(): NonNullable<AppState['workspace']> {
  const manifest = createEmptyManifest({
    name: 'Chart Demo',
    appVersion: '0.1.0',
    now: NOW,
    uuid: () => 'ws',
  });
  return {
    formatVersion: 1,
    id: manifest.id,
    name: manifest.name,
    root: 'C:\\tmp\\Chart Demo.cstudio',
    appVersion: manifest.appVersion,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    settings: manifest.settings,
    warnings: [],
  };
}

function setup() {
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
    tables: { [TABLE.id]: { table: TABLE, rows: [] } },
    views: { viw_table: tableView() },
    layout: { type: 'pane', viewIds: ['viw_table'], activeViewId: 'viw_table' },
    ui: { ...core.store.getState().ui, activeTableId: TABLE.id, activeViewId: 'viw_table' },
  });
  return { store, core };
}

const WIDE = {
  layout: 'wide' as const,
  xColumnId: 'col_time',
  yColumnIds: ['col_a', 'col_b'],
};

const LONG = {
  layout: 'long' as const,
  xColumnId: 'col_time',
  seriesColumnId: 'col_site',
  yColumnId: 'col_a',
};

describe('chart actions', () => {
  it('creates a chart with its view, persists only the manifest and activates it', async () => {
    const { store, core } = setup();
    const outcome = await core.actions.createChart({
      tableId: TABLE.id,
      title: 'Readings chart',
      kind: 'line',
      mapping: WIDE,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const { chartId, viewId } = outcome.data;
    expect(chartId).toMatch(/^cht_/);
    expect(viewId).toMatch(/^viw_/);
    expect(store.manifests).toHaveLength(1);
    const manifest = store.manifests[0];
    expect(manifest?.charts).toHaveLength(1);
    expect(manifest?.charts[0]?.mapping).toEqual(WIDE);
    expect(manifest?.views.some((view) => view.id === viewId && view.kind === 'chart')).toBe(true);

    const state = core.store.getState();
    expect(state.ui.activeViewId).toBe(viewId);
    expect(state.charts[chartId]?.title).toBe('Readings chart');
  });

  it('rejects an invalid mapping or a missing table without writing the manifest', async () => {
    const { store, core } = setup();
    const invalid = await core.actions.createChart({
      tableId: TABLE.id,
      title: 'Broken',
      kind: 'line',
      mapping: { layout: 'wide', xColumnId: 'col_time', yColumnIds: ['col_id'] },
    });
    expect(invalid.ok).toBe(false);

    const missing = await core.actions.createChart({
      tableId: 'tbl_missing',
      title: 'Missing',
      kind: 'line',
      mapping: WIDE,
    });
    expect(missing.ok).toBe(false);
    expect(store.manifests).toHaveLength(0);
    expect(Object.keys(core.store.getState().charts)).toEqual([]);
  });

  it('updates a chart and reports a committed save failure', async () => {
    const { store, core } = setup();
    const created = await core.actions.createChart({
      tableId: TABLE.id,
      title: 'Readings chart',
      kind: 'line',
      mapping: WIDE,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const chart = core.store.getState().charts[created.data.chartId];
    if (chart === undefined) {
      throw new Error('chart missing');
    }
    const updated = await core.actions.updateChart({
      ...chart,
      kind: 'scatter',
      mapping: LONG,
      options: { ...chart.options, legend: 'right', paletteId: 'colorblind' },
    });
    expect(updated.ok).toBe(true);
    const persisted = store.manifests.at(-1)?.charts[0];
    expect(persisted?.kind).toBe('scatter');
    expect(persisted?.mapping).toEqual(LONG);
    expect(persisted?.options.legend).toBe('right');
    expect(persisted?.options.paletteId).toBe('colorblind');

    store.failManifest = true;
    const failed = await core.actions.updateChart({
      ...chart,
      options: { ...chart.options, lineWidth: 5 },
    });
    expect(failed.ok).toBe(false);
    if (failed.ok) {
      return;
    }
    expect(failed.committed).toBe(true);
    expect(core.store.getState().charts[created.data.chartId]?.options.lineWidth).toBe(5);
  });

  it('deletes a chart and its view in one manifest write', async () => {
    const { store, core } = setup();
    const created = await core.actions.createChart({
      tableId: TABLE.id,
      title: 'Readings chart',
      kind: 'line',
      mapping: WIDE,
    });
    if (!created.ok) {
      throw new Error('chart creation failed');
    }
    const deleted = await core.actions.deleteChart(created.data.chartId);
    expect(deleted.ok).toBe(true);
    const manifest = store.manifests.at(-1);
    expect(manifest?.charts).toEqual([]);
    expect(manifest?.views.map((view) => view.id)).toEqual(['viw_table']);
    expect(core.store.getState().ui.activeViewId).toBe('viw_table');
  });

  it('duplicates a chart with a new id and independent options', async () => {
    const { core } = setup();
    const created = await core.actions.createChart({
      tableId: TABLE.id,
      title: 'Readings chart',
      kind: 'line',
      mapping: WIDE,
    });
    if (!created.ok) {
      throw new Error('chart creation failed');
    }
    const duplicated = await core.actions.duplicateChart(created.data.chartId);
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) {
      return;
    }
    const state = core.store.getState();
    expect(duplicated.data.chartId).not.toBe(created.data.chartId);
    expect(duplicated.data.viewId).not.toBe(created.data.viewId);
    expect(state.charts[duplicated.data.chartId]?.title).toBe('Readings chart (2)');
    expect(state.charts[duplicated.data.chartId]?.mapping).toEqual(WIDE);
    expect(Object.values(state.views).filter((view) => view.kind === 'chart')).toHaveLength(2);

    const copy = state.charts[duplicated.data.chartId];
    if (copy === undefined) {
      throw new Error('copy missing');
    }
    await core.actions.updateChart({ ...copy, options: { ...copy.options, paletteId: 'vivid' } });
    const after = core.store.getState();
    expect(after.charts[duplicated.data.chartId]?.options.paletteId).toBe('vivid');
    expect(after.charts[created.data.chartId]?.options.paletteId).toBe('default');
  });

  it('reopens a chart after its view was closed and activates an existing view', async () => {
    const { core } = setup();
    const created = await core.actions.createChart({
      tableId: TABLE.id,
      title: 'Readings chart',
      kind: 'line',
      mapping: WIDE,
    });
    if (!created.ok) {
      throw new Error('chart creation failed');
    }
    const closed = await core.actions.closeView(created.data.viewId);
    expect(closed.ok).toBe(true);
    expect(core.store.getState().views[created.data.viewId]).toBeUndefined();

    const reopened = await core.actions.openChart(created.data.chartId);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) {
      return;
    }
    expect(reopened.data.created).toBe(true);
    expect(reopened.data.viewId).not.toBe(created.data.viewId);
    expect(core.store.getState().ui.activeViewId).toBe(reopened.data.viewId);

    const again = await core.actions.openChart(created.data.chartId);
    expect(again.ok).toBe(true);
    if (!again.ok) {
      return;
    }
    expect(again.data).toEqual({ viewId: reopened.data.viewId, created: false });
  });

  it('rejects duplicate/open/delete for unknown charts', async () => {
    const { core } = setup();
    expect((await core.actions.duplicateChart('cht_missing')).ok).toBe(false);
    expect((await core.actions.openChart('cht_missing')).ok).toBe(false);
    expect((await core.actions.deleteChart('cht_missing')).ok).toBe(false);
  });
});
