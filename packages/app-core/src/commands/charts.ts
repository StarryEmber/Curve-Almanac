/**
 * Chart commands (T4.4, SPEC §11.5, §13.1).
 *
 * A chart lives in `manifest.charts` and its tab is a `ViewDef` with
 * `kind: 'chart'`; nothing here touches table JSONL, so every command is a
 * manifest-only document change. Creating a chart and its first view in one
 * command keeps "one user action = one undo entry" for the wizard.
 *
 * `chart.create` requires a fully valid mapping against the table (the wizard
 * must not persist an unmappable chart). `chart.update` deliberately allows
 * dangling column references: after a mapped column is deleted the inspector
 * has to be able to repair the chart step by step, and the view renders an
 * actionable error state until the mapping resolves (SPEC §6.6.4).
 */

import { validateChartMapping } from '@curve/chart-model';
import {
  chartSpecSchema,
  createAppError,
  createChartId,
  createTimestamp,
  createViewId,
  isId,
  viewDefSchema,
} from '@curve/domain';
import type {
  ChartKind,
  ChartMapping,
  ChartOptions,
  ChartSpec,
  FilterPredicate,
  SortSpec,
  TableMeta,
  UuidFactory,
  ViewDef,
} from '@curve/domain';
import { validateFilterPredicate, validateSortSpecs } from '@curve/table-engine';

import { addViewToLayout, removeViewFromLayout } from './layout';
import { syncActiveSelection } from './views';

import type { CommandDefinition } from './types';
import type { AppState } from '../state/types';
import type { Draft } from 'immer';

/**
 * Options copied onto a newly created chart (SPEC §11.2.6, §16.1).
 *
 * Sampling is on by default with the T4.2 benchmark sizes: charts above 5,000
 * points downsample to 2,000, which keeps a 100k-row table inside the
 * "resolve + sample ≤ 300ms" budget. Existing charts are never rewritten.
 */
export const DEFAULT_CHART_OPTIONS: Readonly<ChartOptions> = Object.freeze({
  smooth: false,
  showSymbol: false,
  lineWidth: 2,
  paletteId: 'default',
  background: 'auto',
  showGrid: true,
  legend: 'top',
  yStartAtZero: false,
  numberDigits: 2,
  sampling: Object.freeze({ enabled: true, threshold: 5_000, target: 2_000 }),
});

/** Fresh mutable copy so commands never alias the frozen constant. */
export function defaultChartOptions(): ChartOptions {
  return {
    ...DEFAULT_CHART_OPTIONS,
    sampling: { ...DEFAULT_CHART_OPTIONS.sampling },
  };
}

export interface ChartCreatePayload {
  chart: ChartSpec;
  view: ViewDef;
}

export interface ChartUpdatePayload {
  chart: ChartSpec;
}

export interface ChartDeletePayload {
  chartId: string;
}

export interface ChartCommandOptions {
  /** Injected so `createdAt`/`updatedAt` assertions are deterministic. */
  now?: () => Date;
  uuid?: UuidFactory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string, detail?: string): never {
  throw createAppError('E_VALIDATION', message, detail === undefined ? undefined : { detail });
}

function touchWorkspace(draft: Draft<AppState>, timestamp: string): void {
  if (draft.workspace !== null) {
    draft.workspace.updatedAt = timestamp;
  }
}

function parseChartId(payload: unknown, command: string): string {
  if (!isRecord(payload) || typeof payload['chartId'] !== 'string') {
    invalid(`${command} expects { chartId }.`);
  }
  const chartId = payload['chartId'];
  if (!isId('cht', chartId)) {
    invalid('"chartId" must be a valid cht id.');
  }
  return chartId;
}

