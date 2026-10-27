import type {
  AppError,
  ChartSpec,
  LayoutNode,
  TableStyle,
  ViewDef,
  WorkspaceSettings,
} from '@curve/domain';
import type { DirtyTableEntry, TableData } from '@curve/table-engine';

import type { CellIssue } from '../validation/cell-issue';
import type { StoreApi } from 'zustand/vanilla';

export type SavePhase = 'idle' | 'saving' | 'saved' | 'error';

/** Status bar state for the T2.2 save queue (SPEC §13.3). */
export interface SaveState {
  status: SavePhase;
  /** Tables waiting to be written, including the one currently in flight. */
  pending: number;
  error: AppError | null;
}

/** The open workspace's immutable identity, settings and open-time warnings. */
export interface WorkspaceInfo {
  formatVersion: 1;
  id: string;
  name: string;
  /** Absolute workspace root as supplied to `workspace.open`. */
  root: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  settings: WorkspaceSettings;
  /** Store open warnings plus non-blocking table decode warnings. */
  warnings: string[];
}

/** Table data keyed by table id. Rows are ordinary arrays, never Maps. */
export type TableMap = Record<string, TableData>;

/** View and layout state loaded from the manifest. */
export interface ViewsSlice {
  views: Record<string, ViewDef>;
  charts: Record<string, ChartSpec>;
  tableStyles: Record<string, TableStyle>;
  layout: LayoutNode;
}

export interface UiState {
  activeTableId: string | null;
  activeViewId: string | null;
  /** UI-only path of the focused pane (`root`, `root.0`, …); not persisted. */
  activePanePath: string | null;
  /** The single error surface consumed by the UI (SPEC §13.1). */
  error: AppError | null;
  /** Snapshot of the dirty-table tracker, in first-mark order (ADR-023). */
  dirtyTables: DirtyTableEntry[];
  /** Save queue status consumed by the status bar. */
  save: SaveState;
  /** The cell validation issue currently shown in the editor/status bar. */
  editIssue: CellIssue | null;
}

export interface AppActions {
  setActiveTable(tableId: string | null): void;
  setActiveView(viewId: string | null): void;
  /** Focuses a pane without changing the document (empty panes use this). */
  focusPane(path: string): void;
  setError(error: AppError): void;
  clearError(): void;
  markDirty(tableId: string): void;
  clearDirty(tableId: string): void;
  clearAllDirty(): void;
  setSaveState(save: SaveState): void;
  setEditIssue(issue: CellIssue | null): void;
}

/**
 * The complete app-core state.
 *
 * Document state (`workspace`, `tables`, `views`, `charts`, `tableStyles`,
 * `layout`) only changes through the command bus or the `workspace.open` use
 * case. `ui` holds selection/error/dirty bookkeeping; `actions` is the stable
 * action surface exposed to the renderer.
 */
export interface AppState extends ViewsSlice {
  workspace: WorkspaceInfo | null;
  tables: TableMap;
  ui: UiState;
  actions: AppActions;
}

/** Zustand's vanilla store API; no React binding enters this package. */
export type AppStore = StoreApi<AppState>;
