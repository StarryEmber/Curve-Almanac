import { createAppError } from './errors';
import {
  MAX_CHARTS_PER_WORKSPACE,
  MAX_COLUMNS_PER_TABLE,
  MAX_PANES,
  MAX_REPORTED_ISSUES,
  MAX_TABLES_PER_WORKSPACE,
} from './limits';
import { parseCell } from './schemas';

import type {
  Cell,
  ChartSpec,
  ColumnType,
  FilterPredicate,
  LayoutNode,
  Row,
  TableMeta,
  TableViewState,
  ValidationIssue,
  WorkspaceManifest,
} from './types';

/**
 * Cross-object invariants from SPEC §6.6.
 *
 * Loading is allowed to *repair* (and warn) where the spec says so, but
 * anything returned in `issues` must stop the workspace from opening with
 * `E_WS_INVALID_MANIFEST` (see `assertInvariants`).
 *
 * The checks are pure: callers pass the rows they already loaded. `rowCount` is
 * treated as a hint only (SPEC §7.5).
 */

export interface InvariantReport {
  issues: ValidationIssue[];
  warnings: string[];
}

export interface TableCheckOptions {
  /** Rows of that table; without them only schema-level invariants run. */
  rows?: readonly Row[];
  /** Plugin field-type registry (T6.1); absent means "cannot verify". */
  resolveFieldTypeStorage?: (fieldTypeId: string) => ColumnType | undefined;
}

export interface WorkspaceCheckOptions {
  rowsByTable?: ReadonlyMap<string, readonly Row[]>;
  resolveFieldTypeStorage?: (fieldTypeId: string) => ColumnType | undefined;
}

interface Context {
  issues: ValidationIssue[];
  warnings: string[];
  truncated: boolean;
}

type PaneNode = Extract<LayoutNode, { type: 'pane' }>;

function createContext(): Context {
  return { issues: [], warnings: [], truncated: false };
}

function pushIssue(
  context: Context,
  path: string,
  code: ValidationIssue['code'],
  message: string,
): void {
  if (context.truncated) {
    return;
  }
  if (context.issues.length >= MAX_REPORTED_ISSUES) {
    context.truncated = true;
    context.issues.push({
      path: '',
      code: 'E_VALIDATION',
      message: `more than ${MAX_REPORTED_ISSUES} issues; report truncated`,
    });
    return;
  }
  context.issues.push({ path, code, message });
}

function pushWarning(context: Context, message: string): void {
  if (context.warnings.length < MAX_REPORTED_ISSUES) {
    context.warnings.push(message);
  }
}

function toReport(context: Context): InvariantReport {
  return { issues: context.issues, warnings: context.warnings };
}

function at(prefix: string, path: string): string {
  return prefix === '' ? path : `${prefix}.${path}`;
}

/* -------------------------------------------------------------------------- */
/* Table level                                                                */
/* -------------------------------------------------------------------------- */

/** Checks one table (and optionally its rows) against SPEC §6.6.1–2a. */
export function checkTable(table: TableMeta, options: TableCheckOptions = {}): InvariantReport {
  const context = createContext();
  checkTableInto(context, table, options, '');
  return toReport(context);
}

function checkTableInto(
  context: Context,
  table: TableMeta,
  options: TableCheckOptions,
  prefix: string,
): void {
  if (table.columns.length === 0) {
    pushIssue(context, at(prefix, 'columns'), 'E_REQUIRED', 'a table needs at least one column');
  }
  if (table.columns.length > MAX_COLUMNS_PER_TABLE) {
    pushIssue(
      context,
      at(prefix, 'columns'),
      'E_RANGE',
      `a table may have at most ${MAX_COLUMNS_PER_TABLE} columns, found ${table.columns.length}`,
    );
  }

  const columnIds = new Set<string>();
  const columnKeys = new Set<string>();
  table.columns.forEach((column, index) => {
    if (columnIds.has(column.id)) {
      pushIssue(
        context,
        at(prefix, `columns[${index}].id`),
        'E_DUPLICATE_KEY',
        `duplicate column id "${column.id}"`,
      );
    }
    columnIds.add(column.id);

    if (columnKeys.has(column.key)) {
      pushIssue(
        context,
        at(prefix, `columns[${index}].key`),
        'E_DUPLICATE_KEY',
        `duplicate column key "${column.key}"`,
      );
    }
    columnKeys.add(column.key);
  });

  const primaryIndex = table.columns.findIndex((column) => column.id === table.primaryKey);
  if (primaryIndex === -1) {
    pushIssue(
      context,
      at(prefix, 'primaryKey'),
      'E_VALIDATION',
      `primary key "${table.primaryKey}" is not a column of table "${table.name}"`,
    );
  } else {
    const primary = table.columns[primaryIndex];
    if (primary !== undefined && primary.type !== 'text') {
      pushIssue(
        context,
        at(prefix, 'primaryKey'),
        'E_TYPE',
        'the primary key must be a text column (SPEC §6.2)',
      );
    }
  }

  table.columns.forEach((column, index) => {
    checkFieldType(context, column, index, options, prefix);
  });

  if (options.rows !== undefined) {
    if (table.rowCount !== options.rows.length) {
      pushWarning(
        context,
        `table "${table.name}": rowCount ${table.rowCount} does not match ${options.rows.length} loaded rows`,
      );
    }
    checkRowsInto(context, table, options.rows, prefix, primaryIndex);
  }
}

