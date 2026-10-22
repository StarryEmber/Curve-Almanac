/**
 * Virtualised data grid (T2.1/T2.2, SPEC §9.1/§9.2).
 *
 * TanStack Table owns column definitions, sizing and header groups; TanStack
 * Virtual renders only the visible rows. Only the active cell renders an editor,
 * so a 100k-row table never creates one input per cell.
 */

import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CellIssue, ViewPatch } from '@curve/app-core';
import { formatCellValue } from '@curve/domain';
import type { Cell, ColumnDef as DomainColumn, Row, TableMeta, ViewDef } from '@curve/domain';
import { Select } from '@curve/ui';

import { useI18n } from '../../i18n';

import { describeCellIssue } from './cell-issue-text';
import { CellEditor } from './editors/CellEditor';
import {
  isGridNavigationKey,
  isInRect,
  moveGridPosition,
  pasteTarget,
  selectionRect,
} from './grid-navigation';
import { DEFAULT_COLUMN_WIDTH, frozenOffsets, measureColumnWidth } from './grid-sizing';
import { GridCell } from './GridCell';
import { GridHeader } from './GridHeader';
import { SelectionLayer } from './SelectionLayer';
import { useCellEditing } from './use-cell-editing';

import type { GridPosition, PasteTarget } from './grid-navigation';
import type { CellCommitOutcome } from './use-cell-editing';
import type { ColumnDef as TanStackColumnDef } from '@tanstack/react-table';
import type { Range } from '@tanstack/react-virtual';
import type { ClipboardEvent, CSSProperties, KeyboardEvent, ReactElement } from 'react';

const ROW_HEIGHT = 32;
const CONFLICT_HIGHLIGHT_MS = 2_500;
const CONFLICT_RETURN_MS = 1_200;
const PASTE_ERROR_HIGHLIGHT_MS = 2_500;

export interface GridLocateTarget {
  rowIndex: number;
  colIndex: number;
  /** Changes on every locate request so repeated clicks re-run the effect. */
  nonce: number;
}

export interface DataGridProps {
  tableMeta: TableMeta;
  rows: readonly Row[];
  view: ViewDef;
  onViewUpdate: (patch: ViewPatch) => void | Promise<void>;
  onCellCommit: (row: Row, column: DomainColumn, raw: unknown) => Promise<CellCommitOutcome>;
  onEditIssue: (issue: CellIssue | null) => void;
  /** Receives `text/plain` when the grid (not an editor) handles a paste. */
  onPasteText?: (text: string, target: PasteTarget, columnIds: readonly string[]) => void;
  /** Set by the paste error dialog to focus and flash the offending cell. */
  locate?: GridLocateTarget | null;
}

export interface DataGridProps {
  tableMeta: TableMeta;
  rows: readonly Row[];
  view: ViewDef;
  onViewUpdate: (patch: ViewPatch) => void | Promise<void>;
  onCellCommit: (row: Row, column: DomainColumn, raw: unknown) => Promise<CellCommitOutcome>;
  onEditIssue: (issue: CellIssue | null) => void;
}

function sameSizing(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => right[key] === left[key]);
}

function isDirectEditKey(event: KeyboardEvent<HTMLDivElement>): boolean {
  return (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.nativeEvent.isComposing
  );
}

