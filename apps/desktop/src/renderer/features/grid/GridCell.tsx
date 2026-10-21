/** One read-only grid cell; memoised so scrolling does not re-render the grid. */

import { memo } from 'react';

import type { CSSProperties, ReactElement } from 'react';

export interface GridCellProps {
  rowIndex: number;
  colIndex: number;
  rowId: string;
  text: string;
  width: number;
  /** Set for frozen columns; the value is the sticky left offset in px. */
  stickyLeft: number | null;
  active: boolean;
  selected: boolean;
  onActivate: (rowIndex: number, colIndex: number, extend: boolean) => void;
}

function GridCellComponent({
  rowIndex,
  colIndex,
  rowId,
  text,
  width,
  stickyLeft,
  active,
  selected,
  onActivate,
}: GridCellProps): ReactElement {
  const style: CSSProperties = { width, minWidth: width, maxWidth: width };
  if (stickyLeft !== null) {
    style.position = 'sticky';
    style.left = stickyLeft;
    style.zIndex = 2;
  }

  return (
    <div
      role="gridcell"
      aria-colindex={colIndex + 1}
      aria-readonly="true"
      aria-selected={selected}
      tabIndex={active ? 0 : -1}
      data-active={active ? 'true' : undefined}
      data-row={rowIndex}
      data-col={colIndex}
      data-row-id={rowId}
      data-testid={`grid-cell-${rowIndex}-${colIndex}`}
      className={[
        'cs-grid__cell',
        active && 'cs-grid__cell--active',
        selected && 'cs-grid__cell--selected',
        stickyLeft !== null && 'cs-grid__cell--frozen',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onMouseDown={(event) => {
        event.preventDefault();
        onActivate(rowIndex, colIndex, event.shiftKey);
      }}
    >
      {text.length === 0 ? '\u00a0' : text}
    </div>
  );
}

export const GridCell = memo(GridCellComponent);
