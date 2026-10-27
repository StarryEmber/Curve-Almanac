/**
 * T2.1 workspace use cases: document commands plus the explicit manifest save
 * required by the "write after every structural operation" decision (ADR-027).
 *
 * Commands stay synchronous and IO-free; this layer owns the ordering:
 * dispatch → write `manifest.json` → move the table file to `.trash/`.
 */

import {
  createAppError,
  createColumnId,
  createViewId,
  listBuiltinStyles,
  MAX_PANES,
  reassignStyleIdentity,
  styleCopyName,
  toAppError,
} from '@curve/domain';
import type {
  AppError,
  Cell,
  ChartKind,
  ChartMapping,
  ChartOptions,
  ChartSpec,
  ColumnChangeFailure,
  ColumnDef,
  FilterPredicate,
  LayoutNode,
  Row,
  SortSpec,
  TableStyle,
  UuidFactory,
  ViewDef,
} from '@curve/domain';
import type { WorkspaceStore } from '@curve/persistence';
import { parseClipboardText } from '@curve/table-engine';
import type { ClipboardMatrix } from '@curve/table-engine';

import { createNewChartPayload, duplicateChartTitle } from '../commands/charts';
import {
  activateViewInLayout,
  countPanes,
  findPaneEntry,
  findPaneForViewEntry,
  listPaneEntries,
  moveViewToPane,
  panePathForView,
  removePaneFromLayout,
  setSplitRatio,
  splitPaneInLayout,
} from '../commands/layout';
import { styleFallbackId } from '../commands/styles';
import {
  createNewTablePayload,
  createOpenTableView,
  type TableCreatePayload,
} from '../commands/tables';
import { createDuplicateTableView } from '../commands/view-copy';
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
import { createPastePlanner, planPaste } from '../validation/paste-plan';

import type { SaveQueue } from './save-queue';
import type { ChartCreatePayload } from '../commands/charts';
import type { StyleApplyTarget } from '../commands/styles';
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
import type { PasteIssue, PastePlanSuccess } from '../validation/paste-plan';

export { stateToManifest } from '../state/manifest';

export type ActionOutcome<T = undefined> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: AppError;
      readonly issue?: CellIssue;
      /** True when the document changed but the follow-up save failed. */
      readonly committed?: boolean;
    };

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

/** Matrices at or above this many cells show the cancellable progress dialog. */
export const PASTE_PROGRESS_THRESHOLD = 10_000;

/** Cells processed between event-loop yields in the paste preview. */
export const DEFAULT_PASTE_CHUNK_CELLS = 2_000;

export interface PasteRequestBase {
  tableId: string;
  viewId: string;
  /** Visible column ids in view order; the matrix maps from the anchor inside it. */
  columnIds: readonly string[];
  /** Visible row ids in display order (T2.6 filtered/sorted paste). */
  rowIds?: readonly string[];
  anchor: { rowId: string | null; columnId: string };
}

export interface PastePrepareRequest extends PasteRequestBase {
  text: string;
  /** Definitions for columns the matrix needs beyond `columnIds`. */
  newColumns?: readonly ColumnDef[];
}

export interface PasteApplyRequest extends PasteRequestBase {
  matrix: readonly (readonly string[])[];
  newColumns?: readonly ColumnDef[];
}

export interface PasteProgress {
  processedRows: number;
  totalRows: number;
  /** Cells processed so far and in total, for the progress dialog. */
  done: number;
  total: number;
}

export interface PastePrepareOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PasteProgress) => void;
  /** Internal/test hook: cells per chunk (default 2,000). */
  chunkCells?: number;
  /** Internal/test hook: yield between chunks (default `setTimeout(0)`). */
  yieldControl?: () => Promise<void>;
}

export type PasteBlockReason = 'filter-active' | 'filter-visible-exceeded' | 'filter-anchor-hidden';

export type PastePrepareOutcome =
  | {
      readonly ok: true;
      readonly data: {
        readonly matrix: ClipboardMatrix;
        readonly plan: PastePlanSuccess;
        readonly large: boolean;
      };
    }
  | {
      readonly ok: false;
      readonly kind: 'needs-columns';
      readonly matrix: ClipboardMatrix;
      readonly newColumnsRequired: number;
      readonly large: boolean;
    }
  | { readonly ok: false; readonly kind: 'empty' }
  | { readonly ok: false; readonly kind: 'cancelled' }
  | {
      readonly ok: false;
      readonly kind: 'blocked';
      readonly error: AppError;
      readonly reason: PasteBlockReason;
    }
  | {
      readonly ok: false;
      readonly kind: 'invalid';
      readonly error: AppError;
      readonly issues: readonly PasteIssue[];
      readonly totalIssues: number;
      readonly matrix?: ClipboardMatrix;
      readonly large: boolean;
    };

