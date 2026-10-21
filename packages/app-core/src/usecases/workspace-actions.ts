/**
 * T2.1 workspace use cases: document commands plus the explicit manifest save
 * required by the "write after every structural operation" decision (ADR-027).
 *
 * Commands stay synchronous and IO-free; this layer owns the ordering:
 * dispatch → write `manifest.json` → move the table file to `.trash/`.
 */

import { createAppError, createColumnId, toAppError } from '@curve/domain';
import type {
  AppError,
  Cell,
  ColumnChangeFailure,
  ColumnDef,
  LayoutNode,
  UuidFactory,
} from '@curve/domain';
import type { WorkspaceStore } from '@curve/persistence';

import { activateViewInLayout } from '../commands/layout';
import {
  createNewTablePayload,
  createOpenTableView,
  type TableCreatePayload,
} from '../commands/tables';
import { defaultAppLogger } from '../logging';
import { stateToManifest } from '../state/manifest';
import { createIdleSaveState } from '../state/store';
import {
  cellIssueToAppError,
  checkTableCellSet,
  unknownCellIssue,
} from '../validation/cell-validation';
import { inspectColumnChange as inspectColumnChangeForState } from '../validation/column-change';
import { checkColumnDraft } from '../validation/column-draft';

import type { SaveQueue } from './save-queue';
import type { CommandBus } from '../commands/types';
import type { ViewPatch } from '../commands/views';
import type { EditHistory } from '../history/edit-history';
import type { AppLogger } from '../logging';
import type { AppStore } from '../state/types';
import type { CellIssue } from '../validation/cell-validation';
import type {
  ColumnChange,
  ColumnChangeInspection,
  ColumnChangeSummary,
} from '../validation/column-change';
import type { ColumnDraft, ColumnDraftIssue } from '../validation/column-draft';

export { stateToManifest } from '../state/manifest';

export type ActionOutcome<T = undefined> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: AppError; readonly issue?: CellIssue };

/**
 * Outcome of a structural column action (T2.3).
 *
 * Failures carry the form issues from `checkColumnDraft` and/or the row-level
 * conversions from the domain plan, so the dialog can explain exactly which
 * rows blocked the change. In every failure case the document is unchanged.
 */
export type ColumnActionOutcome =
  | { readonly ok: true; readonly data: ColumnChangeSummary }
  | {
      readonly ok: false;
      readonly error: AppError;
      readonly issues?: readonly ColumnDraftIssue[];
      readonly failures?: readonly ColumnChangeFailure[];
      readonly totalFailures?: number;
      /** True when the document changed but the follow-up save failed. */
      readonly committed?: boolean;
    };

export interface CellUpdateResult {
  changed: boolean;
  value: Cell;
}

export interface WorkspaceActionsOptions {
  store: AppStore;
  commands: CommandBus;
  workspaceStore: WorkspaceStore;
  history: EditHistory;
  saveQueue: SaveQueue;
  logger?: AppLogger;
  now?: () => Date;
  uuid?: UuidFactory;
}

export interface WorkspaceActions {
  createTable(name: string, primaryKey?: string): Promise<ActionOutcome<TableCreatePayload>>;
  renameTable(tableId: string, name: string): Promise<ActionOutcome>;
  deleteTable(tableId: string): Promise<ActionOutcome>;
  openTable(tableId: string): Promise<ActionOutcome<{ viewId: string; created: boolean }>>;
  activateView(viewId: string): Promise<ActionOutcome>;
  closeView(viewId: string): Promise<ActionOutcome>;
  updateView(viewId: string, patch: ViewPatch): Promise<ActionOutcome>;
  updateCell(
    tableId: string,
    rowId: string,
    columnId: string,
    value: unknown,
  ): Promise<ActionOutcome<CellUpdateResult>>;
  /** Pure preview used by the destructive-confirmation dialogs. */
  inspectColumnChange(change: ColumnChange): ColumnChangeInspection;
  addColumn(tableId: string, draft: ColumnDraft): Promise<ColumnActionOutcome>;
  updateColumn(tableId: string, columnId: string, draft: ColumnDraft): Promise<ColumnActionOutcome>;
  deleteColumn(tableId: string, columnId: string): Promise<ColumnActionOutcome>;
  reorderColumns(tableId: string, columnIds: readonly string[]): Promise<ColumnActionOutcome>;
  changePrimaryKey(tableId: string, columnId: string): Promise<ColumnActionOutcome>;
  undo(): Promise<ActionOutcome>;
  redo(): Promise<ActionOutcome>;
  retrySave(): Promise<ActionOutcome>;
  flushSaves(): Promise<ActionOutcome>;
  saveManifest(): Promise<ActionOutcome>;
  closeWorkspace(): Promise<ActionOutcome>;
}