export function DataGrid({
  tableMeta,
  rows,
  view,
  onViewUpdate,
  onCellCommit,
  onEditIssue,
  onPasteText,
  locate = null,
}: DataGridProps): ReactElement {
  const { t } = useI18n();
  const tableView = view.tableView;
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const focusPending = useRef(false);
  const lastPersisted = useRef<Record<string, number>>({});
  const editingRowRef = useRef<number | null>(null);
  const [active, setActive] = useState({ row: 0, col: 0 });
  const [anchor, setAnchor] = useState({ row: 0, col: 0 });
  const [conflictRow, setConflictRow] = useState<number | null>(null);
  const rangeExtractor = useCallback((range: Range): number[] => {
    const indexes = defaultRangeExtractor(range);
    const editingIndex = editingRowRef.current;
    if (editingIndex !== null && !indexes.includes(editingIndex)) {
      indexes.push(editingIndex);
      indexes.sort((left, right) => left - right);
    }
    return indexes;
  }, []);

  const visibleColumns = useMemo(() => {
    if (tableView === undefined) {
      return [];
    }
    const hidden = new Set(tableView.hiddenColumnIds);
    const byId = new Map(tableMeta.columns.map((column) => [column.id, column]));
    return tableView.columnOrder
      .filter((id) => !hidden.has(id))
      .map((id) => byId.get(id))
      .filter((column): column is DomainColumn => column !== undefined);
  }, [tableMeta.columns, tableView]);

  const initialSizing = useMemo(() => {
    const sizing: Record<string, number> = {};
    for (const column of visibleColumns) {
      sizing[column.id] = tableView?.widths[column.id] ?? column.width ?? DEFAULT_COLUMN_WIDTH;
    }
    return sizing;
  }, [tableView, visibleColumns]);

  const [columnSizing, setColumnSizing] = useState<Record<string, number>>(initialSizing);

  useEffect(() => {
    setColumnSizing(initialSizing);
    lastPersisted.current = initialSizing;
  }, [initialSizing]);

  const columns = useMemo<TanStackColumnDef<Row>[]>(() => {
    const indexById = new Map(tableMeta.columns.map((column, index) => [column.id, index]));
    return visibleColumns.map((column) => ({
      id: column.id,
      accessorFn: (row: Row): Cell => row.values[indexById.get(column.id) ?? 0] ?? null,
      header: column.label,
      size: initialSizing[column.id] ?? DEFAULT_COLUMN_WIDTH,
      minSize: 80,
      maxSize: 800,
      cell: (info) => formatCellValue(info.getValue() as Cell, column),
    }));
  }, [initialSizing, tableMeta.columns, visibleColumns]);

  const table = useReactTable<Row>({
    data: rows as Row[],
    columns,
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: { minSize: 80, maxSize: 800, size: DEFAULT_COLUMN_WIDTH },
  });

  const sizes = table.getVisibleLeafColumns().map((column) => column.getSize());
  const totalWidth = sizes.reduce((sum, size) => sum + size, 0);
  const frozenCount = Math.min(
    tableView?.frozenColumnCount ?? 0,
    Math.max(0, visibleColumns.length - 1),
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    rangeExtractor,
  });

  useEffect(() => {
    setActive((current) => ({
      row: Math.max(0, Math.min(current.row, Math.max(0, rows.length - 1))),
      col: Math.max(0, Math.min(current.col, Math.max(0, visibleColumns.length - 1))),
    }));
    setAnchor((current) => ({
      row: Math.max(0, Math.min(current.row, Math.max(0, rows.length - 1))),
      col: Math.max(0, Math.min(current.col, Math.max(0, visibleColumns.length - 1))),
    }));
  }, [rows.length, visibleColumns.length]);

  const focusActiveCell = useCallback((): void => {
    const element = scrollRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    element?.focus({ preventScroll: true });
  }, []);

  const focusEditor = useCallback((): void => {
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, []);

  const registerEditorRef = useCallback((element: HTMLInputElement | HTMLSelectElement | null) => {
    editorRef.current = element;
  }, []);

  useEffect(() => {
    if (!focusPending.current) {
      return;
    }
    focusPending.current = false;
    const focusIfSafe = (): void => {
      // Never pull focus out of an open cell editor: a click schedules this
      // retry, and F2 can open the editor before the retry fires.
      if (scrollRef.current?.querySelector('[data-editing="true"]') !== null) {
        return;
      }
      const current = document.activeElement;
      if (
        current === null ||
        current === document.body ||
        scrollRef.current?.contains(current) === true
      ) {
        focusActiveCell();
      }
    };
    // The virtualizer may not have mounted the new active row when the first
    // animation frame runs (especially after PageDown/End under load). Retry
    // once; never steal focus if the user already moved it outside the grid.
    const frame = requestAnimationFrame(focusIfSafe);
    const retry = window.setTimeout(focusIfSafe, 100);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
  }, [active, focusActiveCell]);

  const handleFinish = useCallback(
    (position: GridPosition, options: { refocus: boolean }): void => {
      setActive(position);
      setAnchor(position);
      if (options.refocus) {
        focusPending.current = true;
      }
      virtualizer.scrollToIndex(position.row, { align: 'auto' });
    },
    [virtualizer],
  );

  const { editing, busy, begin, change, cancel, commit, clear } = useCellEditing({
    rows,
    columns: visibleColumns,
    tableMeta,
    onCommit: onCellCommit,
    onEditIssue,
    onFinish: handleFinish,
    focusEditor,
  });
  // Keeps the edited row mounted when the user scrolls a virtualised table.
  editingRowRef.current = editing?.row ?? null;

  const beginEdit = useCallback(
    (rowIndex: number, colIndex: number, seed?: string): void => {
      if (editing !== null) {
        return;
      }
      if (rows[rowIndex] === undefined || visibleColumns[colIndex] === undefined) {
        return;
      }
      setActive({ row: rowIndex, col: colIndex });
      setAnchor({ row: rowIndex, col: colIndex });
      focusPending.current = false;
      begin({ row: rowIndex, col: colIndex }, seed);
      virtualizer.scrollToIndex(rowIndex, { align: 'auto' });
    },
    [begin, editing, rows, virtualizer, visibleColumns],
  );

  const activate = useCallback(
    (rowIndex: number, colIndex: number, extend: boolean): void => {
      const target = { row: rowIndex, col: colIndex };
      if (editing !== null) {
        void commit(null).then((ok) => {
          if (!ok) {
            return;
          }
          setActive(target);
          if (!extend) {
            setAnchor(target);
          }
          focusPending.current = true;
          virtualizer.scrollToIndex(target.row, { align: 'auto' });
        });
        return;
      }
      setActive(target);
      if (!extend) {
        setAnchor(target);
      }
      focusPending.current = true;
      virtualizer.scrollToIndex(target.row, { align: 'auto' });
    },
    [commit, editing, virtualizer],
  );

  const conflict = editing?.issue?.conflictRowNumber;
  const editingRow = editing?.row;
  useEffect(() => {
    if (conflict === undefined || editingRow === undefined) {
      setConflictRow(null);
      return;
    }
    const index = conflict - 1;
    if (index < 0 || index >= rows.length) {
      return;
    }
    setConflictRow(index);
    virtualizer.scrollToIndex(index, { align: 'center' });
    const back = window.setTimeout(() => {
      virtualizer.scrollToIndex(editingRow, { align: 'auto' });
      requestAnimationFrame(focusEditor);
    }, CONFLICT_RETURN_MS);
    const clearHighlight = window.setTimeout(() => {
      setConflictRow(null);
    }, CONFLICT_HIGHLIGHT_MS);
    return () => {
      window.clearTimeout(back);
      window.clearTimeout(clearHighlight);
    };
  }, [conflict, editingRow, focusEditor, rows.length, virtualizer]);

  const [pasteError, setPasteError] = useState<{ row: number; col: number } | null>(null);
  const locateRow = locate?.rowIndex ?? -1;
  const locateCol = locate?.colIndex ?? -1;
  const locateNonce = locate?.nonce ?? 0;
  useEffect(() => {
    if (locateNonce === 0 || rows.length === 0 || visibleColumns.length === 0) {
      return undefined;
    }
    const row = Math.min(Math.max(locateRow, 0), rows.length - 1);
    const col = Math.min(Math.max(locateCol, 0), visibleColumns.length - 1);
    setActive({ row, col });
    setAnchor({ row, col });
    focusPending.current = true;
    setPasteError({ row, col });
    virtualizer.scrollToIndex(row, { align: 'center' });
    const clearHighlight = window.setTimeout(() => {
      setPasteError(null);
    }, PASTE_ERROR_HIGHLIGHT_MS);
    return () => {
      window.clearTimeout(clearHighlight);
    };
  }, [locateNonce, locateRow, locateCol, rows.length, visibleColumns.length, virtualizer]);

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (editing !== null || onPasteText === undefined) {
      return;
    }
    const eventTarget = event.target;
    if (
      eventTarget instanceof HTMLElement &&
      eventTarget.closest('input, textarea, select, [contenteditable="true"]') !== null
    ) {
      // The native editor owns its own paste (including multi-line text).
      return;
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text.length === 0) {
      return;
    }
    const columnIds = visibleColumns.map((column) => column.id);
    const target = pasteTarget(
      anchor,
      active,
      rows.map((row) => row.id),
      columnIds,
    );
    if (target === null) {
      return;
    }
    event.preventDefault();
    onPasteText(text, target, columnIds);
  };

  const commitWidths = useCallback(
    (next: Record<string, number>): void => {
      if (sameSizing(next, lastPersisted.current)) {
        return;
      }
      lastPersisted.current = next;
      void onViewUpdate({ widths: next });
    },
    [onViewUpdate],
  );

  const autofit = useCallback(
    (columnId: string): void => {
      const index = visibleColumns.findIndex((column) => column.id === columnId);
      const column = visibleColumns[index];
      if (column === undefined) {
        return;
      }
      const width = measureColumnWidth(column, rows, index, column.label);
      const next = { ...columnSizing, [column.id]: width };
      setColumnSizing(next);
      commitWidths(next);
    },
    [columnSizing, commitWidths, rows, visibleColumns],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (editing !== null) {
      return;
    }
    if (
      (event.key === 'F2' || event.key === 'Enter') &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      beginEdit(active.row, active.col);
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      void clear(active);
      return;
    }
    if (!isGridNavigationKey(event.key)) {
      if (isDirectEditKey(event)) {
        event.preventDefault();
        beginEdit(active.row, active.col, event.key);
      }
      return;
    }
    event.preventDefault();
    const viewportHeight = scrollRef.current?.clientHeight ?? ROW_HEIGHT * 10;
    const pageRows = Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT) - 1);
    const next = moveGridPosition(active, {
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey || event.metaKey,
      bounds: {
        rowCount: rows.length,
        colCount: visibleColumns.length,
        pageRows,
      },
    });
    const extend = event.shiftKey && event.key !== 'Tab';
    setActive(next);
    if (!extend) {
      setAnchor(next);
    }
    focusPending.current = true;
    if (next.row !== active.row) {
      virtualizer.scrollToIndex(next.row, { align: 'auto' });
    }
  };

  const rect = selectionRect(anchor, active);
  const selectedRows = rows.length === 0 ? 0 : rect.bottom - rect.top + 1;
  const selectedColumns = visibleColumns.length === 0 ? 0 : rect.right - rect.left + 1;
  const selectionLabel = t('grid.selection', {
    rows: selectedRows,
    columns: selectedColumns,
  });
  const issue = editing?.issue ?? null;
  const issueColumn =
    issue === null
      ? undefined
      : (tableMeta.columns.find((column) => column.id === issue.columnId) ??
        visibleColumns[editing?.col ?? -1]);
  const errorText =
    issue === null ? null : describeCellIssue(issue, t, issueColumn?.label ?? issue.columnId);

  if (tableView === undefined) {
    return <p className="cs-grid__empty">{t('grid.empty')}</p>;
  }

  const offsets = frozenOffsets(sizes, frozenCount);
  const virtualRows = virtualizer.getVirtualItems();
  const leafColumns = table.getVisibleLeafColumns();

  return (
    <section
      className="cs-grid"
      data-testid="data-grid"
      aria-label={t('grid.label', { name: tableMeta.name })}
    >
      <div className="cs-grid__toolbar">
        <span className="cs-grid__count">{t('grid.rows', { count: rows.length })}</span>
        <span className="cs-grid__count">
          {t('grid.columns', { count: visibleColumns.length })}
        </span>
        <Select
          className="cs-grid__frozen"
          label={t('grid.frozen')}
          options={[0, 1, 2, 3].map((value) => ({
            value: String(value),
            label: String(value),
          }))}
          value={String(tableView.frozenColumnCount)}
          onChange={(event) => {
            void onViewUpdate({ frozenColumnCount: Number(event.target.value) });
          }}
        />
      </div>

      <div
        ref={scrollRef}
        className="cs-grid__scroll"
        role="grid"
        aria-label={t('grid.label', { name: tableMeta.name })}
        aria-rowcount={rows.length + 1}
        aria-colcount={visibleColumns.length}
        aria-multiselectable="true"
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onPointerUp={() => {
          commitWidths(columnSizing);
        }}
        data-testid="grid-scroll"
      >
        <div className="cs-grid__canvas" style={{ width: totalWidth }}>
          <GridHeader
            table={table}
            frozenCount={frozenCount}
            onAutofit={autofit}
            resizeLabel={(label) => t('grid.resizeColumn', { column: label })}
          />
          <div
            className="cs-grid__body"
            style={{ height: rows.length === 0 ? 64 : virtualizer.getTotalSize() }}
          >
            {rows.length === 0 ? (
              <p className="cs-grid__empty">{t('grid.empty')}</p>
            ) : (
              virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (row === undefined) {
                  return null;
                }
                const rowStyle: CSSProperties = {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: totalWidth,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                };
                return (
                  <div
                    key={row.id}
                    role="row"
                    aria-rowindex={virtualRow.index + 2}
                    className="cs-grid__row"
                    style={rowStyle}
                    data-testid={`grid-row-${virtualRow.index}`}
                  >
                    {leafColumns.map((_leaf, colIndex) => {
                      const column = visibleColumns[colIndex];
                      if (column === undefined) {
                        return null;
                      }
                      const valueIndex = tableMeta.columns.findIndex(
                        (candidate) => candidate.id === column.id,
                      );
                      const value: Cell = row.values[valueIndex] ?? null;
                      const isFrozen = colIndex < frozenCount;
                      const isEditing =
                        editing?.row === virtualRow.index && editing.col === colIndex;
                      const cellError = isEditing ? errorText : null;
                      return (
                        <GridCell
                          key={column.id}
                          rowIndex={virtualRow.index}
                          colIndex={colIndex}
                          rowId={row.id}
                          text={formatCellValue(value, column)}
                          width={sizes[colIndex] ?? DEFAULT_COLUMN_WIDTH}
                          stickyLeft={isFrozen ? (offsets[colIndex] ?? 0) : null}
                          active={active.row === virtualRow.index && active.col === colIndex}
                          selected={isInRect(virtualRow.index, colIndex, rect)}
                          editing={isEditing}
                          editor={
                            isEditing && editing !== null ? (
                              <CellEditor
                                column={column}
                                value={editing.draft}
                                error={errorText}
                                busy={busy}
                                onChange={change}
                                onCommit={(direction) => {
                                  void commit(direction);
                                }}
                                onCancel={cancel}
                                onBlur={() => {
                                  void commit(null);
                                }}
                                registerRef={registerEditorRef}
                              />
                            ) : null
                          }
                          errorText={cellError}
                          conflict={conflictRow === virtualRow.index}
                          pasteError={
                            pasteError?.row === virtualRow.index && pasteError.col === colIndex
                          }
                          onActivate={activate}
                          onBeginEdit={beginEdit}
                        />
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <SelectionLayer rows={selectedRows} columns={selectedColumns} label={selectionLabel} />
    </section>
  );
}