export type PasteApplyOutcome =
  | { readonly ok: true; readonly data: undefined }
  | {
      readonly ok: false;
      readonly error: AppError;
      readonly issues?: readonly PasteIssue[];
      readonly totalIssues?: number;
      /** True when the document changed but the follow-up save failed. */
      readonly committed?: boolean;
    };

/** Source metadata returned by `file:importText` and archived at commit time. */
export interface ImportSource {
  token: string;
  name: string;
  sha256: string;
  size: number;
  encoding: string;
  format: 'csv' | 'json';
}

export interface ImportArchiveRequest extends ImportSource {
  workspaceId: string;
  tableId: string;
  mode: 'append' | 'replace';
}

export interface ImportArchiveResult {
  copied: boolean;
  /** Workspace-relative path, or null when the file exceeded the copy limit. */
  archivePath: string | null;
  sidecarPath: string;
}

export interface ImportApplyRequest {
  tableId: string;
  mode: 'append' | 'replace';
  rows: readonly Row[];
  newColumns?: readonly ColumnDef[];
  source: ImportSource;
}

export type ImportApplyOutcome =
  | { readonly ok: true; readonly data: ImportArchiveResult }
  | {
      readonly ok: false;
      readonly error: AppError;
      /** True when the document changed but the follow-up save failed. */
      readonly committed?: boolean;
    };

/** New-chart wizard input (T4.4); ids/timestamps/defaults are built in app-core. */
export interface ChartCreateRequest {
  tableId: string;
  /** Defaults to the table name in the wizard; must be 1–80 characters. */
  title: string;
  kind: ChartKind;
  mapping: ChartMapping;
  /** Merged over `DEFAULT_CHART_OPTIONS`. */
  options?: Partial<ChartOptions>;
  filter?: FilterPredicate;
  sort?: SortSpec[];
}

export interface WorkspaceActionsOptions {
  store: AppStore;
  commands: CommandBus;
  workspaceStore: WorkspaceStore;
  history: EditHistory;
  saveQueue: SaveQueue;
  /** Main-process archive writer; omitted in tests that do not import files. */
  archiveImport?: (request: ImportArchiveRequest) => Promise<ImportArchiveResult>;
  logger?: AppLogger;
  now?: () => Date;
  uuid?: UuidFactory;
  /** Debounce for layout-only manifest writes (T5.1; default 500 ms). */
  layoutSaveDelayMs?: number;
}

export type PaneDirection = 'horizontal' | 'vertical';

/** T5.1: layout-only changes are coalesced into one manifest write. */
export const LAYOUT_SAVE_DELAY_MS = 500;

