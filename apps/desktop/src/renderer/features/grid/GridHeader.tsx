/** Sticky header row with resize handles, autofit and sort controls (T2.6). */

import type { ColumnDef, Row, SortSpec, TableStyle } from '@curve/domain';
import { resolveCellAlign } from '@curve/ui';

import { frozenOffsets } from './grid-sizing';

import type { Table } from '@tanstack/react-table';
import type { CSSProperties, ReactElement } from 'react';

export interface GridHeaderProps {
  table: Table<Row>;
  /** Domain columns in the same order as the visible leaf columns. */
  columns: readonly ColumnDef[];
  tableStyle: TableStyle;
  frozenCount: number;
  sort: readonly SortSpec[];
  onAutofit: (columnId: string) => void;
  onToggleSort: (columnId: string, additive: boolean) => void;
  resizeLabel: (columnLabel: string) => string;
  sortLabel: (columnLabel: string, direction: 'asc' | 'desc' | 'none', level: number) => string;
}

export function GridHeader({
  table,
  columns,
  tableStyle,
  frozenCount,
  sort,
  onAutofit,
  onToggleSort,
  resizeLabel,
  sortLabel,
}: GridHeaderProps): ReactElement {
  const sizes = table.getVisibleLeafColumns().map((column) => column.getSize());
  const offsets = frozenOffsets(sizes, frozenCount);
  const group = table.getHeaderGroups()[0];

  return (
    <div role="row" aria-rowindex={1} className="cs-grid__header-row">
      {group?.headers.map((header, index) => {
        const size = header.column.getSize();
        const sticky = index < frozenCount ? (offsets[index] ?? 0) : null;
        const style: CSSProperties = { width: size, minWidth: size, maxWidth: size };
        if (sticky !== null) {
          style.position = 'sticky';
          style.left = sticky;
          style.zIndex = 3;
        }
        const domainColumn = columns[index];
        const align =
          domainColumn === undefined ? 'left' : resolveCellAlign(domainColumn, tableStyle);
        const sortIndex = sort.findIndex((spec) => spec.columnId === header.column.id);
        const sortSpec = sortIndex >= 0 ? sort[sortIndex] : undefined;
        const direction = sortSpec?.direction ?? 'none';
        const label = String(header.column.columnDef.header ?? '');
        return (
          <div
            key={header.id}
            role="columnheader"
            aria-colindex={index + 1}
            aria-sort={
              sortSpec === undefined
                ? undefined
                : sortSpec.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
            className={['cs-grid__header-cell', sticky !== null && 'cs-grid__header-cell--frozen']
              .filter(Boolean)
              .join(' ')}
            style={style}
            data-column-id={header.column.id}
            data-align={align}
          >
            <button
              type="button"
              className="cs-grid__header-sort"
              aria-label={sortLabel(label, direction, sortIndex + 1)}
              title={sortLabel(label, direction, sortIndex + 1)}
              onClick={(event) => {
                onToggleSort(header.column.id, event.shiftKey);
              }}
            >
              <span className="cs-grid__header-label">{label}</span>
              {sortSpec === undefined ? null : (
                <span className="cs-grid__sort-indicator" aria-hidden="true">
                  {sortSpec.direction === 'asc' ? '↑' : '↓'}
                  {sort.length > 1 ? (
                    <span className="cs-grid__sort-level">{sortIndex + 1}</span>
                  ) : null}
                </span>
              )}
            </button>
            <span
              role="separator"
              aria-orientation="vertical"
              aria-label={resizeLabel(label)}
              className="cs-grid__resizer"
              onMouseDown={header.getResizeHandler()}
              onTouchStart={header.getResizeHandler()}
              onDoubleClick={() => {
                onAutofit(header.column.id);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
