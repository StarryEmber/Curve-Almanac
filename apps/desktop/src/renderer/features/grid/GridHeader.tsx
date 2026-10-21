/** Sticky header row with resize handles and double-click autofit (SPEC §9.1). */

import type { Row } from '@curve/domain';

import { frozenOffsets } from './grid-sizing';

import type { Table } from '@tanstack/react-table';
import type { CSSProperties, ReactElement } from 'react';

export interface GridHeaderProps {
  table: Table<Row>;
  frozenCount: number;
  onAutofit: (columnId: string) => void;
  resizeLabel: (columnLabel: string) => string;
}

export function GridHeader({
  table,
  frozenCount,
  onAutofit,
  resizeLabel,
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
        return (
          <div
            key={header.id}
            role="columnheader"
            aria-colindex={index + 1}
            className={['cs-grid__header-cell', sticky !== null && 'cs-grid__header-cell--frozen']
              .filter(Boolean)
              .join(' ')}
            style={style}
            data-column-id={header.column.id}
          >
            <span className="cs-grid__header-label">
              {String(header.column.columnDef.header ?? '')}
            </span>
            <span
              role="separator"
              aria-orientation="vertical"
              aria-label={resizeLabel(String(header.column.columnDef.header ?? ''))}
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