function emptyLayout(): LayoutNode {
  return { type: 'pane', viewIds: [], activeViewId: null };
}

function cloneLayout(layout: LayoutNode): LayoutNode {
  if (layout.type === 'pane') {
    return { ...layout, viewIds: [...layout.viewIds] };
  }
  return { ...layout, first: cloneLayout(layout.first), second: cloneLayout(layout.second) };
}

function fail(error: AppError): ActionOutcome<never> {
  return { ok: false, error };
}

export function createWorkspaceActions(options: WorkspaceActionsOptions): WorkspaceActions {
  const { store, commands, workspaceStore, history, saveQueue } = options;
  const logger = options.logger ?? defaultAppLogger;
  const now = options.now ?? ((): Date => new Date());
  const uuid = options.uuid;

  const report = (event: string, thrown: unknown): AppError => {
    const error = toAppError(thrown);
    logger.error(event, error);
    store.getState().actions.setError(error);
    return error;
  };

  async function saveManifest(): Promise<ActionOutcome> {
    const state = store.getState();
    const manifest = stateToManifest(state);
    if (manifest === null) {
      return fail(createAppError('E_WS_NOT_FOUND', 'No workspace is open.'));
    }
    try {
      await workspaceStore.writeManifest({ workspaceId: manifest.id, manifest });
      return { ok: true, data: undefined };
    } catch (thrown) {
      return fail(report('failed to write the workspace manifest', thrown));
    }
  }

  async function createTable(
    name: string,
    primaryKey?: string,
  ): Promise<ActionOutcome<TableCreatePayload>> {
    let payload: TableCreatePayload;
    try {
      payload = createNewTablePayload({
        name,
        ...(primaryKey === undefined ? {} : { primaryKey }),
        now: now(),
        ...(uuid === undefined ? {} : { uuid }),
        ...(store.getState().workspace === null
          ? {}
          : { defaultStyleId: store.getState().workspace?.settings.defaultTableStyleId }),
      });
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
    const dispatched = commands.dispatch('table.create', payload);
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const saved = await saveManifest();
    if (!saved.ok) {
      return fail(saved.error);
    }
    return { ok: true, data: payload };
  }

  async function renameTable(tableId: string, name: string): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('table.meta.update', { tableId, name });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return saveManifest();
  }

  async function deleteTable(tableId: string): Promise<ActionOutcome> {
    const state = store.getState();
    const workspace = state.workspace;
    if (workspace === null) {
      return fail(createAppError('E_WS_NOT_FOUND', 'No workspace is open.'));
    }
    const dispatched = commands.dispatch('table.delete', { tableId });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    saveQueue.cancel(tableId);
    // Manifest first: an orphaned table file is harmless, a manifest that still
    // references a trashed file is data loss (ADR-027).
    const saved = await saveManifest();
    if (!saved.ok) {
      return fail(saved.error);
    }
    try {
      await workspaceStore.trash({ workspaceId: workspace.id, tableId });
      return { ok: true, data: undefined };
    } catch (thrown) {
      return fail(report('failed to move the table file to .trash', thrown));
    }
  }

  async function openTable(
    tableId: string,
  ): Promise<ActionOutcome<{ viewId: string; created: boolean }>> {
    const state = store.getState();
    const tableData = state.tables[tableId];
    if (tableData === undefined) {
      return fail(createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.'));
    }
    const existing = Object.values(state.views).find(
      (view) => view.kind === 'table' && view.refId === tableId,
    );
    if (existing !== undefined) {
      const layout = cloneLayout(state.layout);
      activateViewInLayout(layout, existing.id);
      const dispatched = commands.dispatch('view.layout', { layout });
      if (!dispatched.ok) {
        return fail(dispatched.error);
      }
      const saved = await saveManifest();
      if (!saved.ok) {
        return fail(saved.error);
      }
      return { ok: true, data: { viewId: existing.id, created: false } };
    }

    const view = createOpenTableView({
      table: tableData.table,
      now: now(),
      ...(uuid === undefined ? {} : { uuid }),
      ...(state.workspace === null
        ? {}
        : { defaultStyleId: state.workspace.settings.defaultTableStyleId }),
    });
    const dispatched = commands.dispatch('view.create', { view });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const saved = await saveManifest();
    if (!saved.ok) {
      return fail(saved.error);
    }
    return { ok: true, data: { viewId: view.id, created: true } };
  }

  async function activateView(viewId: string): Promise<ActionOutcome> {
    const state = store.getState();
    if (state.views[viewId] === undefined) {
      return fail(createAppError('E_VALIDATION', 'The view does not exist.'));
    }
    const layout = cloneLayout(state.layout);
    activateViewInLayout(layout, viewId);
    const dispatched = commands.dispatch('view.layout', { layout });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return saveManifest();
  }

  async function closeView(viewId: string): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('view.delete', { viewId });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return saveManifest();
  }

  async function updateView(viewId: string, patch: ViewPatch): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('view.update', { viewId, patch });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return saveManifest();
  }

  async function updateCell(
    tableId: string,
    rowId: string,
    columnId: string,
    value: unknown,
  ): Promise<ActionOutcome<CellUpdateResult>> {
    const check = checkTableCellSet(store.getState(), { tableId, rowId, columnId, value });
    if (!check.ok) {
      store.getState().actions.setEditIssue(check.issue);
      return { ok: false, error: cellIssueToAppError(check.issue), issue: check.issue };
    }
    if (!check.changed) {
      store.getState().actions.setEditIssue(null);
      return { ok: true, data: { changed: false, value: check.value } };
    }

    const dispatched = commands.dispatch('table.cell.set', {
      tableId,
      rowId,
      columnId,
      value,
    });
    if (!dispatched.ok) {
      const issue = unknownCellIssue(dispatched.error);
      store.getState().actions.setEditIssue(issue);
      return { ok: false, error: dispatched.error, issue };
    }
    store.getState().actions.setEditIssue(null);
    return { ok: true, data: { changed: check.changed, value: check.value } };
  }

  function failColumn(
    error: AppError,
    issues?: readonly ColumnDraftIssue[],
    failures?: readonly ColumnChangeFailure[],
    totalFailures?: number,
  ): ColumnActionOutcome {
    return {
      ok: false,
      error,
      ...(issues === undefined ? {} : { issues }),
      ...(failures === undefined ? {} : { failures }),
      ...(totalFailures === undefined ? {} : { totalFailures }),
    };
  }

  function failDraft(issues: readonly ColumnDraftIssue[]): ColumnActionOutcome {
    return failColumn(createAppError('E_VALIDATION', 'The column definition is invalid.'), issues);
  }

  function failInspection(inspection: ColumnChangeInspection): ColumnActionOutcome {
    if (inspection.ok) {
      return failColumn(createAppError('E_UNKNOWN', 'The column change preview was invalid.'));
    }
    return failColumn(inspection.error, undefined, inspection.failures, inspection.totalFailures);
  }

  /**
   * Persists a structural change: row-affecting commands go through the T2.2
   * save queue (table first, manifest last); schema-only changes write just the
   * manifest, so an empty table never creates a 0-byte JSONL file (ADR-027).
   */
  async function persistColumnChange(
    tableId: string,
    tableRowsChanged: boolean,
    summary: ColumnChangeSummary,
  ): Promise<ColumnActionOutcome> {
    if (!tableRowsChanged) {
      const saved = await saveManifest();
      return saved.ok
        ? { ok: true, data: summary }
        : { ok: false, error: saved.error, committed: true };
    }
    saveQueue.enqueue(tableId);
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: summary }
      : { ok: false, error: flushed.error, committed: true };
  }

  function preserveFieldType(column: ColumnDef, current: ColumnDef | undefined): ColumnDef {
    if (
      current !== undefined &&
      current.fieldTypeId !== undefined &&
      current.type === column.type
    ) {
      return { ...column, fieldTypeId: current.fieldTypeId };
    }
    return column;
  }

  function inspectColumnChange(change: ColumnChange): ColumnChangeInspection {
    return inspectColumnChangeForState(store.getState(), change);
  }

  async function addColumn(tableId: string, draft: ColumnDraft): Promise<ColumnActionOutcome> {
    const state = store.getState();
    const tableData = state.tables[tableId];
    if (tableData === undefined) {
      return failColumn(
        createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${tableId}`,
        }),
      );
    }

    const columnId = createColumnId(uuid);
    const checked = checkColumnDraft(tableData.table, draft, columnId);
    if (!checked.ok) {
      return failDraft(checked.issues);
    }
    const change: ColumnChange = { kind: 'add', tableId, column: checked.column };
    const inspection = inspectColumnChange(change);
    if (!inspection.ok) {
      return failInspection(inspection);
    }

    const dispatched = commands.dispatch('table.column.add', {
      tableId,
      column: checked.column,
    });
    if (!dispatched.ok) {
      return failColumn(dispatched.error);
    }
    return persistColumnChange(tableId, tableData.rows.length > 0, inspection.summary);
  }

  async function updateColumn(
    tableId: string,
    columnId: string,
    draft: ColumnDraft,
  ): Promise<ColumnActionOutcome> {
    const state = store.getState();
    const tableData = state.tables[tableId];
    if (tableData === undefined) {
      return failColumn(
        createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${tableId}`,
        }),
      );
    }
    const current = tableData.table.columns.find((column) => column.id === columnId);
    if (current === undefined) {
      return failColumn(
        createAppError('E_VALIDATION', 'The column does not exist.', {
          detail: `column=${columnId}`,
        }),
      );
    }

    const checked = checkColumnDraft(tableData.table, draft, columnId);
    if (!checked.ok) {
      return failDraft(checked.issues);
    }
    const column = preserveFieldType(checked.column, current);
    const change: ColumnChange = { kind: 'update', tableId, column };
    const inspection = inspectColumnChange(change);
    if (!inspection.ok) {
      return failInspection(inspection);
    }

    const dispatched = commands.dispatch('table.column.update', { tableId, column });
    if (!dispatched.ok) {
      return failColumn(dispatched.error);
    }
    return persistColumnChange(tableId, inspection.summary.convertedCells > 0, inspection.summary);
  }

  async function deleteColumn(tableId: string, columnId: string): Promise<ColumnActionOutcome> {
    const state = store.getState();
    const tableData = state.tables[tableId];
    if (tableData === undefined) {
      return failColumn(
        createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${tableId}`,
        }),
      );
    }
    const inspection = inspectColumnChange({ kind: 'delete', tableId, columnId });
    if (!inspection.ok) {
      return failInspection(inspection);
    }

    const dispatched = commands.dispatch('table.column.delete', { tableId, columnId });
    if (!dispatched.ok) {
      return failColumn(dispatched.error);
    }
    return persistColumnChange(tableId, tableData.rows.length > 0, inspection.summary);
  }

  async function reorderColumns(
    tableId: string,
    columnIds: readonly string[],
  ): Promise<ColumnActionOutcome> {
    const state = store.getState();
    const tableData = state.tables[tableId];
    if (tableData === undefined) {
      return failColumn(
        createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${tableId}`,
        }),
      );
    }
    const inspection = inspectColumnChange({ kind: 'reorder', tableId, columnIds });
    if (!inspection.ok) {
      return failInspection(inspection);
    }

    const currentOrder = tableData.table.columns.map((column) => column.id);
    const orderChanged =
      columnIds.length !== currentOrder.length ||
      columnIds.some((columnId, index) => columnId !== currentOrder[index]);

    const dispatched = commands.dispatch('table.column.reorder', { tableId, columnIds });
    if (!dispatched.ok) {
      return failColumn(dispatched.error);
    }
    return persistColumnChange(
      tableId,
      tableData.rows.length > 0 && orderChanged,
      inspection.summary,
    );
  }

  async function changePrimaryKey(tableId: string, columnId: string): Promise<ColumnActionOutcome> {
    const state = store.getState();
    if (state.tables[tableId] === undefined) {
      return failColumn(
        createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${tableId}`,
        }),
      );
    }
    const inspection = inspectColumnChange({ kind: 'primary-key', tableId, columnId });
    if (!inspection.ok) {
      return failInspection(inspection);
    }

    const dispatched = commands.dispatch('table.meta.update', { tableId, primaryKey: columnId });
    if (!dispatched.ok) {
      return failColumn(dispatched.error);
    }
    const saved = await saveManifest();
    return saved.ok
      ? { ok: true, data: inspection.summary }
      : { ok: false, error: saved.error, committed: true };
  }

  async function undo(): Promise<ActionOutcome> {
    if (!history.undo()) {
      return fail(createAppError('E_VALIDATION', 'There is nothing to undo.'));
    }
    return { ok: true, data: undefined };
  }

  async function redo(): Promise<ActionOutcome> {
    if (!history.redo()) {
      return fail(createAppError('E_VALIDATION', 'There is nothing to redo.'));
    }
    return { ok: true, data: undefined };
  }

  async function retrySave(): Promise<ActionOutcome> {
    saveQueue.retry();
    return { ok: true, data: undefined };
  }

  async function flushSaves(): Promise<ActionOutcome> {
    const outcome = await saveQueue.flush();
    return outcome.ok ? { ok: true, data: undefined } : fail(outcome.error);
  }

  async function closeWorkspace(): Promise<ActionOutcome> {
    const state = store.getState();
    if (state.workspace === null) {
      return { ok: true, data: undefined };
    }
    const flushed = await flushSaves();
    if (!flushed.ok) {
      return fail(flushed.error);
    }
    try {
      await workspaceStore.close({ workspaceId: state.workspace.id });
    } catch (thrown) {
      return fail(report('failed to close the workspace', thrown));
    }
    history.clear();
    saveQueue.reset();
    store.setState({
      workspace: null,
      tables: {},
      views: {},
      charts: {},
      tableStyles: {},
      layout: emptyLayout(),
      ui: {
        activeTableId: null,
        activeViewId: null,
        error: null,
        dirtyTables: [],
        save: createIdleSaveState(),
        editIssue: null,
      },
    });
    store.getState().actions.clearAllDirty();
    return { ok: true, data: undefined };
  }

  return {
    createTable,
    renameTable,
    deleteTable,
    openTable,
    activateView,
    closeView,
    updateView,
    updateCell,
    inspectColumnChange,
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    changePrimaryKey,
    undo,
    redo,
    retrySave,
    flushSaves,
    saveManifest,
    closeWorkspace,
  };
}
