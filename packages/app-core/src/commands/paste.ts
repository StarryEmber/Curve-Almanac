/**
 * `table.paste` (SPEC §13.1, T2.4).
 *
 * The command is the only document mutation for a paste: it applies one
 * all-or-nothing `planPaste` result inside the Immer transaction, so a matrix
 * that transforms rows and appends optional columns cannot leave a half-pasted
 * table behind. IO (encoding, writing the table and manifest) stays in the
 * workspace action and the T2.2 save queue.
 */

import { createAppError, createTimestamp, isId, parseColumnDef } from '@curve/domain';
import type { ColumnDef, UuidFactory } from '@curve/domain';
import { createQueryContext, matchesFilterPredicate } from '@curve/table-engine';

import { planPaste } from '../validation/paste-plan';

import { insertColumnIntoView } from './column-views';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { PasteAnchor } from '../validation/paste-plan';
import type { Draft } from 'immer';

export interface PastePayload {
  tableId: string;
  /** Table view the paste came from; required to validate a filtered view. */
  viewId?: string;
  anchor: PasteAnchor;
  /** Visible column ids in view order; the matrix maps from the anchor inside it. */
  columnIds: string[];
  /** Visible row ids in display order (T2.6); omitted preserves T2.4 semantics. */
  rowIds?: string[];
  /** Raw clipboard matrix; rectangularity and types are validated by the plan. */
  matrix: string[][];
  /** Columns the matrix needs beyond `columnIds`; appended to the schema. */
  newColumns?: ColumnDef[];
}

export interface PasteCommandOptions {
  now?: () => Date;
  uuid?: UuidFactory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw createAppError('E_VALIDATION', message);
}

function parseColumnId(value: unknown): string {
  if (typeof value !== 'string' || !isId('col', value)) {
    invalid('Every target column id must be a valid col id.');
  }
  return value;
}

function parsePayload(payload: unknown): PastePayload {
  if (!isRecord(payload) || typeof payload['tableId'] !== 'string') {
    invalid('table.paste expects { tableId, anchor, columnIds, matrix }.');
  }
  const tableId = payload['tableId'];
  if (!isId('tbl', tableId)) {
    invalid('"tableId" must be a valid tbl id.');
  }

  const anchor = payload['anchor'];
  if (!isRecord(anchor)) {
    invalid('The paste anchor is missing.');
  }
  const rowId = anchor['rowId'];
  if (rowId !== null && (typeof rowId !== 'string' || !isId('row', rowId))) {
    invalid('"anchor.rowId" must be null or a valid row id.');
  }
  const columnId = parseColumnId(anchor['columnId']);

  const rawColumnIds = payload['columnIds'];
  if (!Array.isArray(rawColumnIds) || rawColumnIds.length === 0) {
    invalid('"columnIds" must be a non-empty array.');
  }
  const columnIds = rawColumnIds.map((value: unknown) => parseColumnId(value));

  let viewId: string | undefined;
  const rawViewId = payload['viewId'];
  if (rawViewId !== undefined) {
    if (typeof rawViewId !== 'string' || !isId('viw', rawViewId)) {
      invalid('"viewId" must be a valid viw id when supplied.');
    }
    viewId = rawViewId;
  }

  let rowIds: string[] | undefined;
  const rawRowIds = payload['rowIds'];
  if (rawRowIds !== undefined) {
    if (!Array.isArray(rawRowIds)) {
      invalid('"rowIds" must be an array when supplied.');
    }
    rowIds = rawRowIds.map((value: unknown) => {
      if (typeof value !== 'string' || !isId('row', value)) {
        invalid('Every visible row id must be a valid row id.');
      }
      return value;
    });
  }

  const rawMatrix = payload['matrix'];
  if (!Array.isArray(rawMatrix) || rawMatrix.length === 0) {
    invalid('"matrix" must be a non-empty array of rows.');
  }
  const matrix = rawMatrix.map((row: unknown) => {
    if (!Array.isArray(row) || row.length === 0) {
      invalid('Every pasted row must be a non-empty array of strings.');
    }
    const cells = row.map((cell: unknown) => {
      if (typeof cell !== 'string') {
        invalid('Pasted cells must be strings; parse the clipboard first.');
      }
      return cell;
    });
    return cells;
  });

  let newColumns: ColumnDef[] | undefined;
  const rawColumns = payload['newColumns'];
  if (rawColumns !== undefined) {
    if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
      invalid('"newColumns" must be a non-empty array when supplied.');
    }
    newColumns = rawColumns.map((value: unknown) => {
      const parsed = parseColumnDef(value);
      if (!parsed.ok) {
        invalid('A new paste column definition is invalid.');
      }
      return parsed.data;
    });
  }

  return {
    tableId,
    ...(viewId === undefined ? {} : { viewId }),
    anchor: { rowId: rowId === null ? null : rowId, columnId },
    columnIds,
    ...(rowIds === undefined ? {} : { rowIds }),
    matrix,
    ...(newColumns === undefined ? {} : { newColumns }),
  };
}

