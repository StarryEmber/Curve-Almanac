import { describe, expect, it } from 'vitest';

import { createTableStyle, DEFAULT_TABLE_STYLE_ID } from '@curve/domain';
import type { ConditionalRule, TableStyle, ViewDef } from '@curve/domain';
import { createEmptyManifest } from '@curve/persistence';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import {
  createStyleApplyCommand,
  createStyleCreateCommand,
  createStyleDeleteCommand,
  createStyleUpdateCommand,
} from './styles';

import type { AppLogger } from '../logging';
import type { AppState } from '../state/types';

const NOW = new Date('2026-10-23T00:00:00.000Z');
const logger: AppLogger = { error: () => undefined, warn: () => undefined };

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

function rule(id = 'rule_1'): ConditionalRule {
  return {
    id,
    enabled: true,
    target: { kind: 'row' },
    when: { kind: 'compare', columnId: 'col_a', op: 'gt', value: 30 },
    style: { background: '#fde2e2', bold: true, icon: 'warning' },
  };
}

function styleWithRules(rules: ConditionalRule[] = []): TableStyle {
  return createTableStyle({ id: 'sty_test', name: 'Test', conditionalRules: rules });
}

function tableView(styleId: string): ViewDef {
  return {
    id: 'viw_test',
    kind: 'table',
    refId: 'tbl_test',
    title: 'Test',
    tableView: {
      tableId: 'tbl_test',
      styleId,
      columnOrder: [],
      widths: {},
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: 0,
    },
  };
}

function setup(initial: TableStyle = styleWithRules()) {
  const store = createAppStore({
    initialState: {
      workspace: workspaceState(),
      tableStyles: { [initial.id]: initial },
      views: { viw_test: tableView('builtin.report-light') },
    },
  });
  const bus = createCommandBus(store, { logger });
  bus.register(createStyleCreateCommand({ now: () => new Date('2026-10-24T00:00:00.000Z') }));
  bus.register(createStyleUpdateCommand({ now: () => new Date('2026-10-24T00:00:00.000Z') }));
  bus.register(createStyleDeleteCommand({ now: () => new Date('2026-10-24T00:00:00.000Z') }));
  bus.register(createStyleApplyCommand({ now: () => new Date('2026-10-24T00:00:00.000Z') }));
  return { store, bus };
}

describe('style.create', () => {
  it('creates a user style and applies it to a table view in one command', () => {
    const { store, bus } = setup();
    const before = store.getState().workspace?.updatedAt;
    const created = createTableStyle({
      id: 'sty_created',
      name: 'Created',
      conditionalRules: [rule('rule_1')],
    });

    const outcome = bus.dispatch('style.create', {
      style: created,
      viewId: 'viw_test',
    });
    expect(outcome.ok).toBe(true);
    const state = store.getState();
    expect(state.tableStyles['sty_created']?.name).toBe('Created');
    expect(state.views['viw_test']?.tableView?.styleId).toBe('sty_created');
    expect(state.workspace?.updatedAt).not.toBe(before);
  });

  it('rejects builtins, duplicate ids and non-table views', () => {
    const { store, bus } = setup();
    const before = store.getState();

    const builtin = bus.dispatch('style.create', {
      style: { ...createTableStyle({ name: 'Copy' }), id: 'builtin.dark', builtin: true },
      viewId: 'viw_test',
    });
    expect(builtin.ok).toBe(false);

    const duplicate = bus.dispatch('style.create', {
      style: createTableStyle({ id: 'sty_test', name: 'Duplicate' }),
      viewId: 'viw_test',
    });
    expect(duplicate.ok).toBe(false);

    const missingView = bus.dispatch('style.create', {
      style: createTableStyle({ id: 'sty_missing_view', name: 'Missing view' }),
      viewId: 'viw_missing',
    });
    expect(missingView.ok).toBe(false);

    expect(store.getState().tableStyles).toBe(before.tableStyles);
    expect(store.getState().views).toBe(before.views);
  });

  it('can create a style without applying it', () => {
    const { store, bus } = setup();
    const created = createTableStyle({ id: 'sty_unused', name: 'Unused' });
    const outcome = bus.dispatch('style.create', { style: created });
    expect(outcome.ok).toBe(true);
    expect(store.getState().tableStyles['sty_unused']).toBeDefined();
    expect(store.getState().views['viw_test']?.tableView?.styleId).toBe('builtin.report-light');
  });
});

