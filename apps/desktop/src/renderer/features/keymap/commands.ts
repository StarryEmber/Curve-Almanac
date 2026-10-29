/**
 * Application command catalog for T5.4 (ADR-049).
 *
 * A command is a UI intent over an existing action/shell callback — it never
 * bypasses the command bus or writes storage itself. `isEnabled` is shared by
 * keyboard dispatch, the palette and the help dialog, so availability rules
 * exist in exactly one place.
 */

import type { PaneDirection } from '@curve/app-core';
import { MAX_PANES } from '@curve/domain';
import type { ThemeMode } from '@curve/ui';

import type {
  CommandAvailability,
  CommandContext,
  CommandDisabledReason,
  CommandScope,
} from './command-context';
import type { KeymapCommand } from './keymap';
import type { MessageKey } from '../../i18n';

export interface CommandHandlers {
  openPalette(): void;
  saveWorkspace(): void;
  undo(): void;
  redo(): void;
  closeView(viewId: string): void;
  splitPane(direction: PaneDirection): void;
  closePane(): void;
  moveViewToNextPane(viewId: string): void;
  duplicateView(viewId: string): void;
  duplicateChart(chartId: string): void;
  toggleSidebar(): void;
  toggleInspector(): void;
  openHelp(): void;
  openSettings(): void;
  setTheme(mode: ThemeMode): void;
}

export interface AppCommandDefinition {
  id: string;
  labelKey: MessageKey;
  shortcuts: readonly string[];
  scopes: readonly CommandScope[];
  visibleInPalette: boolean;
  isEnabled(context: CommandContext): CommandAvailability;
  run(context: CommandContext, handlers: CommandHandlers): void;
}

export interface AppCommand extends KeymapCommand {
  labelKey: MessageKey;
  visibleInPalette: boolean;
}

const ENABLED: CommandAvailability = { enabled: true };

function disabled(reason: CommandDisabledReason): CommandAvailability {
  return { enabled: false, reason };
}

/** Commands that are reachable from the palette only (appearance/preferences). */
export const PALETTE_ONLY_COMMAND_IDS = [
  'theme.light',
  'theme.dark',
  'theme.system',
  'app.settings',
] as const;

function requireWorkspace(context: CommandContext): CommandAvailability | null {
  return context.workspaceOpen ? null : disabled('no-workspace');
}

function themeAvailability(context: CommandContext, mode: ThemeMode): CommandAvailability {
  return context.themeMode === mode ? disabled('theme-active') : ENABLED;
}

