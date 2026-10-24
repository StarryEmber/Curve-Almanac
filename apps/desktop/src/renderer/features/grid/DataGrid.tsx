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
import { createConditionalFormat } from '@curve/domain';
import type {
  Cell,
  ColumnDef as DomainColumn,
  FilterPredicate,
  Row,
  TableMeta,
  TableStyle,
  ViewDef,
} from '@curve/domain';
import {
  Button,
  Menu,
  Select,
  TableStyleProvider,
  columnDisplayLabel,
  computeBarRanges,
  conditionalCellStyle,
  formatStyledCellValue,
  presentStyledCell,
  tableRowHeight,
} from '@curve/ui';

import { useI18n } from '../../i18n';
import { ExportCsvDialog } from '../export/ExportCsvDialog';
import { FilterDialog } from '../filter/FilterDialog';

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
import { toggleSort } from './grid-sort';
import { GridCell } from './GridCell';
import { GridHeader } from './GridHeader';
import { SelectionLayer } from './SelectionLayer';
import { useCellEditing } from './use-cell-editing';

import type { GridPosition, PasteTarget } from './grid-navigation';
import type { CellCommitOutcome } from './use-cell-editing';
import type { ViewRowsState } from './use-view-rows';
import type { ColumnDef as TanStackColumnDef } from '@tanstack/react-table';
import type { Range } from '@tanstack/react-virtual';
import type { ClipboardEvent, CSSProperties, KeyboardEvent, ReactElement } from 'react';

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
  /** Resolved table style for this view (builtin or persisted user style). */
  tableStyle: TableStyle;
  /** True when `resolveStyle` had to fall back to the default style. */
  styleFallback?: boolean;
  /** Visible rows in display order (filtered and/or sorted). */
  rows: readonly Row[];
  /** Physical rows used by the CSV export "all rows" scope (T3.6). */
  allRows: readonly Row[];
  /** Query metadata for counts, the busy indicator and E2E timing. */
  viewRows: ViewRowsState;
  view: ViewDef;
  onViewUpdate: (patch: ViewPatch) => void | Promise<void>;
  onCellCommit: (row: Row, column: DomainColumn, raw: unknown) => Promise<CellCommitOutcome>;
  onEditIssue: (issue: CellIssue | null) => void;
  /** Receives `text/plain` when the grid (not an editor) handles a paste. */
  onPasteText?: (
    text: string,
    target: PasteTarget,
    columnIds: readonly string[],
    rowIds: readonly string[],
  ) => void;
  /** Set by the paste error dialog to focus and flash the offending cell. */
  locate?: GridLocateTarget | null;
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

function countFilterConditions(filter: FilterPredicate | undefined): number {
  if (filter === undefined) {
    return 0;
  }
  if (filter.kind === 'compare') {
    return 1;
  }
  return filter.children.reduce((total, child) => total + countFilterConditions(child), 0);
}