describe('style.update', () => {
  it('replaces the persisted style and bumps the workspace timestamp', () => {
    const { store, bus } = setup();
    const before = store.getState().workspace?.updatedAt;
    const next: TableStyle = {
      ...styleWithRules([rule('rule_1')]),
      name: 'Updated',
      conditionalRules: [rule('rule_1'), rule('rule_2')],
    };

    const outcome = bus.dispatch('style.update', { style: next });
    expect(outcome.ok).toBe(true);
    const state = store.getState();
    expect(state.tableStyles['sty_test']?.name).toBe('Updated');
    expect(state.tableStyles['sty_test']?.conditionalRules).toHaveLength(2);
    expect(state.workspace?.updatedAt).not.toBe(before);
  });

  it('rejects builtin ids, missing styles and invalid definitions', () => {
    const { store, bus } = setup();
    const before = store.getState().tableStyles;

    const builtin = bus.dispatch('style.update', {
      style: { ...styleWithRules(), id: 'builtin.dark', builtin: true },
    });
    expect(builtin.ok).toBe(false);
    if (!builtin.ok) {
      expect(builtin.error.code).toBe('E_VALIDATION');
    }

    const missing = bus.dispatch('style.update', {
      style: { ...styleWithRules(), id: 'sty_missing' },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe('E_VALIDATION');
    }

    const invalid = bus.dispatch('style.update', {
      style: { ...styleWithRules(), tokens: { ...styleWithRules().tokens, fontSize: 99 } },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe('E_VALIDATION');
    }

    expect(store.getState().tableStyles).toBe(before);
  });

  it('rejects duplicate conditional rule ids and missing payloads', () => {
    const { store, bus } = setup();
    const before = store.getState().tableStyles;

    const duplicate = bus.dispatch('style.update', {
      style: styleWithRules([rule('rule_1'), rule('rule_1')]),
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe('E_VALIDATION');
    }

    const missing = bus.dispatch('style.update', {});
    expect(missing.ok).toBe(false);
    expect(store.getState().tableStyles).toBe(before);
  });
});

function tableViewById(id: string, styleId: string): ViewDef {
  return {
    id,
    kind: 'table',
    refId: 'tbl_test',
    title: id,
    tableView: {
      tableId: 'tbl_test',
      styleId,
      columnOrder: [],
      widths: {},
      hiddenColumnIds: [],
      sort: [],
      frozenColumnCount: 0,
    },
  };
}

function workspaceWithDefault(styleId: string): NonNullable<AppState['workspace']> {
  const workspace = workspaceState();
  return { ...workspace, settings: { ...workspace.settings, defaultTableStyleId: styleId } };
}

describe('style.delete', () => {
  it('removes the style, remaps every referencing view and resets a deleted default', () => {
    const store = createAppStore({
      initialState: {
        workspace: workspaceWithDefault('sty_test'),
        tableStyles: { sty_test: styleWithRules() },
        views: {
          viw_a: tableViewById('viw_a', 'sty_test'),
          viw_b: tableViewById('viw_b', 'sty_test'),
          viw_c: tableViewById('viw_c', 'builtin.dark'),
        },
      },
    });
    const bus = createCommandBus(store, { logger });
    bus.register(createStyleDeleteCommand({ now: () => new Date('2026-10-24T00:00:00.000Z') }));
    const before = store.getState().workspace?.updatedAt;

    const outcome = bus.dispatch('style.delete', { styleId: 'sty_test' });
    expect(outcome.ok).toBe(true);

    const state = store.getState();
    expect(state.tableStyles['sty_test']).toBeUndefined();
    expect(state.views['viw_a']?.tableView?.styleId).toBe(DEFAULT_TABLE_STYLE_ID);
    expect(state.views['viw_b']?.tableView?.styleId).toBe(DEFAULT_TABLE_STYLE_ID);
    expect(state.views['viw_c']?.tableView?.styleId).toBe('builtin.dark');
    expect(state.workspace?.settings.defaultTableStyleId).toBe(DEFAULT_TABLE_STYLE_ID);
    expect(state.workspace?.updatedAt).not.toBe(before);
  });

  it('falls back to a surviving workspace default user style', () => {
    const keep = createTableStyle({ id: 'sty_keep', name: 'Keep' });
    const store = createAppStore({
      initialState: {
        workspace: workspaceWithDefault('sty_keep'),
        tableStyles: { sty_test: styleWithRules(), sty_keep: keep },
        views: { viw_a: tableViewById('viw_a', 'sty_test') },
      },
    });
    const bus = createCommandBus(store, { logger });
    bus.register(createStyleDeleteCommand({ now: () => new Date('2026-10-24T00:00:00.000Z') }));

    expect(bus.dispatch('style.delete', { styleId: 'sty_test' }).ok).toBe(true);

    const state = store.getState();
    expect(state.views['viw_a']?.tableView?.styleId).toBe('sty_keep');
    expect(state.workspace?.settings.defaultTableStyleId).toBe('sty_keep');
    expect(state.tableStyles['sty_keep']).toBeDefined();
  });

  it('rejects builtins, missing styles and malformed payloads without changing state', () => {
    const { store, bus } = setup();
    const before = store.getState();

    for (const payload of [
      { styleId: 'builtin.dark' },
      { styleId: 'sty_missing' },
      { styleId: 'not-a-style' },
      {},
    ]) {
      const outcome = bus.dispatch('style.delete', payload);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.code).toBe('E_VALIDATION');
      }
    }

    expect(store.getState().tableStyles).toBe(before.tableStyles);
    expect(store.getState().views).toBe(before.views);
  });
});

describe('style.apply', () => {
  it('applies a style to one view and to the workspace default', () => {
    const { store, bus } = setup();
    const before = store.getState().workspace?.updatedAt;

    const viewOutcome = bus.dispatch('style.apply', {
      styleId: 'sty_test',
      target: { kind: 'view', viewId: 'viw_test' },
    });
    expect(viewOutcome.ok).toBe(true);
    expect(store.getState().views['viw_test']?.tableView?.styleId).toBe('sty_test');

    const defaultOutcome = bus.dispatch('style.apply', {
      styleId: 'builtin.dark',
      target: { kind: 'default' },
    });
    expect(defaultOutcome.ok).toBe(true);
    expect(store.getState().workspace?.settings.defaultTableStyleId).toBe('builtin.dark');
    expect(store.getState().workspace?.updatedAt).not.toBe(before);
    expect(store.getState().tableStyles['sty_test']).toBeDefined();
  });

  it('rejects unknown styles, missing or non-table views and malformed targets', () => {
    const store = createAppStore({
      initialState: {
        workspace: workspaceState(),
        tableStyles: { sty_test: styleWithRules() },
        views: {
          viw_test: tableViewById('viw_test', 'builtin.report-light'),
          viw_chart: { id: 'viw_chart', kind: 'chart', refId: 'cht_1', title: 'Chart' },
        },
      },
    });
    const bus = createCommandBus(store, { logger });
    bus.register(createStyleApplyCommand({ now: () => new Date('2026-10-24T00:00:00.000Z') }));
    const before = store.getState();

    const payloads: unknown[] = [
      { styleId: 'sty_missing', target: { kind: 'view', viewId: 'viw_test' } },
      { styleId: 'builtin.missing', target: { kind: 'default' } },
      { styleId: 'sty_test', target: { kind: 'view', viewId: 'viw_missing' } },
      { styleId: 'sty_test', target: { kind: 'view', viewId: 'viw_chart' } },
      { styleId: 'sty_test', target: { kind: 'chart' } },
      { styleId: 'sty_test' },
      {},
    ];
    for (const payload of payloads) {
      const outcome = bus.dispatch('style.apply', payload);
      expect(outcome.ok).toBe(false);
    }

    expect(store.getState().views).toBe(before.views);
    expect(store.getState().workspace).toBe(before.workspace);
  });
});
