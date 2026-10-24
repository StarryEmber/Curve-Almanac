/**
 * Minimal undo/redo for cell edits and pastes (T2.2/T2.4, SPEC §13.2).
 *
 * The command bus already produces reversible Immer patches. This stack owns
 * the document history for cell edits, paste/import and workspace-scoped style
 * changes: one entry per commit, edits to the same cell within 800ms merge into
 * one entry, and a new command drops the redo branch. A paste/import/style
 * command is always one entry (never merged), even when it added rows or
 * columns. T5.2 replaces this with the full command history while consuming the
 * same `CommandResult` patches.
 */

import { applyPatches } from 'immer';

import type { CommandResult } from '../commands/types';
import type { AppStore } from '../state/types';
import type { Patch } from 'immer';

export const DEFAULT_MERGE_WINDOW_MS = 800;
export const DEFAULT_HISTORY_LIMIT = 100;

export interface EditHistoryEntry {
  name: string;
  mergeKey?: string;
  /** Table data changed by the entry; null for workspace-scoped commands. */
  tableId: string | null;
  patches: readonly Patch[];
  inversePatches: readonly Patch[];
  recordedAt: number;
}

export interface EditHistoryOptions {
  store: AppStore;
  /** Injected clock so the merge window is deterministic in tests. */
  now?: () => number;
  mergeWindowMs?: number;
  limit?: number;
  /** Called after an undo/redo changed a table (save queue hook). */
  onChanged?: (tableId: string) => void;
  /** Called after an undo/redo changed manifest-only document state. */
  onWorkspaceChanged?: () => void;
}

export interface EditHistory {
  /** Records a successful command result; non-cell commands only drop redo. */
  record(result: CommandResult): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  size(): number;
  clear(): void;
}

function tableIdOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }
  const tableId = (payload as Record<string, unknown>)['tableId'];
  return typeof tableId === 'string' ? tableId : null;
}

export function createEditHistory(options: EditHistoryOptions): EditHistory {
  const { store } = options;
  const now = options.now ?? ((): number => Date.now());
  const mergeWindowMs = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS;
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const undoStack: EditHistoryEntry[] = [];
  const redoStack: EditHistoryEntry[] = [];

  const record = (result: CommandResult): void => {
    const workspaceScoped = result.name === 'style.create' || result.name === 'style.update';
    const recordable =
      result.name === 'table.cell.set' ||
      result.name === 'table.paste' ||
      result.name === 'table.import' ||
      workspaceScoped;
    if (!recordable) {
      if (result.patches.length > 0) {
        redoStack.length = 0;
      }
      return;
    }
    if (result.patches.length === 0) {
      return;
    }
    const tableId = tableIdOf(result.payload);
    if (!workspaceScoped && tableId === null) {
      return;
    }
    const recordedAt = now();
    const entry: EditHistoryEntry = {
      name: result.name,
      ...(result.mergeKey === undefined ? {} : { mergeKey: result.mergeKey }),
      tableId,
      patches: result.patches,
      inversePatches: result.inversePatches,
      recordedAt,
    };

    const previous = undoStack.at(-1);
    if (
      result.name === 'table.cell.set' &&
      previous !== undefined &&
      previous.mergeKey !== undefined &&
      previous.mergeKey === entry.mergeKey &&
      recordedAt - previous.recordedAt <= mergeWindowMs
    ) {
      // Keep the first inverse (the state before the first edit) and the latest
      // forward patches (the current state).
      previous.patches = entry.patches;
      previous.recordedAt = recordedAt;
    } else {
      undoStack.push(entry);
      if (undoStack.length > limit) {
        undoStack.shift();
      }
    }
    redoStack.length = 0;
  };

  const undo = (): boolean => {
    const entry = undoStack.pop();
    if (entry === undefined) {
      return false;
    }
    store.setState(applyPatches(store.getState(), entry.inversePatches), true);
    redoStack.push(entry);
    if (entry.tableId === null) {
      options.onWorkspaceChanged?.();
    } else {
      options.onChanged?.(entry.tableId);
    }
    return true;
  };

  const redo = (): boolean => {
    const entry = redoStack.pop();
    if (entry === undefined) {
      return false;
    }
    store.setState(applyPatches(store.getState(), entry.patches), true);
    undoStack.push(entry);
    if (entry.tableId === null) {
      options.onWorkspaceChanged?.();
    } else {
      options.onChanged?.(entry.tableId);
    }
    return true;
  };

  return {
    record,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    size: () => undoStack.length,
    clear: () => {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
