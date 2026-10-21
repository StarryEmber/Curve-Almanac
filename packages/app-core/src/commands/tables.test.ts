import { describe, expect, it } from 'vitest';

import type { ChartSpec, ViewDef } from '@curve/domain';
import { createEmptyManifest } from '@curve/persistence';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import {
  createTableCreateCommand,
  createTableDeleteCommand,
  createTableMetaUpdateCommand,
  createNewTablePayload,
} from './tables';

import type { AppLogger } from '../logging';
import type { AppState } from '../state/types';

const NOW = new Date('2026-10-21T00:00:00.000Z');
const logger: AppLogger = { error: () => undefined, warn: () => undefined };

function workspaceState(): AppState['workspace'] {
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

function makeBus() {
  const store = createAppStore({ initialState: { workspace: workspaceState() } });
  const bus = createCommandBus(store, { logger });
  let next = 0;
  const uuid = (): string => {
    next += 1;
    return `u${String(next)}`;
  };
  bus.register(createTableCreateCommand({ now: () => NOW, uuid }));
  bus.register(createTableDeleteCommand({ now: () => NOW }));
  bus.register(createTableMetaUpdateCommand({ now: () => NOW }));
  return { store, bus, uuid };
}

function createTable(
  bus: ReturnType<typeof createCommandBus>,
  uuid: () => string,
  name = 'Sensors',
) {
  const payload = createNewTablePayload({ name, now: NOW, uuid });
  const outcome = bus.dispatch('table.create', payload);
  expect(outcome.ok).toBe(true);
  return payload;
}

describe('table.create', () => {
  it('adds an empty table, a table view and a tab in one patch set', () => {
    const { store, bus, uuid } = makeBus();
    const payload = createTable(bus, uuid);

    const state = store.getState();
    expect(state.tables[payload.table.id]).toEqual({ table: payload.table, rows: [] });
    expect(state.views[payload.view.id]).toEqual(payload.view);
    expect(state.layout).toEqual({
      type: 'pane',
      viewIds: [payload.view.id],
      activeViewId: payload.view.id,
    });
    expect(state.ui.activeTableId).toBe(payload.table.id);
    expect(state.ui.activeViewId).toBe(payload.view.id);
    expect(payload.table.file).toBe(`tables/${payload.table.id}.jsonl`);
    expect(payload.table.rowCount).toBe(0);
    expect(payload.table.columns[0]).toMatchObject({ type: 'text', required: true });
    expect(payload.table.primaryKey).toBe(payload.table.columns[0]?.id);
    expect(payload.view.tableView?.columnOrder).toEqual([payload.table.columns[0]?.id]);
    expect(state.workspace?.updatedAt).toBe(NOW.toISOString());
  });

  it('rejects a duplicate table id without changing state', () => {
    const { store, bus, uuid } = makeBus();
    const payload = createTable(bus, uuid);
    const before = store.getState();

    const outcome = bus.dispatch('table.create', payload);
    expect(outcome.ok).toBe(false);
    expect(store.getState().tables).toBe(before.tables);
    expect(store.getState().views).toBe(before.views);
  });

  it('rejects a view that does not reference its table', () => {
    const { store, bus, uuid } = makeBus();
    const payload = createNewTablePayload({ name: 'Sensors', now: NOW, uuid });
    const broken = {
      ...payload,
      view: { ...payload.view, refId: 'tbl_other' },
    };

    const outcome = bus.dispatch('table.create', broken);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('E_VALIDATION');
    }
    expect(store.getState().tables).toEqual({});
  });
});

describe('table.delete', () => {
  function seedCascade() {
    const { store, bus, uuid } = makeBus();
    const first = createTable(bus, uuid, 'First');
    const second = createTable(bus, uuid, 'Second');

    const chart: ChartSpec = {
      id: 'cht_1',
      title: 'Chart',
      kind: 'line',
      tableId: first.table.id,
      mapping: { layout: 'wide', xColumnId: first.table.columns[0]?.id ?? '', yColumnIds: [] },
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
        numberDigits: 1,
        sampling: { enabled: true, threshold: 5000, target: 2000 },
      },
      version: 1,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    const chartView: ViewDef = { id: 'viw_chart', kind: 'chart', refId: chart.id, title: 'Chart' };
    const state = store.getState();
    const secondView = Object.values(state.views).find(
      (view) => view.kind === 'table' && view.refId === second.table.id,
    );
    if (secondView === undefined) {
      throw new Error('missing second view');
    }
    const chartTab = Object.values(state.views).find(
      (view) => view.kind === 'table' && view.refId === first.table.id,
    );
    if (chartTab === undefined) {
      throw new Error('missing first view');
    }
    store.setState({
      charts: { [chart.id]: chart },
      views: { ...state.views, [chartView.id]: chartView },
      layout: {
        type: 'pane',
        viewIds: [chartTab.id, chartView.id, secondView.id],
        activeViewId: chartView.id,
      },
      ui: { ...state.ui, activeTableId: first.table.id, activeViewId: chartView.id },
    });
    return { store, bus, first, second, chartView, secondView };
  }

  it('cascades charts, views and layout references and falls back to a remaining tab', () => {
    const { store, bus, first, second, chartView, secondView } = seedCascade();

    const outcome = bus.dispatch('table.delete', { tableId: first.table.id });
    expect(outcome.ok).toBe(true);

    const state = store.getState();
    expect(Object.keys(state.tables)).toEqual([second.table.id]);
    expect(state.charts).toEqual({});
    expect(Object.keys(state.views)).toEqual([secondView.id]);
    expect(state.layout).toEqual({
      type: 'pane',
      viewIds: [secondView.id],
      activeViewId: secondView.id,
    });
    expect(state.ui.activeTableId).toBe(second.table.id);
    expect(state.ui.activeViewId).toBe(secondView.id);
    expect(state.views[chartView.id]).toBeUndefined();
  });

  it('rejects an unknown table and leaves the document untouched', () => {
    const { store, bus } = makeBus();
    const before = store.getState();
    const outcome = bus.dispatch('table.delete', { tableId: 'tbl_missing' });
    expect(outcome.ok).toBe(false);
    expect(store.getState().tables).toBe(before.tables);
  });
});

describe('table.meta.update', () => {
  it('renames the table and every table view title', () => {
    const { store, bus, uuid } = makeBus();
    const payload = createTable(bus, uuid);

    const outcome = bus.dispatch('table.meta.update', {
      tableId: payload.table.id,
      name: '  Renamed  ',
    });
    expect(outcome.ok).toBe(true);
    expect(store.getState().tables[payload.table.id]?.table.name).toBe('Renamed');
    expect(store.getState().views[payload.view.id]?.title).toBe('Renamed');
    expect(store.getState().tables[payload.table.id]?.table.updatedAt).toBe(NOW.toISOString());
  });

  it('rejects an empty name', () => {
    const { store, bus, uuid } = makeBus();
    const payload = createTable(bus, uuid);
    const outcome = bus.dispatch('table.meta.update', { tableId: payload.table.id, name: '   ' });
    expect(outcome.ok).toBe(false);
    expect(store.getState().tables[payload.table.id]?.table.name).toBe('Sensors');
  });
});
