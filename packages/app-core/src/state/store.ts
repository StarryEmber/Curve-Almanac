import { createStore } from 'zustand/vanilla';

import type { LayoutNode } from '@curve/domain';
import { DirtyTableTracker } from '@curve/table-engine';

import { findPaneByPath, panePathForView } from '../commands/layout';

import type { AppActions, AppState, AppStore, HistoryState, SaveState, UiState } from './types';

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

export function createIdleSaveState(): SaveState {
  return { status: 'idle', pending: 0, error: null };
}

export function createEmptyHistoryState(): HistoryState {
  return {
    canUndo: false,
    canRedo: false,
    undoAction: null,
    redoAction: null,
    undoDepth: 0,
    redoDepth: 0,
  };
}

function createEmptyLayout(): LayoutNode {
  return { type: 'pane', viewIds: [], activeViewId: null };
}

function createInitialUi(): UiState {
  return {
    activeTableId: null,
    activeViewId: null,
    activePanePath: null,
    error: null,
    dirtyTables: [],
    save: createIdleSaveState(),
    history: createEmptyHistoryState(),
    editIssue: null,
  };
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
          setUi({ activeViewId: null, activePanePath: null });
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
        setUi({
          activeViewId: viewId,
          activeTableId,
          activePanePath: panePathForView(get().layout, viewId),
        });
      },
      focusPane(path: string): void {
        const pane = findPaneByPath(get().layout, path);
        if (pane === null) {
          return;
        }
        const activeViewId = pane.activeViewId ?? pane.viewIds[0] ?? null;
        if (get().ui.activePanePath === path && get().ui.activeViewId === activeViewId) {
          return;
        }
        if (activeViewId === null) {
          setUi({ activePanePath: path, activeViewId: null });
          return;
        }
        actions.setActiveView(activeViewId);
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
      setSaveState(save): void {
        setUi({ save });
      },
      setHistoryState(history): void {
        const current = get().ui.history;
        if (
          current.canUndo === history.canUndo &&
          current.canRedo === history.canRedo &&
          current.undoAction === history.undoAction &&
          current.redoAction === history.redoAction &&
          current.undoDepth === history.undoDepth &&
          current.redoDepth === history.redoDepth
        ) {
          return;
        }
        setUi({ history });
      },
      setEditIssue(issue): void {
        if (get().ui.editIssue !== issue) {
          setUi({ editIssue: issue });
        }
      },
    };

    return { ...initial, actions };
  });
}
