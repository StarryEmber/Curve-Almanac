import { createStore } from 'zustand/vanilla';

import type { LayoutNode } from '@curve/domain';
import { DirtyTableTracker } from '@curve/table-engine';

import type { AppActions, AppState, AppStore, UiState } from './types';

export interface InitialAppState extends Partial<Omit<AppState, 'actions' | 'ui'>> {
  ui?: Partial<UiState>;
}

export interface CreateAppStoreOptions {
  /** Test/seed hook; `actions` is always supplied by the store. */
  initialState?: InitialAppState;
  /** Injected so dirty-table timestamps are deterministic in tests. */
  now?: () => number;
  dirtyTracker?: DirtyTableTracker;
}

function createEmptyLayout(): LayoutNode {
  return { type: 'pane', viewIds: [], activeViewId: null };
}

function createInitialUi(): UiState {
  return { activeTableId: null, activeViewId: null, error: null, dirtyTables: [] };
}

/**
 * Creates the vanilla app-core store.
 *
 * The table map stays a plain object (ADR-025); a single table change replaces
 * only the target row, so 10 万行 arrays are never deep-copied wholesale.
 */
export function createAppStore(options: CreateAppStoreOptions = {}): AppStore {
  const tracker =
    options.dirtyTracker ??
    new DirtyTableTracker(options.now === undefined ? {} : { now: options.now });

  const provided = options.initialState;
  const initial: Omit<AppState, 'actions'> = {
    workspace: null,
    tables: {},
    views: {},
    charts: {},
    tableStyles: {},
    layout: createEmptyLayout(),
    ...provided,
    ui: { ...createInitialUi(), ...provided?.ui },
  };

  return createStore<AppState>()((set, get) => {
    const setUi = (patch: Partial<UiState>): void => {
      set((state) => ({ ui: { ...state.ui, ...patch } }));
    };

    const actions: AppActions = {
      setActiveTable(tableId: string | null): void {
        if (tableId !== null && get().tables[tableId] === undefined) {
          return;
        }
        setUi({ activeTableId: tableId });
      },
      setActiveView(viewId: string | null): void {
        if (viewId === null) {
          setUi({ activeViewId: null });
          return;
        }
        const view = get().views[viewId];
        if (view === undefined) {
          return;
        }
        let activeTableId = get().ui.activeTableId;
        if (view.kind === 'table') {
          activeTableId = view.refId;
        } else {
          const chart = get().charts[view.refId];
          if (chart !== undefined) {
            activeTableId = chart.tableId;
          }
        }
        setUi({ activeViewId: viewId, activeTableId });
      },
      setError(error): void {
        setUi({ error });
      },
      clearError(): void {
        if (get().ui.error !== null) {
          setUi({ error: null });
        }
      },
      markDirty(tableId: string): void {
        if (get().tables[tableId] === undefined) {
          return;
        }
        tracker.mark(tableId);
        setUi({ dirtyTables: tracker.list() });
      },
      clearDirty(tableId: string): void {
        if (tracker.clear(tableId)) {
          setUi({ dirtyTables: tracker.list() });
        }
      },
      clearAllDirty(): void {
        tracker.clearAll();
        setUi({ dirtyTables: [] });
      },
    };

    return { ...initial, actions };
  });
}
