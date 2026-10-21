/**
 * Virtualised data grid (T2.1, SPEC §9.1).
 *
 * TanStack Table owns column definitions, sizing and header groups; TanStack
 * Virtual renders only the visible rows. Cells are read-only in T2.1 (editing is
 * T2.2); keyboard navigation, rectangular selection, frozen columns, column
 * resizing and ARIA live here.
 */

import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ViewPatch } from '@curve/app-core';
import { formatCellValue } from '@curve/domain';
import type { Cell, ColumnDef as DomainColumn, Row, TableMeta, ViewDef } from '@curve/domain';
import { Select } from '@curve/ui';

import { useI18n } from '../../i18n';

import { isGridNavigationKey, isInRect, moveGridPosition, selectionRect } from './grid-navigation';
import { DEFAULT_COLUMN_WIDTH, frozenOffsets, measureColumnWidth } from './grid-sizing';
import { GridCell } from './GridCell';
import { GridHeader } from './GridHeader';
import { SelectionLayer } from './SelectionLayer';

import type { ColumnDef as TanStackColumnDef } from '@tanstack/react-table';
import type { CSSProperties, KeyboardEvent, ReactElement } from 'react';

const ROW_HEIGHT = 32;

export interface DataGridProps {
  tableMeta: TableMeta;
  rows: readonly Row[];
  view: ViewDef;
  onViewUpdate: (patch: ViewPatch) => void | Promise<void>;
}

function sameSizing(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => right[key] === left[key]);
}

export function DataGrid({ tableMeta, rows, view, onViewUpdate }: DataGridProps): ReactElement {
  const { t } = useI18n();
  const tableView = view.tableView;
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const lastPersisted = useRef<Record<string, number>>({});
  const [active, setActive] = useState({ row: 0, col: 0 });
  const [anchor, setAnchor] = useState({ row: 0, col: 0 });

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

  useEffect(() => {
    if (!focusPending.current) {
      return;
    }
    focusPending.current = false;
    const frame = requestAnimationFrame(focusActiveCell);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [active, focusActiveCell]);

  const activate = useCallback((rowIndex: number, colIndex: number, extend: boolean): void => {
    setActive({ row: rowIndex, col: colIndex });
    if (!extend) {
      setAnchor({ row: rowIndex, col: colIndex });
    }
    focusPending.current = true;
  }, []);

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
    if (!isGridNavigationKey(event.key)) {
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
                          onActivate={activate}
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