export interface WorkspaceActions {
  createTable(name: string, primaryKey?: string): Promise<ActionOutcome<TableCreatePayload>>;
  renameTable(tableId: string, name: string): Promise<ActionOutcome>;
  deleteTable(tableId: string): Promise<ActionOutcome>;
  openTable(tableId: string): Promise<ActionOutcome<{ viewId: string; created: boolean }>>;
  activateView(viewId: string): Promise<ActionOutcome>;
  closeView(viewId: string): Promise<ActionOutcome>;
  /** Splits the focused pane; the new second pane starts empty (T5.1). */
  splitPane(direction: PaneDirection): Promise<ActionOutcome>;
  /** Closes the focused pane; the last pane cannot be closed (T5.1). */
  closePane(): Promise<ActionOutcome>;
  /** Moves one view to the next pane in visual order (T5.1, v1 move menu). */
  moveViewToNextPane(viewId: string): Promise<ActionOutcome>;
  /** Sets a split ratio (0.2–0.8) for a pane path (T5.1). */
  setLayoutRatio(splitPath: string, ratio: number): Promise<ActionOutcome>;
  updateView(viewId: string, patch: ViewPatch): Promise<ActionOutcome>;
  /**
   * Creates a user style and optionally applies it to a table view (T3.4).
   * One command and one undo entry, manifest-only.
   */
  createTableStyle(style: TableStyle, viewId?: string): Promise<ActionOutcome<{ styleId: string }>>;
  /** Replaces one persisted user style; manifest-only and undoable (T3.3). */
  updateTableStyle(style: TableStyle): Promise<ActionOutcome>;
  /**
   * Deletes a user style and points every referencing view at the fallback
   * template in the same command (T3.5). Undo restores style and references.
   */
  deleteTableStyle(
    styleId: string,
  ): Promise<ActionOutcome<{ fallbackStyleId: string; affectedViewIds: readonly string[] }>>;
  /** Applies a style to one table view or to the workspace default (T3.5). */
  applyTableStyle(styleId: string, target: StyleApplyTarget): Promise<ActionOutcome>;
  /** Copies a persisted style (or builtin) under a fresh ` (2)` identity (T3.5). */
  duplicateTableStyle(styleId: string): Promise<ActionOutcome<{ styleId: string; name: string }>>;
  /** Creates a chart and its first view in one command (T4.4). */
  createChart(
    request: ChartCreateRequest,
  ): Promise<ActionOutcome<{ chartId: string; viewId: string }>>;
  /** Replaces one chart definition; manifest-only and undoable (T4.4). */
  updateChart(chart: ChartSpec): Promise<ActionOutcome>;
  /** Deletes a chart and every view that shows it, in one command (T4.4). */
  deleteChart(chartId: string): Promise<ActionOutcome>;
  /** Copies a chart under a fresh id/title and opens a new chart view (T4.4). */
  duplicateChart(chartId: string): Promise<ActionOutcome<{ chartId: string; viewId: string }>>;
  /** Activates the chart's view, creating one when the tab was closed (T4.4). */
  openChart(chartId: string): Promise<ActionOutcome<{ viewId: string; created: boolean }>>;
  /** Copies the current table view (filter/sort/widths/frozen) into a new tab. */
  duplicateView(viewId: string): Promise<ActionOutcome<{ viewId: string }>>;
  updateCell(
    tableId: string,
    rowId: string,
    columnId: string,
    value: unknown,
  ): Promise<ActionOutcome<CellUpdateResult>>;
  /** Parses and validates a clipboard matrix without touching the document. */
  preparePaste(
    request: PastePrepareRequest,
    options?: PastePrepareOptions,
  ): Promise<PastePrepareOutcome>;
  /** Applies one `table.paste` command and flushes the save queue. */
  applyPaste(request: PasteApplyRequest): Promise<PasteApplyOutcome>;
  /**
   * Archives the original import file, applies one `table.import` command and
   * waits for the save queue. Archive failures abort before dispatch.
   */
  applyImport(request: ImportApplyRequest): Promise<ImportApplyOutcome>;
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
  const { store, commands, workspaceStore, history, saveQueue, archiveImport } = options;
  const logger = options.logger ?? defaultAppLogger;
  const now = options.now ?? ((): Date => new Date());
  const uuid = options.uuid;

  const report = (event: string, thrown: unknown): AppError => {
    const error = toAppError(thrown);
    logger.error(event, error);
    store.getState().actions.setError(error);
    return error;
  };

  const layoutSaveDelayMs = options.layoutSaveDelayMs ?? LAYOUT_SAVE_DELAY_MS;
  let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null;

  const clearLayoutSave = (): void => {
    if (layoutSaveTimer !== null) {
      clearTimeout(layoutSaveTimer);
      layoutSaveTimer = null;
    }
  };

  const flushLayoutSave = (): void => {
    if (layoutSaveTimer === null) {
      return;
    }
    clearTimeout(layoutSaveTimer);
    layoutSaveTimer = null;
    saveQueue.enqueueManifest();
  };

  /** Coalesces layout-only changes (T5.1: drag/split/tab focus) into one write. */
  const scheduleLayoutSave = (): ActionOutcome => {
    if (store.getState().workspace === null) {
      return fail(createAppError('E_WS_NOT_FOUND', 'No workspace is open.'));
    }
    clearLayoutSave();
    layoutSaveTimer = setTimeout(() => {
      layoutSaveTimer = null;
      saveQueue.enqueueManifest();
    }, layoutSaveDelayMs);
    return { ok: true, data: undefined };
  };

