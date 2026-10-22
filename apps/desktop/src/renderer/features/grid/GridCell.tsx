/** One grid cell; memoised so scrolling does not re-render the grid. */

import { memo } from 'react';

import type { CSSProperties, ReactElement, ReactNode } from 'react';

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
  editing: boolean;
  /** Rendered instead of `text` for the single cell being edited. */
  editor?: ReactNode;
  /** Full localised issue text, used as the tooltip and red-outline trigger. */
  errorText?: string | null;
  /** Temporary highlight for a primary-key conflict row. */
  conflict?: boolean;
  /** Temporary highlight after locating the first paste error. */
  pasteError?: boolean;
  onActivate: (rowIndex: number, colIndex: number, extend: boolean) => void;
  onBeginEdit: (rowIndex: number, colIndex: number) => void;
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
  editing,
  editor,
  errorText,
  conflict = false,
  pasteError = false,
  onActivate,
  onBeginEdit,
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
      aria-selected={selected}
      tabIndex={active && !editing ? 0 : -1}
      data-active={active ? 'true' : undefined}
      data-editing={editing ? 'true' : undefined}
      data-row={rowIndex}
      data-col={colIndex}
      data-row-id={rowId}
      data-testid={`grid-cell-${rowIndex}-${colIndex}`}
      title={errorText ?? undefined}
      className={[
        'cs-grid__cell',
        active && 'cs-grid__cell--active',
        selected && 'cs-grid__cell--selected',
        stickyLeft !== null && 'cs-grid__cell--frozen',
        editing && 'cs-grid__cell--editing',
        errorText !== null && errorText !== undefined && 'cs-grid__cell--error',
        conflict && 'cs-grid__cell--conflict',
        pasteError && 'cs-grid__cell--paste-error',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onMouseDown={(event) => {
        if (editing) {
          return;
        }
        event.preventDefault();
        onActivate(rowIndex, colIndex, event.shiftKey);
      }}
      onDoubleClick={(event) => {
        if (editing) {
          return;
        }
        event.preventDefault();
        onBeginEdit(rowIndex, colIndex);
      }}
    >
      {editor ?? (text.length === 0 ? '\u00a0' : text)}
    </div>
  );
}

export const GridCell = memo(GridCellComponent);
