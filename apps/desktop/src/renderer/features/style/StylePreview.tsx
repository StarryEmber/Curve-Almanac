/**
 * First-50-rows preview for the style editor (T3.4, SPEC §10.5).
 *
 * It deliberately reuses the production presentation pipeline (`TableStyleProvider`,
 * `GridCell`, `presentStyledCell`, `createConditionalFormat`) instead of growing a
 * second renderer. Only the 50 supplied rows are mounted; there is no virtualiser.
 */

import { useMemo } from 'react';

import { createConditionalFormat } from '@curve/domain';
import type { Cell, ColumnDef, Row, TableMeta, TableStyle, ViewDef } from '@curve/domain';
import {
  TableStyleProvider,
  columnDisplayLabel,
  computeBarRanges,
  conditionalCellStyle,
  presentStyledCell,
  resolveCellAlign,
  tableRowHeight,
} from '@curve/ui';

import { useI18n } from '../../i18n';
import { GridCell } from '../grid/GridCell';

import type { CSSProperties, ReactElement } from 'react';

export const STYLE_PREVIEW_ROWS = 50;

const DEFAULT_COLUMN_WIDTH = 160;

const noopActivate = (): void => undefined;
const noopBeginEdit = (): void => undefined;

export interface StylePreviewProps {
  table: TableMeta;
  view: ViewDef;
  tableStyle: TableStyle;
  rows: readonly Row[];
  /** Milliseconds between the local draft change and its committed render. */
  previewMs: number | null;
  displayName: string;
}

function visibleColumnsFor(table: TableMeta, view: ViewDef): DomainColumn[] {
  const tableView = view.tableView;
  if (tableView === undefined) {
    return [...table.columns];
  }
  const byId = new Map(table.columns.map((column) => [column.id, column]));
  const hidden = new Set(tableView.hiddenColumnIds);
  const columns: DomainColumn[] = [];
  for (const columnId of tableView.columnOrder) {
    if (hidden.has(columnId)) {
      continue;
    }
    const column = byId.get(columnId);
    if (column !== undefined) {
      columns.push(column);
    }
  }
  return columns;
}

type DomainColumn = ColumnDef;

export function StylePreview({
  table,
  view,
  tableStyle,
  rows,
  previewMs,
  displayName,
}: StylePreviewProps): ReactElement {
  const { locale, t } = useI18n();
  const columns = useMemo(() => visibleColumnsFor(table, view), [table, view]);
  const previewRows = rows.slice(0, STYLE_PREVIEW_ROWS);
  const rowHeight = tableRowHeight(tableStyle.tokens);
  const sizes = columns.map(
    (column) =>
      view.tableView?.widths[column.id] ??
      tableStyle.columnOverrides[column.id]?.width ??
      column.width ??
      DEFAULT_COLUMN_WIDTH,
  );
  const totalWidth = sizes.reduce((sum, width) => sum + width, 0);
  const barRanges = useMemo(
    () => computeBarRanges(previewRows, table.columns, tableStyle),
    [previewRows, table.columns, tableStyle],
  );
  const conditionalFormat = useMemo(
    () => createConditionalFormat(tableStyle.conditionalRules, table.columns, { locale }),
    [locale, table.columns, tableStyle.conditionalRules],
  );
  const columnIndexById = useMemo(
    () => new Map(table.columns.map((column, index) => [column.id, index])),
    [table.columns],
  );

  return (
    <TableStyleProvider
      tableStyle={tableStyle}
      className="cs-style-preview__surface"
      data-testid="style-preview"
      data-preview-ms={previewMs === null ? '' : String(Math.round(previewMs))}
      data-preview-rows={previewRows.length}
      aria-label={t('style.preview.label')}
    >
      <div className="cs-style-preview__meta">
        <span>{t('style.preview.count', { count: previewRows.length })}</span>
        <span className="cs-style-preview__name">{displayName}</span>
      </div>
      <div
        className="cs-style-preview__scroll"
        role="grid"
        aria-label={t('style.preview.label')}
        aria-rowcount={previewRows.length + 1}
        aria-colcount={columns.length}
      >
        <div className="cs-style-preview__canvas" style={{ width: totalWidth }}>
          <div role="row" className="cs-grid__header-row">
            {columns.map((column, index) => {
              const width = sizes[index] ?? DEFAULT_COLUMN_WIDTH;
              return (
                <div
                  key={column.id}
                  role="columnheader"
                  className="cs-grid__header-cell"
                  style={{ width, minWidth: width, maxWidth: width }}
                  data-column-id={column.id}
                  data-align={resolveCellAlign(column, tableStyle)}
                >
                  <span className="cs-grid__header-label">
                    {columnDisplayLabel(column, tableStyle)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="cs-grid__body">
            {previewRows.length === 0 ? (
              <p className="cs-grid__empty">{t('style.preview.empty')}</p>
            ) : (
              previewRows.map((row, rowIndex) => {
                const conditionalRow = conditionalFormat.evaluateRow(row);
                const rowStyle: CSSProperties & Record<'--cs-row-bg', string> = {
                  height: rowHeight,
                  minHeight: rowHeight,
                  '--cs-row-bg':
                    rowIndex % 2 === 1 ? 'var(--cs-table-row-alt-bg)' : 'var(--cs-table-row-bg)',
                };
                return (
                  <div
                    key={row.id}
                    role="row"
                    aria-rowindex={rowIndex + 2}
                    className="cs-grid__row"
                    style={rowStyle}
                    data-testid={`preview-row-${rowIndex}`}
                  >
                    {columns.map((column, colIndex) => {
                      const valueIndex = columnIndexById.get(column.id) ?? 0;
                      const value: Cell = row.values[valueIndex] ?? null;
                      const presentation = presentStyledCell(value, column, tableStyle, barRanges, {
                        locale,
                        trueLabel: t('grid.editor.true'),
                        falseLabel: t('grid.editor.false'),
                      });
                      const match = conditionalRow.cellRule(column.id);
                      const conditional = conditionalCellStyle(match, {
                        includeIcon: match?.target === 'cell' || colIndex === 0,
                      });
                      return (
                        <GridCell
                          key={column.id}
                          rowIndex={rowIndex}
                          colIndex={colIndex}
                          rowId={row.id}
                          columnId={column.id}
                          text={presentation.text}
                          align={presentation.align}
                          render={presentation.render}
                          barRatio={presentation.barRatio}
                          badgeTone={presentation.badgeTone}
                          width={sizes[colIndex] ?? DEFAULT_COLUMN_WIDTH}
                          stickyLeft={null}
                          active={false}
                          selected={false}
                          editing={false}
                          conditional={conditional}
                          conditionalIconLabel={
                            conditional?.icon === 'up'
                              ? t('grid.ruleIcon.up')
                              : conditional?.icon === 'down'
                                ? t('grid.ruleIcon.down')
                                : conditional?.icon === 'warning'
                                  ? t('grid.ruleIcon.warning')
                                  : undefined
                          }
                          testIdPrefix="preview-cell"
                          onActivate={noopActivate}
                          onBeginEdit={noopBeginEdit}
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
    </TableStyleProvider>
  );
}
