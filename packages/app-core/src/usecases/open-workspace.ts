import { toAppError } from '@curve/domain';
import type {
  AppError,
  ChartSpec,
  LayoutNode,
  TableMeta,
  TableStyle,
  ViewDef,
  WorkspaceManifest,
} from '@curve/domain';
import type { OpenWorkspaceRequest, WorkspaceStore } from '@curve/persistence';
import { decodeJsonl, toJsonlAppError } from '@curve/table-engine';
import type { JsonlDecodeResult, TableData } from '@curve/table-engine';

import { listPaneEntries } from '../commands/layout';
import { defaultAppLogger } from '../logging';
import { createEmptyHistoryState } from '../state/store';

import type { AppLogger } from '../logging';
import type { AppStore } from '../state/types';

export type OpenWorkspaceOutcome =
  | {
      readonly ok: true;
      readonly manifest: WorkspaceManifest;
      readonly warnings: string[];
    }
  | { readonly ok: false; readonly error: AppError };

export interface OpenWorkspaceDependencies {
  store: WorkspaceStore;
  appStore: AppStore;
  logger?: AppLogger;
  /**
   * Async table decoder (T2.1: the renderer Worker). When omitted the pure
   * `decodeJsonl` runs inline, which keeps app-core tests and T1.5 simple.
   */
  decodeTable?: (jsonl: string, table: TableMeta) => Promise<JsonlDecodeResult>;
}

export type OpenWorkspace = (request: OpenWorkspaceRequest) => Promise<OpenWorkspaceOutcome>;

function firstActiveView(layout: LayoutNode): { viewId: string; path: string } | null {
  const entries = listPaneEntries(layout);
  const active = entries.find((entry) => entry.pane.activeViewId !== null);
  if (active !== undefined && active.pane.activeViewId !== null) {
    return { viewId: active.pane.activeViewId, path: active.path };
  }
  for (const entry of entries) {
    const viewId = entry.pane.viewIds[0];
    if (viewId !== undefined) {
      return { viewId, path: entry.path };
    }
  }
  return null;
}

interface ActiveSelection {
  activeTableId: string | null;
  activeViewId: string | null;
  activePanePath: string | null;
}

function resolveActiveSelection(manifest: WorkspaceManifest): ActiveSelection {
  const selection = firstActiveView(manifest.layout);
  const view =
    selection === null
      ? undefined
      : manifest.views.find((candidate) => candidate.id === selection.viewId);
  if (view === undefined || selection === null) {
    return {
      activeTableId: manifest.tables[0]?.id ?? null,
      activeViewId: null,
      activePanePath: selection?.path ?? listPaneEntries(manifest.layout)[0]?.path ?? null,
    };
  }
  if (view.kind === 'table' && manifest.tables.some((table) => table.id === view.refId)) {
    return {
      activeTableId: view.refId,
      activeViewId: view.id,
      activePanePath: selection.path,
    };
  }
  if (view.kind === 'chart') {
    const chart = manifest.charts.find((candidate) => candidate.id === view.refId);
    if (chart !== undefined) {
      return {
        activeTableId: chart.tableId,
        activeViewId: view.id,
        activePanePath: selection.path,
      };
    }
  }
  return {
    activeTableId: manifest.tables[0]?.id ?? null,
    activeViewId: view.id,
    activePanePath: selection.path,
  };
}

function recordWarnings(
  tableId: string,
  tableName: string,
  decoded: ReturnType<typeof decodeJsonl>,
  warnings: string[],
  logger: AppLogger,
): void {
  if (decoded.issues.length === 0) {
    return;
  }
  const issueError = toJsonlAppError(decoded);
  if (issueError !== null) {
    const detail = issueError.detail === undefined ? '' : ` (${issueError.detail})`;
    const message = `${tableName} (${tableId}): ${issueError.message}${detail}`;
    warnings.push(message);
    logger.warn(`table "${tableId}" decoded with issues`, message);
  }
}

function toViewMap(views: readonly ViewDef[]): Record<string, ViewDef> {
  return Object.fromEntries(views.map((view) => [view.id, view]));
}

function toChartMap(charts: readonly ChartSpec[]): Record<string, ChartSpec> {
  return Object.fromEntries(charts.map((chart) => [chart.id, chart]));
}

function toStyleMap(styles: readonly TableStyle[]): Record<string, TableStyle> {
  return Object.fromEntries(styles.map((style) => [style.id, style]));
}

/**
 * Loads a workspace into app-core state.
 *
 * This is a use case, not a command: opening performs IO and must not create
 * undo history. The document state is replaced only after every table loaded;
 * a failure leaves the previous workspace untouched and publishes `ui.error`.
 */
export function createOpenWorkspace(deps: OpenWorkspaceDependencies): OpenWorkspace {
  const logger = deps.logger ?? defaultAppLogger;

  return async function openWorkspace(
    request: OpenWorkspaceRequest,
  ): Promise<OpenWorkspaceOutcome> {
    try {
      const opened = await deps.store.open(request);
      const warnings = [...opened.warnings];
      const tables: Record<string, TableData> = {};

      try {
        for (const table of opened.manifest.tables) {
          const read = await deps.store.readTable({
            workspaceId: opened.manifest.id,
            tableId: table.id,
          });
          const decoded =
            deps.decodeTable === undefined
              ? decodeJsonl(read.jsonl, table)
              : await deps.decodeTable(read.jsonl, table);
          recordWarnings(table.id, table.name, decoded, warnings, logger);
          tables[table.id] = { table, rows: decoded.rows };
        }
      } catch (thrown) {
        // T5.3: a failed per-table read must not leave the workspace locked (and
        // stale on the next launch). Opening is all-or-nothing from the UI's
        // point of view, so close the main-process handle before rethrowing.
        await deps.store.close({ workspaceId: opened.manifest.id }).catch(() => undefined);
        throw thrown;
      }

      const selection = resolveActiveSelection(opened.manifest);
      const current = deps.appStore.getState();
      deps.appStore.setState(
        {
          ...current,
          workspace: {
            formatVersion: opened.manifest.formatVersion,
            id: opened.manifest.id,
            name: opened.manifest.name,
            root: request.dir,
            appVersion: opened.manifest.appVersion,
            createdAt: opened.manifest.createdAt,
            updatedAt: opened.manifest.updatedAt,
            settings: opened.manifest.settings,
            warnings,
          },
          tables,
          views: toViewMap(opened.manifest.views),
          charts: toChartMap(opened.manifest.charts),
          tableStyles: toStyleMap(opened.manifest.tableStyles),
          layout: opened.manifest.layout,
          ui: {
            ...current.ui,
            activeTableId: selection.activeTableId,
            activeViewId: selection.activeViewId,
            activePanePath: selection.activePanePath,
            error: null,
            dirtyTables: [],
            save: { status: 'idle', pending: 0, error: null },
            history: createEmptyHistoryState(),
            editIssue: null,
          },
        },
        true,
      );
      // The tracker is closed over by the store; clear it through its action so
      // the new workspace never inherits dirty marks from the previous one.
      deps.appStore.getState().actions.clearAllDirty();

      return { ok: true, manifest: opened.manifest, warnings };
    } catch (thrown) {
      const error = toAppError(thrown);
      logger.error('open workspace failed', error);
      deps.appStore.getState().actions.setError(error);
      return { ok: false, error };
    }
  };
}
