import { useCallback, useRef, useState } from 'react';

import type { CellIssue } from '@curve/app-core';
import type { Cell, ColumnDef, Row, TableMeta } from '@curve/domain';

import { editorValueToRaw, cellToEditorValue } from './editors/editor-value';
import { moveGridPosition } from './grid-navigation';

import type { EditorCommitDirection } from './editors/editor-control';
import type { GridPosition } from './grid-navigation';

export interface CellCommitOutcome {
  ok: boolean;
  issue?: CellIssue;
}

export interface CellEditingState {
  row: number;
  col: number;
  draft: string;
  initialDraft: string;
  issue: CellIssue | null;
}

export interface UseCellEditingOptions {
  rows: readonly Row[];
  columns: readonly ColumnDef[];
  tableMeta: TableMeta;
  onCommit(row: Row, column: ColumnDef, raw: unknown): Promise<CellCommitOutcome>;
  onEditIssue(issue: CellIssue | null): void;
  /** Moves the active cell after a keyboard commit; `refocus` focuses the cell. */
  onFinish(position: GridPosition, options: { refocus: boolean }): void;
  focusEditor(): void;
}

export interface CellEditingController {
  editing: CellEditingState | null;
  busy: boolean;
  begin(position: GridPosition, seed?: string, issue?: CellIssue): void;
  change(value: string): void;
  cancel(): void;
  commit(direction: EditorCommitDirection | null): Promise<boolean>;
  clear(position: GridPosition): Promise<void>;
}

function valueOf(row: Row, column: ColumnDef, tableMeta: TableMeta): Cell {
  const index = tableMeta.columns.findIndex((candidate) => candidate.id === column.id);
  return index < 0 ? null : (row.values[index] ?? null);
}

function nextPosition(
  current: GridPosition,
  direction: EditorCommitDirection,
  rows: readonly Row[],
  columns: readonly ColumnDef[],
): GridPosition {
  const bounds = {
    rowCount: rows.length,
    colCount: columns.length,
    pageRows: Math.max(1, rows.length),
  };
  switch (direction) {
    case 'down':
      return moveGridPosition(current, { key: 'ArrowDown', bounds });
    case 'up':
      return moveGridPosition(current, { key: 'ArrowUp', bounds });
    case 'right':
      return moveGridPosition(current, { key: 'Tab', bounds });
    case 'left':
      return moveGridPosition(current, { key: 'Tab', shiftKey: true, bounds });
  }
}

function unknownIssue(message: string): CellIssue {
  return { reason: 'unknown', code: 'E_UNKNOWN', message };
}

/**
 * Cell-local editing state machine. Drafts never touch the store; only
 * `onCommit` dispatches a command. Failed commits keep the editor mounted with
 * the structured issue, while Esc/blur follow the SPEC §9.2 semantics.
 */
export function useCellEditing(options: UseCellEditingOptions): CellEditingController {
  const { rows, columns, tableMeta, onCommit, onEditIssue, onFinish, focusEditor } = options;
  const [editing, setEditing] = useState<CellEditingState | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const finished = useRef(false);

  const clearIssue = useCallback((): void => {
    onEditIssue(null);
  }, [onEditIssue]);

  const begin = useCallback(
    (position: GridPosition, seed?: string, issue?: CellIssue): void => {
      const row = rows[position.row];
      const column = columns[position.col];
      if (row === undefined || column === undefined) {
        return;
      }
      const initialDraft = cellToEditorValue(valueOf(row, column, tableMeta), column);
      inFlight.current = false;
      finished.current = false;
      setBusy(false);
      setEditing({
        row: position.row,
        col: position.col,
        draft: seed ?? initialDraft,
        initialDraft,
        issue: issue ?? null,
      });
      onEditIssue(issue ?? null);
    },
    [columns, onEditIssue, rows, tableMeta],
  );

  const change = useCallback(
    (value: string): void => {
      setEditing((current) =>
        current === null ? current : { ...current, draft: value, issue: null },
      );
      onEditIssue(null);
    },
    [onEditIssue],
  );

  const cancel = useCallback((): void => {
    if (editing === null) {
      return;
    }
    finished.current = true;
    inFlight.current = false;
    setEditing(null);
    setBusy(false);
    clearIssue();
    onFinish({ row: editing.row, col: editing.col }, { refocus: true });
  }, [clearIssue, editing, onFinish]);

  const commit = useCallback(
    async (direction: EditorCommitDirection | null): Promise<boolean> => {
      if (editing === null || inFlight.current || finished.current) {
        return true;
      }
      const row = rows[editing.row];
      const column = columns[editing.col];
      if (row === undefined || column === undefined) {
        return false;
      }

      if (editing.draft === editing.initialDraft) {
        if (editing.issue !== null) {
          // Blurring an invalid draft must not silently close the editor.
          requestAnimationFrame(focusEditor);
          return false;
        }
        finished.current = true;
        setEditing(null);
        setBusy(false);
        clearIssue();
        if (direction !== null) {
          onFinish(nextPosition({ row: editing.row, col: editing.col }, direction, rows, columns), {
            refocus: true,
          });
        }
        return true;
      }

      inFlight.current = true;
      setBusy(true);
      let outcome: CellCommitOutcome;
      try {
        outcome = await onCommit(row, column, editorValueToRaw(editing.draft, column));
      } catch (thrown) {
        outcome = {
          ok: false,
          issue: unknownIssue(thrown instanceof Error ? thrown.message : 'The value was rejected.'),
        };
      }
      inFlight.current = false;
      setBusy(false);

      if (outcome.ok) {
        finished.current = true;
        setEditing(null);
        clearIssue();
        if (direction !== null) {
          onFinish(nextPosition({ row: editing.row, col: editing.col }, direction, rows, columns), {
            refocus: true,
          });
        }
        return true;
      }

      const issue = outcome.issue ?? unknownIssue('The value was rejected.');
      setEditing({ ...editing, issue });
      onEditIssue(issue);
      requestAnimationFrame(focusEditor);
      return false;
    },
    [clearIssue, columns, editing, focusEditor, onCommit, onEditIssue, onFinish, rows],
  );

  const clear = useCallback(
    async (position: GridPosition): Promise<void> => {
      if (editing !== null || inFlight.current) {
        return;
      }
      const row = rows[position.row];
      const column = columns[position.col];
      if (row === undefined || column === undefined) {
        return;
      }
      inFlight.current = true;
      setBusy(true);
      let outcome: CellCommitOutcome;
      try {
        outcome = await onCommit(row, column, column.type === 'text' ? '' : null);
      } catch (thrown) {
        outcome = {
          ok: false,
          issue: unknownIssue(thrown instanceof Error ? thrown.message : 'The value was rejected.'),
        };
      }
      inFlight.current = false;
      setBusy(false);

      if (outcome.ok) {
        clearIssue();
        return;
      }
      const issue = outcome.issue ?? unknownIssue('The value was rejected.');
      begin(position, '', issue);
      requestAnimationFrame(focusEditor);
    },
    [begin, clearIssue, columns, editing, focusEditor, onCommit, rows],
  );

  return { editing, busy, begin, change, cancel, commit, clear };
}