function touchWorkspace(draft: Draft<AppState>, timestamp: string): void {
  if (draft.workspace !== null) {
    draft.workspace.updatedAt = timestamp;
  }
}

export function createPasteCommand(
  options: PasteCommandOptions = {},
): CommandDefinition<PastePayload> {
  const now = options.now ?? ((): Date => new Date());
  const uuid = options.uuid;

  return {
    name: 'table.paste',
    parse: parsePayload,
    apply(draft, payload) {
      const data = draft.tables[payload.tableId];
      if (data === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${payload.tableId}`,
        });
      }

      // A filtered view may only receive the rows the user currently sees. The
      // action passes the visible row ids; re-check membership here because a
      // stale preview must not write hidden rows after the filter changed.
      let appendBeyondVisible = true;
      if (payload.viewId !== undefined) {
        const view = draft.views[payload.viewId];
        if (
          view === undefined ||
          view.kind !== 'table' ||
          view.tableView === undefined ||
          view.refId !== payload.tableId
        ) {
          throw createAppError(
            'E_VALIDATION',
            'The paste source view does not belong to the table.',
          );
        }
        const filter = view.tableView.filter;
        if (filter !== undefined) {
          if (payload.rowIds === undefined) {
            throw createAppError(
              'E_VALIDATION',
              'Pasting into a filtered view requires the current visible row order.',
            );
          }
          const anchorIndex =
            payload.anchor.rowId === null ? -1 : payload.rowIds.indexOf(payload.anchor.rowId);
          if (data.rows.length > 0 && anchorIndex < 0) {
            throw createAppError(
              'E_VALIDATION',
              'The paste anchor row is not part of the filtered view.',
            );
          }
          const start = Math.max(0, anchorIndex);
          const targetRows = payload.rowIds.slice(start, start + payload.matrix.length);
          if (targetRows.length < payload.matrix.length) {
            throw createAppError(
              'E_VALIDATION',
              'The pasted matrix is larger than the visible rows of this filtered view.',
              { detail: 'filter-visible-exceeded' },
            );
          }
          const rowById = new Map(data.rows.map((row) => [row.id, row]));
          const context = createQueryContext(data.table);
          for (const rowId of targetRows) {
            const row = rowById.get(rowId);
            if (row === undefined || !matchesFilterPredicate(row, context, filter)) {
              throw createAppError(
                'E_VALIDATION',
                'The filtered view changed while the paste was being prepared.',
                { detail: 'filter-stale' },
              );
            }
          }
          appendBeyondVisible = false;
        }
      }

      const plan = planPaste({
        table: data.table,
        rows: data.rows,
        anchor: payload.anchor,
        columnIds: payload.columnIds,
        matrix: payload.matrix,
        ...(payload.rowIds === undefined ? {} : { rowIds: payload.rowIds, appendBeyondVisible }),
        ...(payload.newColumns === undefined ? {} : { newColumns: payload.newColumns }),
        ...(uuid === undefined ? {} : { uuid }),
      });
      if (!plan.ok) {
        throw plan.error;
      }

      const timestamp = createTimestamp(now());
      data.table = { ...plan.table, updatedAt: timestamp };
      data.rows = plan.rows;

      if (plan.addedColumns.length > 0) {
        for (const view of Object.values(draft.views)) {
          if (
            view.kind !== 'table' ||
            view.refId !== payload.tableId ||
            view.tableView === undefined
          ) {
            continue;
          }
          for (const column of plan.addedColumns) {
            const index = data.table.columns.findIndex((candidate) => candidate.id === column.id);
            if (index >= 0) {
              view.tableView = insertColumnIntoView(view.tableView, column.id, index);
            }
          }
        }
      }

      touchWorkspace(draft, timestamp);
    },
    dirtyTable: (payload) => payload.tableId,
  };
}
