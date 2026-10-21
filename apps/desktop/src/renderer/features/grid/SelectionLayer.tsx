/** Screen-reader summary for the rectangular selection (SPEC §9.1). */

import type { ReactElement } from 'react';

export interface SelectionLayerProps {
  rows: number;
  columns: number;
  label: string;
}

export function SelectionLayer({ rows, columns, label }: SelectionLayerProps): ReactElement {
  return (
    <div
      className="cs-grid__selection"
      role="status"
      aria-live="polite"
      data-selected-rows={rows}
      data-selected-columns={columns}
    >
      {label}
    </div>
  );
}
