import { countPanes, findPaneEntry } from '@curve/app-core';
import type { AppState } from '@curve/app-core';
import type { ThemeMode } from '@curve/ui';

/** Where a command can be used; not which component owns the key event. */
export type CommandScope = 'global' | 'workspace' | 'grid' | 'chart';

/** Machine-readable reasons shown by the palette and used by tests. */
export type CommandDisabledReason =
  | 'no-workspace'
  | 'no-view'
  | 'no-table-view'
  | 'no-chart-view'
  | 'no-history'
  | 'no-redo'
  | 'no-pane'
  | 'max-panes'
  | 'single-pane'
  | 'pane-not-empty'
  | 'no-second-pane'
  | 'theme-active';

export type CommandAvailability =
  { readonly enabled: true } | { readonly enabled: false; readonly reason: CommandDisabledReason };

/** Shell-owned state that is not part of the app-core document store. */
export interface ShellCommandState {
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  themeMode: ThemeMode;
}

/**
 * Everything `isEnabled`/`run` may look at (T5.4, ADR-049).
 *
 * Only stable primitives/id are copied out of the store so React consumers do
 * not re-render on every unrelated document change. `isEnabled` stays pure and
 * is shared by the keymap, the command palette, the Edit menu and the help
 * dialog — business rules must not be duplicated in components.
 */
export interface CommandContext {
  workspaceOpen: boolean;
  activeViewId: string | null;
  activeViewKind: 'table' | 'chart' | null;
  /** Chart id for a chart view, table id for a table view. */
  activeViewRefId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  paneCount: number;
  /** Number of tabs in the focused pane; null when no pane path is focused. */
  focusedPaneViewCount: number | null;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  themeMode: ThemeMode;
}

export function createCommandContext(state: AppState, shell: ShellCommandState): CommandContext {
  const activeView =
    state.ui.activeViewId === null ? undefined : state.views[state.ui.activeViewId];
  const focusedPane =
    state.ui.activePanePath === null ? null : findPaneEntry(state.layout, state.ui.activePanePath);

  return {
    workspaceOpen: state.workspace !== null,
    activeViewId: state.ui.activeViewId,
    activeViewKind: activeView?.kind ?? null,
    activeViewRefId: activeView?.refId ?? null,
    canUndo: state.ui.history.canUndo,
    canRedo: state.ui.history.canRedo,
    paneCount: countPanes(state.layout),
    focusedPaneViewCount: focusedPane?.pane.viewIds.length ?? null,
    sidebarOpen: shell.sidebarOpen,
    inspectorOpen: shell.inspectorOpen,
    themeMode: shell.themeMode,
  };
}

/** Whether a command with this scope can be active in the given context. */
export function isScopeActive(scope: CommandScope, context: CommandContext): boolean {
  switch (scope) {
    case 'global':
      return true;
    case 'workspace':
      return context.workspaceOpen;
    case 'grid':
      return context.activeViewKind === 'table';
    case 'chart':
      return context.activeViewKind === 'chart';
  }
}

/**
 * True when two commands could ever be active at the same time.
 *
 * `global` overlaps everything, `workspace` overlaps grid/chart (both imply an
 * open workspace), while grid and chart are mutually exclusive.
 */
export function scopesOverlap(
  first: readonly CommandScope[],
  second: readonly CommandScope[],
): boolean {
  if (first.includes('global') || second.includes('global')) {
    return true;
  }
  if (first.includes('workspace') || second.includes('workspace')) {
    return true;
  }
  return (
    (first.includes('grid') && second.includes('grid')) ||
    (first.includes('chart') && second.includes('chart'))
  );
}