function parseChartCreate(payload: unknown): ChartCreatePayload {
  if (!isRecord(payload) || !('chart' in payload) || !('view' in payload)) {
    invalid('chart.create expects { chart, view }.');
  }
  const chart = chartSpecSchema.safeParse(payload['chart']);
  if (!chart.success) {
    invalid('The chart definition is invalid.');
  }
  const view = viewDefSchema.safeParse(payload['view']);
  if (!view.success) {
    invalid('The chart view is invalid.');
  }
  return { chart: chart.data, view: view.data };
}

function parseChartUpdate(payload: unknown): ChartUpdatePayload {
  if (!isRecord(payload) || !('chart' in payload)) {
    invalid('chart.update expects { chart }.');
  }
  const chart = chartSpecSchema.safeParse(payload['chart']);
  if (!chart.success) {
    invalid('The chart definition is invalid.');
  }
  return { chart: chart.data };
}

/** Copy for the "duplicate chart" action; `Sales` → `Sales (2)`. */
export function duplicateChartTitle(base: string, existingTitles: readonly string[]): string {
  const trimmed = base.trim() === '' ? 'Chart' : base.trim();
  const used = new Set(existingTitles);
  const stemMatch = /^(.*) \((\d+)\)$/.exec(trimmed);
  const stem = stemMatch?.[1]?.trim() ?? trimmed;
  let index = 2;
  while (used.has(`${stem} (${String(index)})`)) {
    index += 1;
  }
  return `${stem} (${String(index)})`;
}

function cloneFilter(predicate: FilterPredicate): FilterPredicate {
  if (predicate.kind === 'compare') {
    return {
      kind: 'compare',
      columnId: predicate.columnId,
      op: predicate.op,
      ...(predicate.value === undefined ? {} : { value: predicate.value }),
      ...(predicate.value2 === undefined ? {} : { value2: predicate.value2 }),
    };
  }
  return {
    kind: predicate.kind,
    children: predicate.children.map(cloneFilter),
  };
}

function cloneMapping(mapping: ChartMapping): ChartMapping {
  if (mapping.layout === 'wide') {
    return {
      layout: 'wide',
      xColumnId: mapping.xColumnId,
      yColumnIds: [...mapping.yColumnIds],
    };
  }
  return {
    layout: 'long',
    xColumnId: mapping.xColumnId,
    seriesColumnId: mapping.seriesColumnId,
    yColumnId: mapping.yColumnId,
  };
}

/** Builder for the new-chart wizard; ids/timestamps/options live here, not in the UI. */
export interface NewChartOptions {
  table: TableMeta;
  /** Required; falls back to the table name in the wizard. */
  title: string;
  kind: ChartKind;
  mapping: ChartMapping;
  /** Overrides merged over `DEFAULT_CHART_OPTIONS` (`sampling` merged shallowly). */
  options?: Partial<ChartOptions>;
  filter?: FilterPredicate;
  sort?: SortSpec[];
  now?: Date;
  uuid?: UuidFactory;
}