  async function saveManifest(): Promise<ActionOutcome> {
    clearLayoutSave();
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
      const panePath = activateViewInLayout(layout, existing.id, state.ui.activePanePath);
      const dispatched = commands.dispatch('view.layout', { layout, activePanePath: panePath });
      if (!dispatched.ok) {
        return fail(dispatched.error);
      }
      const scheduled = scheduleLayoutSave();
      if (!scheduled.ok) {
        return scheduled;
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
    const panePath = activateViewInLayout(layout, viewId, state.ui.activePanePath);
    const dispatched = commands.dispatch('view.layout', { layout, activePanePath: panePath });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return scheduleLayoutSave();
  }

  async function splitPane(direction: PaneDirection): Promise<ActionOutcome> {
    const state = store.getState();
    const activePath =
      state.ui.activePanePath === null
        ? null
        : findPaneEntry(state.layout, state.ui.activePanePath);
    if (activePath === null) {
      return fail(createAppError('E_VALIDATION', 'No pane is focused.'));
    }
    if (countPanes(state.layout) >= MAX_PANES) {
      return fail(
        createAppError('E_VALIDATION', `A layout may contain at most ${String(MAX_PANES)} panes.`),
      );
    }
    let split: { layout: LayoutNode; panePath: string };
    try {
      split = splitPaneInLayout(state.layout, activePath.path, direction);
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
    const dispatched = commands.dispatch('view.layout', {
      layout: split.layout,
      activePanePath: split.panePath,
    });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return scheduleLayoutSave();
  }

  async function closePane(): Promise<ActionOutcome> {
    const state = store.getState();
    const activePath =
      state.ui.activePanePath === null
        ? null
        : findPaneEntry(state.layout, state.ui.activePanePath);
    if (activePath === null) {
      return fail(createAppError('E_VALIDATION', 'No pane is focused.'));
    }
    if (countPanes(state.layout) <= 1) {
      return fail(createAppError('E_VALIDATION', 'The last pane cannot be closed.'));
    }
    if (activePath.pane.viewIds.length > 0) {
      return fail(createAppError('E_VALIDATION', 'Close the pane tabs before closing the pane.'));
    }
    let layout: LayoutNode;
    try {
      layout = removePaneFromLayout(state.layout, activePath.path);
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
    const remaining = listPaneEntries(layout);
    const nextPath =
      remaining.find((entry) => entry.pane.viewIds.length === 0)?.path ??
      remaining[0]?.path ??
      null;
    const dispatched = commands.dispatch('view.layout', {
      layout,
      activePanePath: nextPath,
    });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return scheduleLayoutSave();
  }

  async function moveViewToNextPane(viewId: string): Promise<ActionOutcome> {
    const state = store.getState();
    const entries = listPaneEntries(state.layout);
    const source = findPaneForViewEntry(state.layout, viewId);
    if (source === null) {
      return fail(createAppError('E_VALIDATION', 'The view is not in the layout.'));
    }
    if (entries.length < 2) {
      return fail(createAppError('E_VALIDATION', 'There is only one pane.'));
    }
    const index = entries.findIndex((entry) => entry.path === source.path);
    const target = entries[(index + 1) % entries.length];
    if (target === undefined) {
      return fail(createAppError('E_VALIDATION', 'The next pane does not exist.'));
    }
    let layout: LayoutNode;
    try {
      layout = moveViewToPane(state.layout, viewId, target.path);
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
    const focusPath = panePathForView(layout, viewId) ?? target.path;
    const dispatched = commands.dispatch('view.layout', {
      layout,
      activePanePath: focusPath,
    });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return scheduleLayoutSave();
  }

  async function setLayoutRatio(splitPath: string, ratio: number): Promise<ActionOutcome> {
    if (!Number.isFinite(ratio) || ratio < 0.2 || ratio > 0.8) {
      return fail(createAppError('E_VALIDATION', 'The split ratio must be between 0.2 and 0.8.'));
    }
    const state = store.getState();
    let layout: LayoutNode;
    try {
      layout = setSplitRatio(state.layout, splitPath, ratio);
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
    const dispatched = commands.dispatch('view.layout', {
      layout,
      activePanePath: state.ui.activePanePath,
    });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    return scheduleLayoutSave();
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

  async function createTableStyle(
    style: TableStyle,
    viewId?: string,
  ): Promise<ActionOutcome<{ styleId: string }>> {
    const dispatched = commands.dispatch('style.create', {
      style,
      ...(viewId === undefined ? {} : { viewId }),
    });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: { styleId: style.id } }
      : { ok: false, error: flushed.error, committed: true };
  }

  async function updateTableStyle(style: TableStyle): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('style.update', { style });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: undefined }
      : { ok: false, error: flushed.error, committed: true };
  }

  async function deleteTableStyle(
    styleId: string,
  ): Promise<ActionOutcome<{ fallbackStyleId: string; affectedViewIds: readonly string[] }>> {
    const state = store.getState();
    const style = state.tableStyles[styleId];
    if (style === undefined) {
      return fail(createAppError('E_VALIDATION', 'The table style does not exist.'));
    }
    if (style.builtin) {
      return fail(createAppError('E_VALIDATION', 'Builtin styles cannot be deleted.'));
    }
    const affectedViewIds = Object.values(state.views)
      .filter(
        (view) =>
          view.kind === 'table' &&
          view.tableView !== undefined &&
          view.tableView.styleId === styleId,
      )
      .map((view) => view.id);
    const fallbackStyleId = styleFallbackId(state, styleId);
    const dispatched = commands.dispatch('style.delete', { styleId });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: { fallbackStyleId, affectedViewIds } }
      : { ok: false, error: flushed.error, committed: true };
  }

  async function applyTableStyle(
    styleId: string,
    target: StyleApplyTarget,
  ): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('style.apply', { styleId, target });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: undefined }
      : { ok: false, error: flushed.error, committed: true };
  }

