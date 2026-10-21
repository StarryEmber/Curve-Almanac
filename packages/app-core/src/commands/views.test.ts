import { describe, expect, it } from 'vitest';

import { createEmptyManifest } from '@curve/persistence';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import { createNewTablePayload, createOpenTableView, createTableCreateCommand } from './tables';
import {
  createViewCreateCommand,
  createViewDeleteCommand,
  createViewLayoutCommand,
  createViewUpdateCommand,
} from './views';

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

function setup() {
  const store = createAppStore({ initialState: { workspace: workspaceState() } });
  const bus = createCommandBus(store, { logger });
  let next = 0;
  const uuid = (): string => {
    next += 1;
    return `u${String(next)}`;
  };
  bus.register(createTableCreateCommand({ now: () => NOW, uuid }));
  bus.register(createViewCreateCommand({ now: () => NOW }));
  bus.register(createViewDeleteCommand({ now: () => NOW }));
  bus.register(createViewUpdateCommand({ now: () => NOW }));
  bus.register(createViewLayoutCommand({ now: () => NOW }));

  const payload = createNewTablePayload({ name: 'Sensors', now: NOW, uuid });
  const created = bus.dispatch('table.create', payload);
  expect(created.ok).toBe(true);
  return { store, bus, uuid, payload };
}

describe('view.create', () => {
  it('adds a second view for the same table and activates it', () => {
    const { store, bus, payload, uuid } = setup();
    const view = createOpenTableView({ table: payload.table, now: NOW, uuid });

    const outcome = bus.dispatch('view.create', { view });
    expect(outcome.ok).toBe(true);
    const state = store.getState();
    expect(Object.keys(state.views)).toEqual([payload.view.id, view.id]);
    expect(state.layout).toEqual({
      type: 'pane',
      viewIds: [payload.view.id, view.id],
      activeViewId: view.id,
    });
    expect(state.ui.activeViewId).toBe(view.id);
  });

  it('rejects a duplicate view id and a missing chart reference', () => {
    const { store, bus, payload } = setup();
    const before = store.getState();

    expect(bus.dispatch('view.create', { view: payload.view }).ok).toBe(false);
    expect(
      bus.dispatch('view.create', {
        view: { id: 'viw_missing', kind: 'chart', refId: 'cht_missing', title: 'Missing' },
      }).ok,
    ).toBe(false);
    expect(store.getState().views).toBe(before.views);
  });
});

describe('view.update', () => {
  it('persists widths, frozen count and title', () => {
    const { store, bus, payload } = setup();
    const columnId = payload.table.columns[0]?.id ?? '';

    const outcome = bus.dispatch('view.update', {
      viewId: payload.view.id,
      patch: {
        title: 'Renamed view',
        widths: { [columnId]: 240 },
        frozenColumnCount: 0,
      },
    });
    expect(outcome.ok).toBe(true);
    const view = store.getState().views[payload.view.id];
    expect(view?.title).toBe('Renamed view');
    expect(view?.tableView?.widths).toEqual({ [columnId]: 240 });
    expect(view?.tableView?.frozenColumnCount).toBe(0);
  });

  it('rejects unknown width columns, invalid frozen counts and unknown patch keys', () => {
    const { store, bus, payload } = setup();
    const before = store.getState().views;

    expect(
      bus.dispatch('view.update', {
        viewId: payload.view.id,
        patch: { widths: { col_missing: 200 } },
      }).ok,
    ).toBe(false);
    expect(
      bus.dispatch('view.update', {
        viewId: payload.view.id,
        patch: { frozenColumnCount: 4 },
      }).ok,
    ).toBe(false);
    expect(
      bus.dispatch('view.update', {
        viewId: payload.view.id,
        patch: { nope: true },
      }).ok,
    ).toBe(false);
    expect(store.getState().views).toBe(before);
  });
});

describe('view.delete and view.layout', () => {
  it('closes the active tab and falls back to the previous one', () => {
    const { store, bus, payload, uuid } = setup();
    const second = createOpenTableView({ table: payload.table, now: NOW, uuid });
    expect(bus.dispatch('view.create', { view: second }).ok).toBe(true);

    const outcome = bus.dispatch('view.delete', { viewId: second.id });
    expect(outcome.ok).toBe(true);
    const state = store.getState();
    expect(Object.keys(state.views)).toEqual([payload.view.id]);
    expect(state.layout).toEqual({
      type: 'pane',
      viewIds: [payload.view.id],
      activeViewId: payload.view.id,
    });
    expect(state.ui.activeTableId).toBe(payload.table.id);
  });

  it('rejects a layout that references a missing view or repeats one', () => {
    const { store, bus, payload } = setup();
    const before = store.getState().layout;

    expect(
      bus.dispatch('view.layout', {
        layout: { type: 'pane', viewIds: ['viw_missing'], activeViewId: 'viw_missing' },
      }).ok,
    ).toBe(false);
    expect(
      bus.dispatch('view.layout', {
        layout: {
          type: 'pane',
          viewIds: [payload.view.id, payload.view.id],
          activeViewId: payload.view.id,
        },
      }).ok,
    ).toBe(false);
    expect(store.getState().layout).toBe(before);
  });

  it('activates a view through view.layout and updates the active table', () => {
    const { store, bus, payload, uuid } = setup();
    const second = createOpenTableView({ table: payload.table, now: NOW, uuid });
    expect(bus.dispatch('view.create', { view: second }).ok).toBe(true);

    const layout = {
      type: 'pane' as const,
      viewIds: [payload.view.id, second.id],
      activeViewId: payload.view.id,
    };
    const outcome = bus.dispatch('view.layout', { layout });
    expect(outcome.ok).toBe(true);
    expect(store.getState().layout).toEqual(layout);
    expect(store.getState().ui.activeViewId).toBe(payload.view.id);
    expect(store.getState().ui.activeTableId).toBe(payload.table.id);
  });
});