export function createNewChartPayload(options: NewChartOptions): ChartCreatePayload {
  const title = options.title.trim();
  if (title.length === 0 || title.length > 80) {
    invalid('The chart title must contain 1 to 80 characters.');
  }
  const timestamp = createTimestamp(options.now ?? new Date());
  const chartId = createChartId(options.uuid);
  const viewId = createViewId(options.uuid);
  const defaults = defaultChartOptions();
  const overrides = options.options ?? {};
  const chartOptions: ChartOptions = {
    ...defaults,
    ...overrides,
    sampling: { ...defaults.sampling, ...(overrides.sampling ?? {}) },
  };
  const chart: ChartSpec = {
    id: chartId,
    title,
    kind: options.kind,
    tableId: options.table.id,
    mapping: cloneMapping(options.mapping),
    ...(options.filter === undefined ? {} : { filter: cloneFilter(options.filter) }),
    sort: (options.sort ?? []).map((spec) => ({ ...spec })),
    options: chartOptions,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const view: ViewDef = {
    id: viewId,
    kind: 'chart',
    refId: chartId,
    title,
  };
  return { chart, view };
}

function mappingDetail(chart: ChartSpec, table: TableMeta): string {
  const issues = [
    ...validateChartMapping(table, chart.mapping),
    ...(chart.filter === undefined ? [] : validateFilterPredicate(table, chart.filter)),
    ...validateSortSpecs(table, chart.sort),
  ];
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path}: ${issue.code}`)
    .join('; ');
}

function assertViewShape(view: ViewDef, chartId: string, state: Draft<AppState>): void {
  if (state.views[view.id] !== undefined) {
    invalid('The chart view already exists.');
  }
  if (view.kind !== 'chart' || view.refId !== chartId) {
    invalid('A chart view must reference its chart.');
  }
  if (view.tableView !== undefined) {
    invalid('A chart view must not carry tableView state.');
  }
}

export function createChartCreateCommand(
  options: ChartCommandOptions = {},
): CommandDefinition<ChartCreatePayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'chart.create',
    parse: parseChartCreate,
    apply(draft: Draft<AppState>, payload: ChartCreatePayload): void {
      const { chart, view } = payload;
      if (draft.charts[chart.id] !== undefined) {
        invalid(`A chart with id "${chart.id}" already exists.`);
      }
      const tableData = draft.tables[chart.tableId];
      if (tableData === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The chart table does not exist.');
      }
      const detail = mappingDetail(chart, tableData.table);
      if (detail.length > 0) {
        invalid('The chart mapping is invalid.', detail);
      }
      assertViewShape(view, chart.id, draft);

      draft.charts[chart.id] = chart;
      draft.views[view.id] = view;
      addViewToLayout(draft.layout, view.id);
      syncActiveSelection(draft);
      touchWorkspace(draft, createTimestamp(now()));
    },
  };
}

export function createChartUpdateCommand(
  options: ChartCommandOptions = {},
): CommandDefinition<ChartUpdatePayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'chart.update',
    parse: parseChartUpdate,
    apply(draft: Draft<AppState>, payload: ChartUpdatePayload): void {
      const chart = payload.chart;
      const existing = draft.charts[chart.id];
      if (existing === undefined) {
        invalid('The chart does not exist.');
      }
      if (draft.tables[chart.tableId] === undefined) {
        throw createAppError('E_TABLE_NOT_FOUND', 'The chart table does not exist.');
      }
      // Stamped here so a stale editor payload can never rewind either stamp.
      const next: ChartSpec = {
        ...chart,
        createdAt: existing.createdAt,
        updatedAt: createTimestamp(now()),
      };
      draft.charts[chart.id] = next;
      if (next.title !== existing.title) {
        // A chart tab always mirrors its chart's title (SPEC §12: one view per
        // chart); renaming a chart must not leave a stale tab label behind.
        for (const view of Object.values(draft.views)) {
          if (view.kind === 'chart' && view.refId === chart.id) {
            view.title = next.title;
          }
        }
      }
      if (draft.workspace !== null) {
        draft.workspace.updatedAt = createTimestamp(now());
      }
    },
  };
}

export function createChartDeleteCommand(
  options: ChartCommandOptions = {},
): CommandDefinition<ChartDeletePayload> {
  const now = options.now ?? ((): Date => new Date());

  return {
    name: 'chart.delete',
    parse: (payload: unknown): ChartDeletePayload => ({
      chartId: parseChartId(payload, 'chart.delete'),
    }),
    apply(draft: Draft<AppState>, payload: ChartDeletePayload): void {
      if (draft.charts[payload.chartId] === undefined) {
        invalid('The chart does not exist.');
      }
      const removedViewIds = Object.values(draft.views)
        .filter((view) => view.kind === 'chart' && view.refId === payload.chartId)
        .map((view) => view.id);
      delete draft.charts[payload.chartId];
      for (const viewId of removedViewIds) {
        delete draft.views[viewId];
        removeViewFromLayout(draft.layout, viewId);
      }
      syncActiveSelection(draft);
      touchWorkspace(draft, createTimestamp(now()));
    },
  };
}