export const APP_COMMANDS: readonly AppCommandDefinition[] = [
  {
    id: 'palette.open',
    labelKey: 'command.palette.open',
    shortcuts: ['Ctrl/Cmd+K'],
    scopes: ['global'],
    visibleInPalette: false,
    isEnabled: (): CommandAvailability => ENABLED,
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.openPalette();
    },
  },
  {
    id: 'app.help',
    labelKey: 'command.app.help',
    shortcuts: ['F1'],
    scopes: ['global'],
    visibleInPalette: true,
    isEnabled: (): CommandAvailability => ENABLED,
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.openHelp();
    },
  },
  {
    id: 'app.settings',
    labelKey: 'settings.open',
    shortcuts: [],
    scopes: ['global'],
    visibleInPalette: true,
    isEnabled: (): CommandAvailability => ENABLED,
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.openSettings();
    },
  },
  {
    id: 'app.save',
    labelKey: 'command.app.save',
    shortcuts: ['Ctrl/Cmd+S'],
    scopes: ['workspace'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability =>
      requireWorkspace(context) ?? ENABLED,
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.saveWorkspace();
    },
  },
  {
    id: 'app.toggleSidebar',
    labelKey: 'command.app.toggleSidebar',
    shortcuts: ['Ctrl/Cmd+B'],
    scopes: ['global'],
    visibleInPalette: true,
    isEnabled: (): CommandAvailability => ENABLED,
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.toggleSidebar();
    },
  },
  {
    id: 'app.toggleInspector',
    labelKey: 'command.app.toggleInspector',
    shortcuts: ['Ctrl/Cmd+Alt+I'],
    scopes: ['global'],
    visibleInPalette: true,
    isEnabled: (): CommandAvailability => ENABLED,
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.toggleInspector();
    },
  },
  {
    id: 'history.undo',
    labelKey: 'command.history.undo',
    shortcuts: ['Ctrl/Cmd+Z'],
    scopes: ['workspace'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => {
      const missing = requireWorkspace(context);
      if (missing !== null) {
        return missing;
      }
      return context.canUndo ? ENABLED : disabled('no-history');
    },
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.undo();
    },
  },
  {
    id: 'history.redo',
    labelKey: 'command.history.redo',
    shortcuts: ['Ctrl/Cmd+Shift+Z', 'Ctrl/Cmd+Y'],
    scopes: ['workspace'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => {
      const missing = requireWorkspace(context);
      if (missing !== null) {
        return missing;
      }
      return context.canRedo ? ENABLED : disabled('no-redo');
    },
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.redo();
    },
  },
  {
    id: 'view.close',
    labelKey: 'command.view.close',
    shortcuts: ['Ctrl/Cmd+W'],
    scopes: ['workspace'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => {
      const missing = requireWorkspace(context);
      if (missing !== null) {
        return missing;
      }
      return context.activeViewId === null ? disabled('no-view') : ENABLED;
    },
    run: (context: CommandContext, handlers: CommandHandlers): void => {
      if (context.activeViewId !== null) {
        handlers.closeView(context.activeViewId);
      }
    },
  },
  {
    id: 'view.duplicate',
    labelKey: 'command.view.duplicate',
    shortcuts: ['Ctrl/Cmd+Shift+D'],
    scopes: ['grid'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => {
      const missing = requireWorkspace(context);
      if (missing !== null) {
        return missing;
      }
      return context.activeViewKind === 'table' ? ENABLED : disabled('no-table-view');
    },
    run: (context: CommandContext, handlers: CommandHandlers): void => {
      if (context.activeViewKind === 'table' && context.activeViewId !== null) {
        handlers.duplicateView(context.activeViewId);
      }
    },
  },
  {
    id: 'chart.duplicate',
    labelKey: 'command.chart.duplicate',
    shortcuts: ['Ctrl/Cmd+Shift+D'],
    scopes: ['chart'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => {
      const missing = requireWorkspace(context);
      if (missing !== null) {
        return missing;
      }
      return context.activeViewKind === 'chart' ? ENABLED : disabled('no-chart-view');
    },
    run: (context: CommandContext, handlers: CommandHandlers): void => {
      if (context.activeViewKind === 'chart' && context.activeViewRefId !== null) {
        handlers.duplicateChart(context.activeViewRefId);
      }
    },
  },
  {
    id: 'layout.splitHorizontal',
    labelKey: 'command.layout.splitHorizontal',
    shortcuts: ['Ctrl/Cmd+Alt+H'],
    scopes: ['workspace'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => {
      const missing = requireWorkspace(context);
      if (missing !== null) {
        return missing;
      }
      return context.paneCount >= MAX_PANES ? disabled('max-panes') : ENABLED;
    },
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.splitPane('horizontal');
    },
  },
  {
    id: 'layout.splitVertical',
    labelKey: 'command.layout.splitVertical',
    shortcuts: ['Ctrl/Cmd+Alt+V'],
    scopes: ['workspace'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => {
      const missing = requireWorkspace(context);
      if (missing !== null) {
        return missing;
      }
      return context.paneCount >= MAX_PANES ? disabled('max-panes') : ENABLED;
    },
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.splitPane('vertical');
    },
  },
  {
    id: 'layout.closePane',
    labelKey: 'command.layout.closePane',
    shortcuts: ['Ctrl/Cmd+Alt+W'],
    scopes: ['workspace'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => {
      const missing = requireWorkspace(context);
      if (missing !== null) {
        return missing;
      }
      if (context.paneCount <= 1) {
        return disabled('single-pane');
      }
      if (context.focusedPaneViewCount === null) {
        return disabled('no-pane');
      }
      return context.focusedPaneViewCount > 0 ? disabled('pane-not-empty') : ENABLED;
    },
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.closePane();
    },
  },
  {
    id: 'layout.moveViewToNextPane',
    labelKey: 'command.layout.moveViewToNextPane',
    shortcuts: ['Ctrl/Cmd+Alt+M'],
    scopes: ['workspace'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => {
      const missing = requireWorkspace(context);
      if (missing !== null) {
        return missing;
      }
      if (context.paneCount < 2) {
        return disabled('no-second-pane');
      }
      return context.activeViewId === null ? disabled('no-view') : ENABLED;
    },
    run: (context: CommandContext, handlers: CommandHandlers): void => {
      if (context.activeViewId !== null) {
        handlers.moveViewToNextPane(context.activeViewId);
      }
    },
  },
  {
    id: 'theme.light',
    labelKey: 'command.theme.light',
    shortcuts: [],
    scopes: ['global'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability =>
      themeAvailability(context, 'light'),
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.setTheme('light');
    },
  },
  {
    id: 'theme.dark',
    labelKey: 'command.theme.dark',
    shortcuts: [],
    scopes: ['global'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability => themeAvailability(context, 'dark'),
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.setTheme('dark');
    },
  },
  {
    id: 'theme.system',
    labelKey: 'command.theme.system',
    shortcuts: [],
    scopes: ['global'],
    visibleInPalette: true,
    isEnabled: (context: CommandContext): CommandAvailability =>
      themeAvailability(context, 'system'),
    run: (_context: CommandContext, handlers: CommandHandlers): void => {
      handlers.setTheme('system');
    },
  },
];

/** Binds the static catalog to the current shell/app-core action surface. */
export function createAppCommands(handlers: CommandHandlers): AppCommand[] {
  return APP_COMMANDS.map((definition) => ({
    id: definition.id,
    labelKey: definition.labelKey,
    shortcuts: definition.shortcuts,
    scopes: definition.scopes,
    visibleInPalette: definition.visibleInPalette,
    isEnabled: definition.isEnabled,
    run: (context: CommandContext) => {
      definition.run(context, handlers);
    },
  }));
}

export interface ShortcutHelpEntry {
  id: string;
  labelKey: MessageKey;
  shortcuts: readonly string[];
}

/** Commands with at least one binding, for the Help dialog's shortcut table. */
export function listShortcutCommands(): ShortcutHelpEntry[] {
  return APP_COMMANDS.filter((command) => command.shortcuts.length > 0).map((command) => ({
    id: command.id,
    labelKey: command.labelKey,
    shortcuts: command.shortcuts,
  }));
}

/** i18n key for a machine-readable disabled reason. */
export function disabledReasonKey(reason: CommandDisabledReason): MessageKey {
  switch (reason) {
    case 'no-workspace':
      return 'command.reason.noWorkspace';
    case 'no-view':
      return 'command.reason.noView';
    case 'no-table-view':
      return 'command.reason.noTableView';
    case 'no-chart-view':
      return 'command.reason.noChartView';
    case 'no-history':
      return 'command.reason.noHistory';
    case 'no-redo':
      return 'command.reason.noRedo';
    case 'no-pane':
      return 'command.reason.noPane';
    case 'max-panes':
      return 'command.reason.maxPanes';
    case 'single-pane':
      return 'command.reason.singlePane';
    case 'pane-not-empty':
      return 'command.reason.paneNotEmpty';
    case 'no-second-pane':
      return 'command.reason.noSecondPane';
    case 'theme-active':
      return 'command.reason.themeActive';
  }
}
