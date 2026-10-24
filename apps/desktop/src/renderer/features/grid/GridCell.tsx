/** One grid cell; memoised so scrolling does not re-render the grid. */

import { memo } from 'react';

import type { BadgeTone, CellAlign, CellRenderMode, ConditionalCellStyle } from '@curve/ui';

import type { CSSProperties, ReactElement, ReactNode } from 'react';

export interface GridCellProps {
  rowIndex: number;
  colIndex: number;
  rowId: string;
  columnId: string;
  text: string;
  /** Alignment resolved from the column type and the style override. */
  align: CellAlign;
  /** `text`, enum `badge`, or numeric background `bar`. */
  render: CellRenderMode;
  /** 0..1 for bar cells; null renders plain text. */
  barRatio: number | null;
  /** Style-derived badge tone for enum cells. */
  badgeTone: BadgeTone | null;
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
  /** First matching conditional rule that applies to this cell (T3.3). */
  conditional?: ConditionalCellStyle | null;
  /** Localised accessibility label for the conditional icon. */
  conditionalIconLabel?: string;
  onActivate: (rowIndex: number, colIndex: number, extend: boolean) => void;
  onBeginEdit: (rowIndex: number, colIndex: number) => void;
}

function GridCellComponent({
  rowIndex,
  colIndex,
  rowId,
  columnId,
  text,
  align,
  render,
  barRatio,
  badgeTone,
  width,
  stickyLeft,
  active,
  selected,
  editing,
  editor,
  errorText,
  conflict = false,
  pasteError = false,
  conditional = null,
  conditionalIconLabel,
  onActivate,
  onBeginEdit,
}: GridCellProps): ReactElement {
  const style: CSSProperties = { width, minWidth: width, maxWidth: width };
  if (stickyLeft !== null) {
    style.position = 'sticky';
    style.left = stickyLeft;
    style.zIndex = 2;
  }

  // Error/conflict/selection states win over conditional formatting (ADR-036).
  const appliedConditional =
    conditional !== null &&
    !selected &&
    !conflict &&
    !pasteError &&
    (errorText === null || errorText === undefined)
      ? conditional
      : null;

  if (appliedConditional?.background !== undefined) {
    style.backgroundColor = appliedConditional.background;
  }
  if (appliedConditional?.foreground !== undefined) {
    style.color = appliedConditional.foreground;
  }
  if (appliedConditional?.bold === true) {
    style.fontWeight = 600;
  }
  if (appliedConditional?.italic === true) {
    style.fontStyle = 'italic';
  }

  const hasBar =
    render === 'bar' && barRatio !== null && appliedConditional?.background === undefined;
  const hasBadge = render === 'badge' && badgeTone !== null && text.length > 0;
  const content = text.length === 0 ? '\u00a0' : text;
  const icon = appliedConditional?.icon;

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
      data-column-id={columnId}
      data-align={align}
      data-render={render}
      data-badge-tone={hasBadge && badgeTone !== null ? badgeTone : undefined}
      data-conditional-rule={appliedConditional?.ruleId}
      data-testid={`grid-cell-${rowIndex}-${colIndex}`}
      title={errorText ?? appliedConditional?.label ?? undefined}
      className={[
        'cs-grid__cell',
        active && 'cs-grid__cell--active',
        selected && 'cs-grid__cell--selected',
        stickyLeft !== null && 'cs-grid__cell--frozen',
        editing && 'cs-grid__cell--editing',
        errorText !== null && errorText !== undefined && 'cs-grid__cell--error',
        conflict && 'cs-grid__cell--conflict',
        pasteError && 'cs-grid__cell--paste-error',
        appliedConditional !== null && 'cs-grid__cell--conditional',
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
      {icon === undefined ? null : (
        <span
          className="cs-grid__rule-icon"
          data-icon={icon}
          role="img"
          aria-label={conditionalIconLabel ?? icon}
        >
          {icon === 'up' ? '\u2191' : icon === 'down' ? '\u2193' : '!'}
        </span>
      )}
      {editor ??
        (hasBadge ? (
          <span className="cs-grid__badge" data-tone={badgeTone ?? 0}>
            {text}
          </span>
        ) : hasBar ? (
          <>
            <span
              className="cs-grid__bar"
              aria-hidden="true"
              style={{ width: `${String(Math.round((barRatio ?? 0) * 100))}%` }}
            />
            <span className="cs-grid__cell-text">{content}</span>
          </>
        ) : (
          content
        ))}
    </div>
  );
}

export const GridCell = memo(GridCellComponent);