export function DataGrid({
  tableMeta,
  tableStyle,
  styleFallback = false,
  rows,
  allRows,
  viewRows,
  view,
  onViewUpdate,
  onCellCommit,
  onEditIssue,
  onPasteText,
  locate = null,
}: DataGridProps): ReactElement {
  const { locale, t } = useI18n();
  const tableView = view.tableView;
  const rowHeight = tableRowHeight(tableStyle.tokens);
  const trueLabel = t('grid.editor.true');
  const falseLabel = t('grid.editor.false');
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const focusPending = useRef(false);
  const lastPersisted = useRef<Record<string, number>>({});
  const editingRowRef = useRef<number | null>(null);
  const activeRowIdRef = useRef<string | null>(rows[0]?.id ?? null);
  const [active, setActive] = useState({ row: 0, col: 0 });
  const [anchor, setAnchor] = useState({ row: 0, col: 0 });
  const [conflictRow, setConflictRow] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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
      sizing[column.id] =
        tableView?.widths[column.id] ??
        tableStyle.columnOverrides[column.id]?.width ??
        column.width ??
        DEFAULT_COLUMN_WIDTH;
    }
    return sizing;
  }, [tableStyle, tableView, visibleColumns]);

  const barRanges = useMemo(
    () => computeBarRanges(rows, tableMeta.columns, tableStyle),
    [rows, tableMeta.columns, tableStyle],
  );

  const conditionalFormat = useMemo(
    () =>
      createConditionalFormat(tableStyle.conditionalRules, tableMeta.columns, {
        locale,
      }),
    [locale, tableMeta.columns, tableStyle.conditionalRules],
  );

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
      header: columnDisplayLabel(column, tableStyle),
      size: initialSizing[column.id] ?? DEFAULT_COLUMN_WIDTH,
      minSize: 80,
      maxSize: 800,
    }));
  }, [initialSizing, tableMeta.columns, tableStyle, visibleColumns]);

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
    estimateSize: () => rowHeight,
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

  // Keep the selection on the same row id when a query inserts/removes/moves
  // rows. While a query is pending the list is temporarily empty, so keep the
  // remembered id and resolve it when the new list arrives.
  useEffect(() => {
    if (rows.length === 0) {
      return;
    }
    const rowId = activeRowIdRef.current;
    if (rowId === null) {
      activeRowIdRef.current = rows[0]?.id ?? null;
      return;
    }
    const index = rows.findIndex((row) => row.id === rowId);
    if (index >= 0) {
      setActive((current) => (current.row === index ? current : { ...current, row: index }));
      setAnchor((current) => (current.row === index ? current : { ...current, row: index }));
      return;
    }
    setActive((current) => {
      const row = Math.max(0, Math.min(current.row, rows.length - 1));
      activeRowIdRef.current = rows[row]?.id ?? null;
      return { ...current, row };
    });
  }, [rows]);

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
      activeRowIdRef.current = rows[position.row]?.id ?? null;
      setActive(position);
      setAnchor(position);
      if (options.refocus) {
        focusPending.current = true;
      }
      virtualizer.scrollToIndex(position.row, { align: 'auto' });
    },
    [rows, virtualizer],
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
      activeRowIdRef.current = rows[rowIndex]?.id ?? null;
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
          activeRowIdRef.current = rows[target.row]?.id ?? null;
          if (!extend) {
            setAnchor(target);
          }
          focusPending.current = true;
          virtualizer.scrollToIndex(target.row, { align: 'auto' });
        });
        return;
      }
      setActive(target);
      activeRowIdRef.current = rows[target.row]?.id ?? null;
      if (!extend) {
        setAnchor(target);
      }
      focusPending.current = true;
      virtualizer.scrollToIndex(target.row, { align: 'auto' });
    },
    [commit, editing, rows, virtualizer],
  );

  const conflictRowId = editing?.issue?.conflictRowId;
  const editingRow = editing?.row;
  useEffect(() => {
    if (conflictRowId === undefined || editingRow === undefined) {
      setConflictRow(null);
      return;
    }
    const index = rows.findIndex((row) => row.id === conflictRowId);
    if (index < 0) {
      // The conflicting row is filtered out; keep the issue text without scrolling.
      setConflictRow(null);
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
  }, [conflictRowId, editingRow, focusEditor, rows, virtualizer]);

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
    activeRowIdRef.current = rows[row]?.id ?? null;
    focusPending.current = true;
    setPasteError({ row, col });
    virtualizer.scrollToIndex(row, { align: 'center' });
    const clearHighlight = window.setTimeout(() => {
      setPasteError(null);
    }, PASTE_ERROR_HIGHLIGHT_MS);
    return () => {
      window.clearTimeout(clearHighlight);
    };
  }, [locateNonce, locateRow, locateCol, rows, visibleColumns.length, virtualizer]);

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
    const rowIds = rows.map((row) => row.id);
    const target = pasteTarget(anchor, active, rowIds, columnIds);
    if (target === null) {
      return;
    }
    event.preventDefault();
    onPasteText(text, target, columnIds, rowIds);
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
      const width = measureColumnWidth(
        column,
        rows,
        index,
        columnDisplayLabel(column, tableStyle),
        {
          formatValue: (value, targetColumn) =>
            formatStyledCellValue(value, targetColumn, tableStyle, {
              locale,
              trueLabel,
              falseLabel,
            }),
          fontFamily: tableStyle.tokens.fontFamily,
          fontSize: tableStyle.tokens.fontSize,
        },
      );
      const next = { ...columnSizing, [column.id]: width };
      setColumnSizing(next);
      commitWidths(next);
    },
    [columnSizing, commitWidths, falseLabel, locale, rows, tableStyle, trueLabel, visibleColumns],
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
    const viewportHeight = scrollRef.current?.clientHeight ?? rowHeight * 10;
    const pageRows = Math.max(1, Math.floor(viewportHeight / rowHeight) - 1);
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
    activeRowIdRef.current = rows[next.row]?.id ?? null;
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
  const sort = tableView.sort;
  const filterActive = tableView.filter !== undefined;
  const columnLabel = (columnId: string): string => {
    const column = tableMeta.columns.find((candidate) => candidate.id === columnId);
    return column === undefined ? columnId : columnDisplayLabel(column, tableStyle);
  };
  const sortDirectionLabel = (direction: 'asc' | 'desc'): string =>
    direction === 'asc' ? t('grid.sort.asc') : t('grid.sort.desc');
  const sortMenuItems =
    sort.length === 0
      ? [
          {
            id: 'none',
            label: t('grid.sort.none'),
            onSelect: () => undefined,
            disabled: true,
          },
        ]
      : [
          ...sort.map((spec, index) => ({
            id: spec.columnId,
            label: t('grid.sort.level', {
              index: index + 1,
              column: columnLabel(spec.columnId),
              direction: sortDirectionLabel(spec.direction),
            }),
            onSelect: () => {
              void onViewUpdate({ sort: sort.filter((_entry, position) => position !== index) });
            },
          })),
          {
            id: 'clear',
            label: t('grid.sort.clear'),
            onSelect: () => {
              void onViewUpdate({ sort: [] });
            },
          },
        ];

  const toggleColumnSort = (columnId: string, additive: boolean): void => {
    const next = toggleSort(sort, columnId, additive);
    if (
      next.length === sort.length &&
      next.every(
        (spec, index) =>
          spec.columnId === sort[index]?.columnId && spec.direction === sort[index]?.direction,
      )
    ) {
      return;
    }
    void onViewUpdate({ sort: next });
  };

  return (
    <TableStyleProvider
      tableStyle={tableStyle}
      className="cs-grid"
      data-testid="data-grid"
      data-style-fallback={styleFallback ? 'true' : undefined}
      data-query-mode={viewRows.mode}
      data-query-busy={viewRows.busy ? 'true' : 'false'}
      data-query-ms={viewRows.queryMs === null ? '' : String(Math.round(viewRows.queryMs))}
      data-query-total-ms={viewRows.totalMs === null ? '' : String(Math.round(viewRows.totalMs))}
      data-visible-rows={viewRows.visibleRows}
      data-total-rows={viewRows.totalRows}
      aria-label={t('grid.label', { name: tableMeta.name })}
    >
      <div className="cs-grid__toolbar">
        <span className="cs-grid__count" data-testid="grid-row-count">
          {filterActive
            ? t('grid.rowsFiltered', { visible: rows.length, total: viewRows.totalRows })
            : t('grid.rows', { count: rows.length })}
        </span>
        <span className="cs-grid__count">
          {t('grid.columns', { count: visibleColumns.length })}
        </span>
        <Button
          size="sm"
          variant={filterActive ? 'secondary' : 'ghost'}
          aria-label={t('grid.filter.button')}
          aria-pressed={filterActive}
          data-testid="grid-filter-open"
          onClick={() => {
            setFilterOpen(true);
          }}
        >
          {filterActive
            ? `${t('grid.filter.active', { count: countFilterConditions(tableView.filter) })}`
            : t('grid.filter.button')}
        </Button>
        {filterActive ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void onViewUpdate({ filter: null });
            }}
          >
            {t('grid.filter.clear')}
          </Button>
        ) : null}
        <Menu label={t('grid.sort.menu')} items={sortMenuItems} align="end" />
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('grid.export.button')}
          data-testid="grid-export-open"
          onClick={() => {
            setExportOpen(true);
          }}
        >
          {t('grid.export.button')}
        </Button>
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
        {viewRows.busy ? (
          <span className="cs-grid__query" role="status">
            {t('grid.query.busy')}
          </span>
        ) : null}
        {viewRows.warning !== null ? (
          <span className="cs-grid__query cs-grid__query--warning" role="status">
            {t('grid.query.fallback')}
          </span>
        ) : null}
        {viewRows.error !== null ? (
          <span className="cs-grid__query cs-grid__query--error" role="alert">
            {t('grid.query.error')}
          </span>
        ) : null}
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
            columns={visibleColumns}
            tableStyle={tableStyle}
            frozenCount={frozenCount}
            sort={sort}
            onAutofit={autofit}
            onToggleSort={toggleColumnSort}
            resizeLabel={(label) => t('grid.resizeColumn', { column: label })}
            sortLabel={(label, direction, level) =>
              `${t('grid.sort.column', { column: label })} · ${
                direction === 'none' ? t('grid.sort.none') : sortDirectionLabel(direction)
              }${level > 0 ? ` · ${String(level)}` : ''}`
            }
          />
          <div
            className="cs-grid__body"
            style={{ height: rows.length === 0 ? 64 : virtualizer.getTotalSize() }}
          >
            {rows.length === 0 ? (
              <p className="cs-grid__empty">
                {filterActive ? t('grid.emptyFiltered') : t('grid.empty')}
              </p>
            ) : (
              virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (row === undefined) {
                  return null;
                }
                const conditionalRow = conditionalFormat.evaluateRow(row);
                const rowStyle: CSSProperties & Record<'--cs-row-bg', string> = {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: totalWidth,
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                  '--cs-row-bg':
                    virtualRow.index % 2 === 1
                      ? 'var(--cs-table-row-alt-bg)'
                      : 'var(--cs-table-row-bg)',
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
                      const presentation = presentStyledCell(value, column, tableStyle, barRanges, {
                        locale,
                        trueLabel,
                        falseLabel,
                      });
                      const isFrozen = colIndex < frozenCount;
                      const isEditing =
                        editing?.row === virtualRow.index && editing.col === colIndex;
                      const cellError = isEditing ? errorText : null;
                      const conditionalMatch = conditionalRow.cellRule(column.id);
                      const conditional = conditionalCellStyle(conditionalMatch, {
                        includeIcon: conditionalMatch?.target === 'cell' || colIndex === 0,
                      });
                      const conditionalIconLabel =
                        conditional?.icon === 'up'
                          ? t('grid.ruleIcon.up')
                          : conditional?.icon === 'down'
                            ? t('grid.ruleIcon.down')
                            : conditional?.icon === 'warning'
                              ? t('grid.ruleIcon.warning')
                              : undefined;
                      return (
                        <GridCell
                          key={column.id}
                          rowIndex={virtualRow.index}
                          colIndex={colIndex}
                          rowId={row.id}
                          columnId={column.id}
                          text={presentation.text}
                          align={presentation.align}
                          render={presentation.render}
                          barRatio={presentation.barRatio}
                          badgeTone={presentation.badgeTone}
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
                          conditional={conditional}
                          conditionalIconLabel={conditionalIconLabel}
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
      <FilterDialog
        open={filterOpen}
        table={tableMeta}
        filter={tableView.filter}
        onClose={() => {
          setFilterOpen(false);
        }}
        onApply={(next) => {
          setFilterOpen(false);
          void onViewUpdate({ filter: next ?? null });
        }}
      />
      <ExportCsvDialog
        open={exportOpen}
        tableMeta={tableMeta}
        tableStyle={tableStyle}
        view={view}
        visibleColumns={visibleColumns}
        rows={rows}
        allRows={allRows}
        onClose={() => {
          setExportOpen(false);
        }}
      />
    </TableStyleProvider>
  );
}
