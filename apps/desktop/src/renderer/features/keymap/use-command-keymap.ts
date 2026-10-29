import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useRendererCore } from '../../app-core/use-app-core';
import { useTheme } from '../../theme/ThemeProvider';

import { createCommandContext } from './command-context';
import { createAppCommands } from './commands';
import { createKeymap } from './keymap';
import { buildPaletteItems } from './palette-model';
import {
  readRecentCommandIds,
  updateRecentCommandIds,
  writeRecentCommandIds,
} from './recent-commands';

import type { ShellCommandState } from './command-context';
import type { CommandHandlers } from './commands';
import type { PaletteCommandItem } from './palette-model';

export interface CommandKeymapOptions {
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  onToggleSidebar(): void;
  onToggleInspector(): void;
  onOpenHelp(): void;
  onOpenSettings(): void;
}

export interface CommandKeymapController {
  paletteOpen: boolean;
  paletteItems: readonly PaletteCommandItem[];
  openPalette(): void;
  closePalette(): void;
  runCommand(commandId: string): void;
}

function browserStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Wires the command catalog to app-core/shell and owns the global keydown
 * listener + palette state (T5.4, ADR-049).
 *
 * The hook deliberately does **not** subscribe to the document store: AppShell
 * must stay render-stable while a 100k chart is switched (the T4.6 memory gate
 * is sensitive to extra whole-shell renders). Commands read fresh state when
 * dispatched, and the palette snapshots availability when it opens; `runCommand`
 * re-checks the same rule before executing.
 */
export function useCommandKeymap(options: CommandKeymapOptions): CommandKeymapController {
  const { core } = useRendererCore();
  const { mode: themeMode, setMode } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteItems, setPaletteItems] = useState<readonly PaletteCommandItem[]>([]);

  const optionsRef = useRef(options);
  const shellStateRef = useRef<ShellCommandState>({
    sidebarOpen: options.sidebarOpen,
    inspectorOpen: options.inspectorOpen,
    themeMode,
  });
  const recentIdsRef = useRef<string[]>([]);
  const openPaletteRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    optionsRef.current = options;
    shellStateRef.current = {
      sidebarOpen: options.sidebarOpen,
      inspectorOpen: options.inspectorOpen,
      themeMode,
    };
  }, [options, themeMode]);

  const handlers = useMemo<CommandHandlers>(
    () => ({
      openPalette: () => {
        openPaletteRef.current();
      },
      saveWorkspace: () => {
        void core.actions.flushSaves();
      },
      undo: () => {
        void core.actions.undo();
      },
      redo: () => {
        void core.actions.redo();
      },
      closeView: (viewId) => {
        void core.actions.closeView(viewId);
      },
      splitPane: (direction) => {
        void core.actions.splitPane(direction);
      },
      closePane: () => {
        void core.actions.closePane();
      },
      moveViewToNextPane: (viewId) => {
        void core.actions.moveViewToNextPane(viewId);
      },
      duplicateView: (viewId) => {
        void core.actions.duplicateView(viewId);
      },
      duplicateChart: (chartId) => {
        void core.actions.duplicateChart(chartId);
      },
      toggleSidebar: () => {
        optionsRef.current.onToggleSidebar();
      },
      toggleInspector: () => {
        optionsRef.current.onToggleInspector();
      },
      openHelp: () => {
        optionsRef.current.onOpenHelp();
      },
      openSettings: () => {
        optionsRef.current.onOpenSettings();
      },
      setTheme: (mode) => {
        setMode(mode);
      },
    }),
    [core, setMode],
  );

  const commands = useMemo(() => createAppCommands(handlers), [handlers]);
  const keymap = useMemo(() => createKeymap(commands), [commands]);

  const openPalette = useCallback(() => {
    const recentIds = readRecentCommandIds(browserStorage());
    recentIdsRef.current = recentIds;
    const context = createCommandContext(core.store.getState(), shellStateRef.current);
    setPaletteItems(buildPaletteItems(commands, context, recentIds));
    setPaletteOpen(true);
  }, [commands, core]);

  useEffect(() => {
    openPaletteRef.current = openPalette;
  }, [openPalette]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const context = createCommandContext(core.store.getState(), shellStateRef.current);
      keymap.handleKeyDown(event, context);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [core, keymap]);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  const runCommand = useCallback(
    (commandId: string) => {
      const command = commands.find((candidate) => candidate.id === commandId);
      if (command === undefined) {
        return;
      }
      const context = createCommandContext(core.store.getState(), shellStateRef.current);
      const availability = command.isEnabled(context);
      if (!availability.enabled) {
        return;
      }
      command.run(context);
      const next = updateRecentCommandIds(recentIdsRef.current, commandId);
      recentIdsRef.current = next;
      writeRecentCommandIds(browserStorage(), next);
      setPaletteOpen(false);
    },
    [commands, core],
  );

  return useMemo(
    () => ({ paletteOpen, paletteItems, openPalette, closePalette, runCommand }),
    [paletteOpen, paletteItems, openPalette, closePalette, runCommand],
  );
}