  async function duplicateTableStyle(
    styleId: string,
  ): Promise<ActionOutcome<{ styleId: string; name: string }>> {
    const state = store.getState();
    const source = state.tableStyles[styleId];
    if (source === undefined) {
      return fail(createAppError('E_VALIDATION', 'The table style does not exist.'));
    }
    const names = [
      ...listBuiltinStyles().map((style) => style.name),
      ...Object.values(state.tableStyles).map((style) => style.name),
    ];
    const copy = reassignStyleIdentity(source, {
      name: styleCopyName(source.name, names),
      ...(uuid === undefined ? {} : { uuid }),
    });
    const dispatched = commands.dispatch('style.create', { style: copy });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: { styleId: copy.id, name: copy.name } }
      : { ok: false, error: flushed.error, committed: true };
  }

  async function createChart(
    request: ChartCreateRequest,
  ): Promise<ActionOutcome<{ chartId: string; viewId: string }>> {
    const state = store.getState();
    const tableData = state.tables[request.tableId];
    if (tableData === undefined) {
      return fail(
        createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${request.tableId}`,
        }),
      );
    }
    let payload: ChartCreatePayload;
    try {
      payload = createNewChartPayload({
        table: tableData.table,
        title: request.title,
        kind: request.kind,
        mapping: request.mapping,
        ...(request.options === undefined ? {} : { options: request.options }),
        ...(request.filter === undefined ? {} : { filter: request.filter }),
        ...(request.sort === undefined ? {} : { sort: request.sort }),
        now: now(),
        ...(uuid === undefined ? {} : { uuid }),
      });
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
    const dispatched = commands.dispatch('chart.create', payload);
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: { chartId: payload.chart.id, viewId: payload.view.id } }
      : { ok: false, error: flushed.error, committed: true };
  }

  async function updateChart(chart: ChartSpec): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('chart.update', { chart });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: undefined }
      : { ok: false, error: flushed.error, committed: true };
  }

  async function deleteChart(chartId: string): Promise<ActionOutcome> {
    const dispatched = commands.dispatch('chart.delete', { chartId });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: undefined }
      : { ok: false, error: flushed.error, committed: true };
  }

  /**
   * Duplicates one chart under a fresh `cht_` id and opens its own tab.
   *
   * The copy keeps mapping/filter/sort/options so the two charts can diverge
   * independently; the strict mapping check of `chart.create` still applies, so
   * a chart whose mapped column vanished has to be repaired before copying.
   */
  async function duplicateChart(
    chartId: string,
  ): Promise<ActionOutcome<{ chartId: string; viewId: string }>> {
    const state = store.getState();
    const source = state.charts[chartId];
    if (source === undefined) {
      return fail(createAppError('E_VALIDATION', 'The chart does not exist.'));
    }
    const tableData = state.tables[source.tableId];
    if (tableData === undefined) {
      return fail(createAppError('E_TABLE_NOT_FOUND', 'The chart table does not exist.'));
    }
    let payload: ChartCreatePayload;
    try {
      payload = createNewChartPayload({
        table: tableData.table,
        title: duplicateChartTitle(
          source.title,
          Object.values(state.charts).map((chart) => chart.title),
        ),
        kind: source.kind,
        mapping: source.mapping,
        options: source.options,
        ...(source.filter === undefined ? {} : { filter: source.filter }),
        sort: source.sort,
        now: now(),
        ...(uuid === undefined ? {} : { uuid }),
      });
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
    const dispatched = commands.dispatch('chart.create', payload);
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: { chartId: payload.chart.id, viewId: payload.view.id } }
      : { ok: false, error: flushed.error, committed: true };
  }

  async function openChart(
    chartId: string,
  ): Promise<ActionOutcome<{ viewId: string; created: boolean }>> {
    const state = store.getState();
    const chart = state.charts[chartId];
    if (chart === undefined) {
      return fail(createAppError('E_VALIDATION', 'The chart does not exist.'));
    }
    const existing = Object.values(state.views).find(
      (view) => view.kind === 'chart' && view.refId === chartId,
    );
    if (existing !== undefined) {
      const layout = cloneLayout(state.layout);
      const panePath = activateViewInLayout(layout, existing.id, state.ui.activePanePath);
      const dispatched = commands.dispatch('view.layout', { layout, activePanePath: panePath });
      if (!dispatched.ok) {
        return fail(dispatched.error);
      }
      const scheduled = scheduleLayoutSave();
      if (!scheduled.ok) {
        return scheduled;
      }
      return { ok: true, data: { viewId: existing.id, created: false } };
    }

    const view: ViewDef = {
      id: createViewId(uuid),
      kind: 'chart',
      refId: chartId,
      title: chart.title,
    };
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

  async function duplicateView(viewId: string): Promise<ActionOutcome<{ viewId: string }>> {
    const state = store.getState();
    const source = state.views[viewId];
    if (source === undefined) {
      return fail(createAppError('E_VALIDATION', 'The view does not exist.'));
    }
    if (source.kind !== 'table' || source.tableView === undefined) {
      return fail(createAppError('E_VALIDATION', 'Only table views can be duplicated.'));
    }
    if (state.tables[source.refId] === undefined) {
      return fail(createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.'));
    }
    let view;
    try {
      view = createDuplicateTableView({
        source,
        existingTitles: Object.values(state.views).map((entry) => entry.title),
        ...(uuid === undefined ? {} : { uuid }),
      });
    } catch (thrown) {
      return fail(toAppError(thrown));
    }
    const dispatched = commands.dispatch('view.create', { view });
    if (!dispatched.ok) {
      return fail(dispatched.error);
    }
    const saved = await saveManifest();
    if (!saved.ok) {
      return fail(saved.error);
    }
    return { ok: true, data: { viewId: view.id } };
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

  function invalidPaste(
    error: AppError,
    details: {
      issues?: readonly PasteIssue[];
      totalIssues?: number;
      matrix?: ClipboardMatrix;
      large?: boolean;
    } = {},
  ): PastePrepareOutcome {
    return {
      ok: false,
      kind: 'invalid',
      error,
      issues: details.issues ?? [],
      totalIssues: details.totalIssues ?? 0,
      ...(details.matrix === undefined ? {} : { matrix: details.matrix }),
      large: details.large ?? false,
    };
  }

  /**
   * Parses and validates a clipboard matrix without touching the document.
   *
   * T2.6 owns filters; until then any view with an active filter blocks paste
   * entirely rather than risking a write to a hidden row (SPEC §9.3, ADR-030).
   * Matrices at or above `PASTE_PROGRESS_THRESHOLD` are processed in chunks and
   * can be cancelled between them; a cancelled preview never dispatches.
   */
  async function preparePaste(
    request: PastePrepareRequest,
    options: PastePrepareOptions = {},
  ): Promise<PastePrepareOutcome> {
    const state = store.getState();
    const tableData = state.tables[request.tableId];
    if (tableData === undefined) {
      return invalidPaste(
        createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${request.tableId}`,
        }),
      );
    }
    const view = state.views[request.viewId];
    if (
      view === undefined ||
      view.kind !== 'table' ||
      view.refId !== request.tableId ||
      view.tableView === undefined
    ) {
      return invalidPaste(
        createAppError('E_VALIDATION', 'The table view does not exist.', {
          detail: `view=${request.viewId}`,
        }),
      );
    }
    if (view.tableView.filter !== undefined && request.rowIds === undefined) {
      return {
        ok: false,
        kind: 'blocked',
        reason: 'filter-active',
        error: createAppError(
          'E_VALIDATION',
          'Pasting into a filtered view requires the current visible row order.',
          { detail: 'filter-active' },
        ),
      };
    }

    const parsed = parseClipboardText(request.text);
    if (!parsed.ok) {
      return invalidPaste(parsed.error);
    }
    const matrix = parsed.data;
    if (matrix.rows === 0 || matrix.columns === 0) {
      return { ok: false, kind: 'empty' };
    }
    const large = matrix.rows * matrix.columns >= PASTE_PROGRESS_THRESHOLD;

    if (view.tableView.filter !== undefined && request.rowIds !== undefined) {
      const visibleRowIds = request.rowIds;
      const anchorIndex =
        request.anchor.rowId === null ? -1 : visibleRowIds.indexOf(request.anchor.rowId);
      if (tableData.rows.length > 0 && anchorIndex < 0) {
        return {
          ok: false,
          kind: 'blocked',
          reason: 'filter-anchor-hidden',
          error: createAppError(
            'E_VALIDATION',
            'The paste anchor row is not part of the filtered view.',
            { detail: 'filter-anchor-hidden' },
          ),
        };
      }
      const available = visibleRowIds.length - Math.max(0, anchorIndex);
      if (matrix.rows > available) {
        return {
          ok: false,
          kind: 'blocked',
          reason: 'filter-visible-exceeded',
          error: createAppError(
            'E_VALIDATION',
            'The pasted matrix is larger than the visible rows of this filtered view.',
            { detail: `visible-rows=${String(available)} matrix-rows=${String(matrix.rows)}` },
          ),
        };
      }
    }

    let planner: ReturnType<typeof createPastePlanner>;
    try {
      planner = createPastePlanner({
        table: tableData.table,
        rows: tableData.rows,
        anchor: request.anchor,
        columnIds: request.columnIds,
        matrix: matrix.cells,
        ...(request.rowIds === undefined
          ? {}
          : {
              rowIds: request.rowIds,
              appendBeyondVisible: view.tableView.filter === undefined,
            }),
        ...(request.newColumns === undefined ? {} : { newColumns: request.newColumns }),
        ...(uuid === undefined ? {} : { uuid }),
      });
    } catch (thrown) {
      return invalidPaste(toAppError(thrown), { matrix, large });
    }

    const total = matrix.rows * matrix.columns;
    const chunkRows = Math.max(
      1,
      Math.floor((options.chunkCells ?? DEFAULT_PASTE_CHUNK_CELLS) / Math.max(1, matrix.columns)),
    );
    const yieldControl =
      options.yieldControl ??
      ((): Promise<void> =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        }));
    // Production yields only for large matrices; tests can inject yieldControl
    // to exercise cancellation on a small fixture without a 10k-cell setup.
    const shouldYield = large || options.yieldControl !== undefined;

    try {
      options.onProgress?.({
        processedRows: 0,
        totalRows: planner.totalRows,
        done: 0,
        total,
      });
      if (!planner.blocked) {
        while (planner.processedRows < planner.totalRows) {
          if (options.signal?.aborted === true) {
            return { ok: false, kind: 'cancelled' };
          }
          planner.step(chunkRows);
          options.onProgress?.({
            processedRows: planner.processedRows,
            totalRows: planner.totalRows,
            done: planner.processedRows * matrix.columns,
            total,
          });
          if (shouldYield && planner.processedRows < planner.totalRows) {
            await yieldControl();
          }
        }
      }
      if (options.signal?.aborted === true) {
        return { ok: false, kind: 'cancelled' };
      }

      const plan = planner.finish();
      if (!plan.ok) {
        if (plan.needsColumns !== undefined) {
          return {
            ok: false,
            kind: 'needs-columns',
            matrix,
            newColumnsRequired: plan.needsColumns,
            large,
          };
        }
        return invalidPaste(plan.error, {
          issues: plan.issues,
          totalIssues: plan.totalIssues,
          matrix,
          large,
        });
      }
      return { ok: true, data: { matrix, plan, large } };
    } catch (thrown) {
      return invalidPaste(toAppError(thrown), { matrix, large });
    }
  }

  function collectPasteIssues(
    request: PasteApplyRequest,
    appendBeyondVisible: boolean,
  ): {
    issues: readonly PasteIssue[];
    totalIssues: number;
  } {
    const state = store.getState();
    const tableData = state.tables[request.tableId];
    if (tableData === undefined) {
      return { issues: [], totalIssues: 0 };
    }
    try {
      const plan = planPaste({
        table: tableData.table,
        rows: tableData.rows,
        anchor: request.anchor,
        columnIds: request.columnIds,
        matrix: request.matrix,
        ...(request.rowIds === undefined ? {} : { rowIds: request.rowIds, appendBeyondVisible }),
        ...(request.newColumns === undefined ? {} : { newColumns: request.newColumns }),
        ...(uuid === undefined ? {} : { uuid }),
      });
      return plan.ok
        ? { issues: [], totalIssues: 0 }
        : { issues: plan.issues, totalIssues: plan.totalIssues };
    } catch {
      return { issues: [], totalIssues: 0 };
    }
  }

  /**
   * Applies one `table.paste` command and waits for the T2.2 save queue.
   *
   * The command re-plans from current state inside its Immer transaction, so a
   * stale preview cannot commit a half-valid matrix. A save failure keeps the
   * committed document dirty (`committed: true`) and lets the status bar retry;
   * the paste is never executed twice.
   */
  async function applyPaste(request: PasteApplyRequest): Promise<PasteApplyOutcome> {
    const state = store.getState();
    const view = state.views[request.viewId];
    if (view?.tableView?.filter !== undefined && request.rowIds === undefined) {
      return {
        ok: false,
        error: createAppError(
          'E_VALIDATION',
          'Pasting into a filtered view requires the current visible row order.',
          { detail: 'filter-active' },
        ),
      };
    }
    const appendBeyondVisible = view?.tableView?.filter === undefined;

    const dispatched = commands.dispatch('table.paste', {
      tableId: request.tableId,
      viewId: request.viewId,
      anchor: { ...request.anchor },
      columnIds: [...request.columnIds],
      ...(request.rowIds === undefined ? {} : { rowIds: [...request.rowIds] }),
      matrix: request.matrix.map((row) => [...row]),
      ...(request.newColumns === undefined ? {} : { newColumns: [...request.newColumns] }),
    });
    if (!dispatched.ok) {
      const error = report('failed to paste the clipboard matrix', dispatched.error);
      const collected = collectPasteIssues(request, appendBeyondVisible);
      return {
        ok: false,
        error,
        ...(collected.issues.length === 0 ? {} : { issues: collected.issues }),
        ...(collected.totalIssues === 0 ? {} : { totalIssues: collected.totalIssues }),
      };
    }

    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: undefined }
      : { ok: false, error: flushed.error, committed: true };
  }

  /**
   * Archives the selected source file before touching the document, then applies
   * one all-or-nothing `table.import` command. The archive step is deliberately
   * first: a copy/hash failure must leave memory and workspace data unchanged.
   * Once the command succeeds, a save failure is reported as `committed: true`.
   */
  async function applyImport(request: ImportApplyRequest): Promise<ImportApplyOutcome> {
    const state = store.getState();
    const workspace = state.workspace;
    if (workspace === null) {
      return { ok: false, error: createAppError('E_WS_NOT_FOUND', 'No workspace is open.') };
    }
    if (state.tables[request.tableId] === undefined) {
      return {
        ok: false,
        error: createAppError('E_TABLE_NOT_FOUND', 'The table does not exist.', {
          detail: `table=${request.tableId}`,
        }),
      };
    }
    if (archiveImport === undefined) {
      return {
        ok: false,
        error: createAppError('E_UNKNOWN', 'Import archiving is not available.', {
          detail: 'archiveImport',
        }),
      };
    }

    let archived: ImportArchiveResult;
    try {
      archived = await archiveImport({
        workspaceId: workspace.id,
        tableId: request.tableId,
        mode: request.mode,
        ...request.source,
      });
    } catch (thrown) {
      return { ok: false, error: report('failed to archive the import source', thrown) };
    }

    const dispatched = commands.dispatch('table.import', {
      tableId: request.tableId,
      mode: request.mode,
      rows: request.rows.map((row) => ({ id: row.id, values: [...row.values] })),
      ...(request.newColumns === undefined ? {} : { newColumns: [...request.newColumns] }),
    });
    if (!dispatched.ok) {
      return { ok: false, error: report('failed to import table rows', dispatched.error) };
    }

    const flushed = await saveQueue.flush();
    return flushed.ok
      ? { ok: true, data: archived }
      : { ok: false, error: flushed.error, committed: true };
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
    flushLayoutSave();
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
    clearLayoutSave();
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
        activePanePath: null,
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
    splitPane,
    closePane,
    moveViewToNextPane,
    setLayoutRatio,
    updateView,
    createTableStyle,
    updateTableStyle,
    deleteTableStyle,
    applyTableStyle,
    duplicateTableStyle,
    createChart,
    updateChart,
    deleteChart,
    duplicateChart,
    openChart,
    duplicateView,
    updateCell,
    preparePaste,
    applyPaste,
    applyImport,
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
