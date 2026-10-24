import { describe, expect, it } from 'vitest';

import { createTableStyle } from '@curve/domain';
import type { ConditionalRule, TableStyle } from '@curve/domain';
import { createEmptyManifest } from '@curve/persistence';

import { createAppStore } from '../state/store';

import { createCommandBus } from './bus';
import { createStyleUpdateCommand } from './styles';

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

function setup(initial: TableStyle = styleWithRules()) {
  const store = createAppStore({
    initialState: {
      workspace: workspaceState(),
      tableStyles: { [initial.id]: initial },
    },
  });
  const bus = createCommandBus(store, { logger });
  bus.register(createStyleUpdateCommand({ now: () => new Date('2026-10-24T00:00:00.000Z') }));
  return { store, bus };
}

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