function checkFieldType(
  context: Context,
  column: TableMeta['columns'][number],
  index: number,
  options: TableCheckOptions,
  prefix: string,
): void {
  const fieldTypeId = column.fieldTypeId;
  if (fieldTypeId === undefined || fieldTypeId === column.type) {
    return;
  }

  const resolve = options.resolveFieldTypeStorage;
  if (resolve === undefined) {
    pushWarning(
      context,
      `table column "${column.key}": cannot verify field type "${fieldTypeId}" without a field-type registry`,
    );
    return;
  }

  const storage = resolve(fieldTypeId);
  if (storage === undefined) {
    pushIssue(
      context,
      at(prefix, `columns[${index}].fieldTypeId`),
      'E_VALIDATION',
      `unknown field type "${fieldTypeId}"`,
    );
    return;
  }
  if (storage !== column.type) {
    pushIssue(
      context,
      at(prefix, `columns[${index}].fieldTypeId`),
      'E_TYPE',
      `field type "${fieldTypeId}" stores ${storage} but the column is ${column.type}`,
    );
  }
}

function checkRowsInto(
  context: Context,
  table: TableMeta,
  rows: readonly Row[],
  prefix: string,
  primaryIndex: number,
): void {
  const columnCount = table.columns.length;
  const rowIds = new Set<string>();
  const primaryValues = new Map<Cell, number>();

  rows.forEach((row, rowIndex) => {
    const rowPath = at(prefix, `rows[${rowIndex}]`);

    if (rowIds.has(row.id)) {
      pushIssue(context, `${rowPath}.id`, 'E_DUPLICATE_KEY', `duplicate row id "${row.id}"`);
    }
    rowIds.add(row.id);

    if (row.values.length !== columnCount) {
      pushIssue(
        context,
        `${rowPath}.values`,
        'E_RANGE',
        `expected ${columnCount} values, got ${row.values.length}`,
      );
    }

    const limit = Math.min(row.values.length, columnCount);
    for (let index = 0; index < limit; index += 1) {
      const column = table.columns[index];
      if (column === undefined) {
        continue;
      }
      const result = parseCell(row.values[index], column);
      if (!result.ok) {
        pushIssue(context, `${rowPath}.values[${index}]`, result.code, result.message);
      }
    }

    if (primaryIndex >= 0 && primaryIndex < row.values.length) {
      const value = row.values[primaryIndex];
      if (value === null || value === undefined) {
        pushIssue(
          context,
          `${rowPath}.values[${primaryIndex}]`,
          'E_REQUIRED',
          'primary key values must not be null',
        );
      } else if (primaryValues.has(value)) {
        const firstRow = primaryValues.get(value);
        pushIssue(
          context,
          `${rowPath}.values[${primaryIndex}]`,
          'E_DUPLICATE_KEY',
          `duplicate primary key ${JSON.stringify(value)} (first seen in row ${String(firstRow)})`,
        );
      } else {
        primaryValues.set(value, rowIndex);
      }
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Workspace level                                                            */
/* -------------------------------------------------------------------------- */

/** Checks a whole manifest against SPEC §6.6.3–8. */
export function checkInvariants(
  manifest: WorkspaceManifest,
  options: WorkspaceCheckOptions = {},
): InvariantReport {
  const context = createContext();

  if (manifest.tables.length > MAX_TABLES_PER_WORKSPACE) {
    pushIssue(
      context,
      'tables',
      'E_RANGE',
      `a workspace may have at most ${MAX_TABLES_PER_WORKSPACE} tables`,
    );
  }
  if (manifest.charts.length > MAX_CHARTS_PER_WORKSPACE) {
    pushIssue(
      context,
      'charts',
      'E_RANGE',
      `a workspace may have at most ${MAX_CHARTS_PER_WORKSPACE} charts`,
    );
  }

  checkUniqueIds(context, manifest.tables, 'tables', 'table');
  checkUniqueIds(context, manifest.charts, 'charts', 'chart');
  checkUniqueIds(context, manifest.views, 'views', 'view');
  checkUniqueIds(context, manifest.tableStyles, 'tableStyles', 'style');

  const tablesById = new Map(manifest.tables.map((table) => [table.id, table]));
  const chartIds = new Set(manifest.charts.map((chart) => chart.id));
  const viewIds = new Set(manifest.views.map((view) => view.id));
  const styleIds = new Set(manifest.tableStyles.map((style) => style.id));

  manifest.tables.forEach((table, index) => {
    checkTableInto(
      context,
      table,
      {
        rows: options.rowsByTable?.get(table.id),
        resolveFieldTypeStorage: options.resolveFieldTypeStorage,
      },
      `tables[${index}]`,
    );
  });

  manifest.tableStyles.forEach((style, index) => {
    if (style.id.startsWith('builtin.')) {
      pushIssue(
        context,
        `tableStyles[${index}].id`,
        'E_VALIDATION',
        'builtin styles are code constants and must not be persisted in the manifest',
      );
    }
  });

  manifest.charts.forEach((chart, index) => {
    checkChartInto(context, chart, index, tablesById);
  });

  manifest.views.forEach((view, index) => {
    checkViewInto(context, view, index, tablesById, chartIds, styleIds);
  });

  checkLayout(context, manifest.layout, viewIds);

  return toReport(context);
}

function checkUniqueIds(
  context: Context,
  items: readonly { id: string }[],
  path: string,
  label: string,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      pushIssue(
        context,
        `${path}[${index}].id`,
        'E_DUPLICATE_KEY',
        `duplicate ${label} id "${item.id}"`,
      );
    }
    seen.add(item.id);
  });
}

function checkChartInto(
  context: Context,
  chart: ChartSpec,
  index: number,
  tablesById: ReadonlyMap<string, TableMeta>,
): void {
  const table = tablesById.get(chart.tableId);
  if (table === undefined) {
    pushIssue(
      context,
      `charts[${index}].tableId`,
      'E_VALIDATION',
      `chart "${chart.title}" references missing table "${chart.tableId}"`,
    );
    return;
  }

  const columnIds = new Set(table.columns.map((column) => column.id));
  const mapping =
    chart.mapping.layout === 'wide'
      ? [chart.mapping.xColumnId, ...chart.mapping.yColumnIds]
      : [chart.mapping.xColumnId, chart.mapping.seriesColumnId, chart.mapping.yColumnId];

  for (const columnId of mapping) {
    if (!columnIds.has(columnId)) {
      pushWarning(
        context,
        `chart "${chart.title}" maps missing column "${columnId}"; it must load in an invalid state (SPEC §6.6.4)`,
      );
    }
  }

  chart.sort.forEach((sort, sortIndex) => {
    if (!columnIds.has(sort.columnId)) {
      pushWarning(
        context,
        `chart "${chart.title}" sort[${sortIndex}] references missing column "${sort.columnId}"`,
      );
    }
  });

  if (chart.filter !== undefined) {
    for (const columnId of collectFilterColumns(chart.filter)) {
      if (!columnIds.has(columnId)) {
        pushWarning(
          context,
          `chart "${chart.title}" filter references missing column "${columnId}"`,
        );
      }
    }
  }
}

function checkViewInto(
  context: Context,
  view: WorkspaceManifest['views'][number],
  index: number,
  tablesById: ReadonlyMap<string, TableMeta>,
  chartIds: ReadonlySet<string>,
  styleIds: ReadonlySet<string>,
): void {
  if (view.kind === 'table') {
    const table = tablesById.get(view.refId);
    if (table === undefined) {
      pushIssue(
        context,
        `views[${index}].refId`,
        'E_VALIDATION',
        `view "${view.title}" references missing table "${view.refId}"`,
      );
    }
    if (view.tableView === undefined) {
      pushIssue(
        context,
        `views[${index}].tableView`,
        'E_REQUIRED',
        'table views require tableView state',
      );
      return;
    }
    if (view.tableView.tableId !== view.refId) {
      pushIssue(
        context,
        `views[${index}].tableView.tableId`,
        'E_VALIDATION',
        'tableView.tableId must equal the view refId',
      );
    }
    if (table !== undefined) {
      checkTableViewInto(context, view.tableView, table, `views[${index}].tableView`, styleIds);
    }
    return;
  }

  if (!chartIds.has(view.refId)) {
    pushIssue(
      context,
      `views[${index}].refId`,
      'E_VALIDATION',
      `view "${view.title}" references missing chart "${view.refId}"`,
    );
  }
  if (view.tableView !== undefined) {
    pushIssue(
      context,
      `views[${index}].tableView`,
      'E_VALIDATION',
      'chart views must not carry tableView state',
    );
  }
}

function checkTableViewInto(
  context: Context,
  state: TableViewState,
  table: TableMeta,
  prefix: string,
  styleIds: ReadonlySet<string>,
): void {
  const columnIds = new Set(table.columns.map((column) => column.id));

  const ordered = new Set<string>();
  state.columnOrder.forEach((columnId, index) => {
    if (!columnIds.has(columnId)) {
      pushIssue(
        context,
        `${prefix}.columnOrder[${index}]`,
        'E_VALIDATION',
        `columnOrder references unknown column "${columnId}"`,
      );
    } else if (ordered.has(columnId)) {
      pushIssue(
        context,
        `${prefix}.columnOrder[${index}]`,
        'E_DUPLICATE_KEY',
        `column "${columnId}" appears more than once in columnOrder`,
      );
    }
    ordered.add(columnId);
  });

  for (const column of table.columns) {
    if (!ordered.has(column.id)) {
      pushIssue(
        context,
        `${prefix}.columnOrder`,
        'E_VALIDATION',
        `column "${column.id}" is missing from columnOrder`,
      );
    }
  }

  for (const columnId of Object.keys(state.widths)) {
    if (!columnIds.has(columnId)) {
      pushIssue(
        context,
        `${prefix}.widths`,
        'E_VALIDATION',
        `widths references unknown column "${columnId}"`,
      );
    }
  }

  for (const columnId of state.hiddenColumnIds) {
    if (!columnIds.has(columnId)) {
      pushWarning(context, `hidden column "${columnId}" no longer exists and is ignored`);
    }
  }

  state.sort.forEach((sort, index) => {
    if (!columnIds.has(sort.columnId)) {
      pushIssue(
        context,
        `${prefix}.sort[${index}].columnId`,
        'E_VALIDATION',
        `sort references unknown column "${sort.columnId}"`,
      );
    }
  });

  if (state.filter !== undefined) {
    for (const columnId of collectFilterColumns(state.filter)) {
      if (!columnIds.has(columnId)) {
        pushIssue(
          context,
          `${prefix}.filter`,
          'E_VALIDATION',
          `filter references unknown column "${columnId}"`,
        );
      }
    }
  }

  if (!state.styleId.startsWith('builtin.') && !styleIds.has(state.styleId)) {
    pushWarning(
      context,
      `table view style "${state.styleId}" cannot be resolved; falling back to the default style`,
    );
  }
}

function checkLayout(context: Context, layout: LayoutNode, viewIds: ReadonlySet<string>): void {
  const panes: { path: string; node: PaneNode }[] = [];
  collectPanes(layout, 'layout', panes);

  if (panes.length > MAX_PANES) {
    pushIssue(
      context,
      'layout',
      'E_RANGE',
      `a layout may contain at most ${MAX_PANES} panes, found ${panes.length}`,
    );
  }

  const seen = new Map<string, string>();
  panes.forEach((pane) => {
    pane.node.viewIds.forEach((viewId, index) => {
      if (!viewIds.has(viewId)) {
        pushIssue(
          context,
          `${pane.path}.viewIds[${index}]`,
          'E_VALIDATION',
          `layout references missing view "${viewId}"`,
        );
        return;
      }
      const previous = seen.get(viewId);
      if (previous !== undefined) {
        pushIssue(
          context,
          `${pane.path}.viewIds[${index}]`,
          'E_DUPLICATE_KEY',
          `view "${viewId}" is already shown in ${previous}`,
        );
        return;
      }
      seen.set(viewId, pane.path);
    });

    if (pane.node.activeViewId !== null && !pane.node.viewIds.includes(pane.node.activeViewId)) {
      pushIssue(
        context,
        `${pane.path}.activeViewId`,
        'E_VALIDATION',
        'activeViewId must be one of the pane viewIds',
      );
    }
  });
}

function collectPanes(
  node: LayoutNode,
  path: string,
  panes: { path: string; node: PaneNode }[],
): void {
  if (node.type === 'pane') {
    panes.push({ path, node });
    return;
  }
  collectPanes(node.first, `${path}.first`, panes);
  collectPanes(node.second, `${path}.second`, panes);
}

function collectFilterColumns(predicate: FilterPredicate): string[] {
  if (predicate.kind !== 'compare') {
    return predicate.children.flatMap((child) => collectFilterColumns(child));
  }
  return [predicate.columnId];
}

/**
 * Throws a typed `E_WS_INVALID_MANIFEST` when the report has blocking issues.
 *
 * Callers that need every issue (the import/report UI) should inspect
 * `checkInvariants` directly; this helper is for "open or fail" call sites.
 */
export function assertInvariants(report: InvariantReport): void {
  if (report.issues.length === 0) {
    return;
  }
  const detail = report.issues
    .slice(0, 5)
    .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
    .join('; ');
  throw createAppError('E_WS_INVALID_MANIFEST', 'Workspace manifest violates invariants', {
    detail,
  });
}
