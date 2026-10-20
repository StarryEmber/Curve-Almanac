/**
 * Domain model types (SPEC §6).
 *
 * These are the canonical shapes of the workspace format: the Zod schemas in
 * `schemas.ts` are checked against them at compile time, so a type change
 * without a schema change (or the other way round) does not build.
 *
 * Nothing in this package may import UI, Electron, Node builtins or ECharts
 * (AGENTS §2.3); see `.dependency-cruiser.cjs`.
 */

/** A cell as it is stored on disk (SPEC §6.1, §7.3). */
export type Cell = number | string | boolean | null;

/** Storage types allowed in v1 (ADR-015). */
export type BuiltinColumnType = 'number' | 'text' | 'date' | 'boolean' | 'enum';

/** v1 storage layer only allows the builtin set. */
export type ColumnType = BuiltinColumnType;

/** What a column is used for in charts and the UI. */
export type ColumnRole = 'x' | 'y' | 'series' | 'label' | 'none';

/** Comparison operators shared by filters and conditional formatting (ADR-009). */
export type CompareOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'between'
  | 'isNull'
  | 'notNull';

export interface EnumOption {
  value: string;
  label: string;
}

export interface ColumnDef {
  /** `col_<uuid>` (schema accepts short ids so SPEC §7.2 examples stay valid). */
  id: string;
  /** Stable machine name, unique per table. */
  key: string;
  label: string;
  type: ColumnType;
  /** Semantic type; defaults to `type`, may point at a plugin field type. */
  fieldTypeId?: string;
  role: ColumnRole;
  unit?: string;
  precision?: number;
  /** Required when `type === 'enum'`, 1..100 entries. */
  enumOptions?: EnumOption[];
  required?: boolean;
  width?: number;
}

export interface TableMeta {
  id: string;
  name: string;
  /** Relative path, `tables/<tableId>.jsonl`. */
  file: string;
  schemaVersion: number;
  columns: ColumnDef[];
  /** Column id of the primary key; must be a `text` column. */
  primaryKey: string;
  /** Hint only; recomputed on load (SPEC §7.5). */
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Row {
  id: string;
  /** Length always equals `TableMeta.columns.length`. */
  values: Cell[];
}

export interface SortSpec {
  columnId: string;
  direction: 'asc' | 'desc';
}

/** Untrusted predicate AST — never evaluated as code (ADR-009). */
export type FilterPredicate =
  | { kind: 'all' | 'any'; children: FilterPredicate[] }
  | { kind: 'compare'; columnId: string; op: CompareOp; value?: Cell; value2?: Cell };

export interface TableViewState {
  tableId: string;
  /** `builtin.<name>` or `sty_<uuid>` (SPEC §6.6.6). */
  styleId: string;
  columnOrder: string[];
  widths: Record<string, number>;
  hiddenColumnIds: string[];
  sort: SortSpec[];
  filter?: FilterPredicate;
  frozenColumnCount: number;
}

export type ViewKind = 'table' | 'chart';

export interface ViewDef {
  id: string;
  kind: ViewKind;
  /** `tableId` for table views, `chartId` for chart views. */
  refId: string;
  title: string;
  /** Required when `kind === 'table'`. */
  tableView?: TableViewState;
}

export type ChartKind = 'line' | 'scatter' | 'bar';

export type ChartMapping =
  | { layout: 'wide'; xColumnId: string; yColumnIds: string[] }
  | { layout: 'long'; xColumnId: string; seriesColumnId: string; yColumnId: string };

export interface ChartOptions {
  smooth: boolean;
  showSymbol: boolean;
  lineWidth: number;
  paletteId: 'default' | 'muted' | 'vivid' | 'colorblind';
  background: 'auto' | 'light' | 'dark';
  showGrid: boolean;
  legend: 'top' | 'right' | 'bottom' | 'none';
  xLabel?: string;
  yLabel?: string;
  yStartAtZero: boolean;
  numberDigits: number;
  sampling: { enabled: boolean; threshold: number; target: number };
}

export interface ChartSpec {
  id: string;
  title: string;
  kind: ChartKind;
  tableId: string;
  mapping: ChartMapping;
  filter?: FilterPredicate;
  sort: SortSpec[];
  options: ChartOptions;
  version: 1;
  createdAt: string;
  updatedAt: string;
}

export type Density = 'compact' | 'normal' | 'comfortable';
export type GridMode = 'none' | 'horizontal' | 'all';

export interface TableStyleTokens {
  density: Density;
  fontFamily: string;
  fontSize: number;
  header: { background: string; foreground: string; bold: boolean; borderColor: string };
  body: {
    background: string;
    alternateBackground: string;
    foreground: string;
    borderColor: string;
    grid: GridMode;
  };
  selection: { background: string; foreground: string };
  radius: number;
  cellPaddingX: number;
  cellPaddingY: number;
  zebra: boolean;
}

export interface ColumnStyleOverride {
  label?: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  numberFormat?: { style: 'decimal' | 'percent' | 'currency'; digits: number; currency?: string };
  dateFormat?: 'date' | 'date-time' | 'time' | 'iso';
  cellRender?: 'auto' | 'text' | 'number' | 'date' | 'badge' | 'bar';
}

export interface ConditionalRule {
  id: string;
  enabled: boolean;
  label?: string;
  target: { kind: 'row' } | { kind: 'cell'; columnId: string };
  when: FilterPredicate;
  style: {
    background?: string;
    foreground?: string;
    bold?: boolean;
    italic?: boolean;
    icon?: 'up' | 'down' | 'warning';
  };
}

export interface TableStyle {
  /** `sty_<uuid>`, or `builtin.<name>` for the code constants (SPEC §6.4). */
  id: string;
  name: string;
  builtin: boolean;
  tokens: TableStyleTokens;
  columnOverrides: Record<string, ColumnStyleOverride>;
  /** At most 50, first match wins. */
  conditionalRules: ConditionalRule[];
}

export type LayoutNode =
  | { type: 'pane'; viewIds: string[]; activeViewId: string | null }
  | {
      type: 'split';
      direction: 'horizontal' | 'vertical';
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };

export interface WorkspaceSettings {
  theme: 'system' | 'light' | 'dark';
  locale: 'zh-CN' | 'en-US';
  defaultTableStyleId: string;
  autosave: boolean;
}

export interface WorkspaceManifest {
  formatVersion: 1;
  id: string;
  name: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  tables: TableMeta[];
  charts: ChartSpec[];
  views: ViewDef[];
  /** User styles only; builtin styles are code constants and never persisted. */
  tableStyles: TableStyle[];
  layout: LayoutNode;
  settings: WorkspaceSettings;
}

/* -------------------------------------------------------------------------- */
/* Validation results                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Error codes used by domain validation. They mirror the SPEC §18 codes so the
 * persistence and UI layers can map a failure to a user-facing message without
 * re-interpreting strings.
 */
export type ValidationIssueCode =
  'E_TYPE' | 'E_REQUIRED' | 'E_ENUM' | 'E_RANGE' | 'E_DUPLICATE_KEY' | 'E_VALIDATION';

export interface ValidationIssue {
  /** Dotted path inside the parsed value, e.g. `columns[2].key`. */
  path: string;
  code: ValidationIssueCode;
  message: string;
}

/** Structured result of parsing untrusted input; never throws. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; issues: ValidationIssue[] };

/** Structured result of validating or coercing a single cell. */
export type CellResult =
  { ok: true; value: Cell } | { ok: false; code: ValidationIssueCode; message: string };
