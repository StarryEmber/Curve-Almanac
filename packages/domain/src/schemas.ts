import { z } from 'zod';

import {
  MAX_CELL_TEXT_LENGTH,
  MAX_CHARTS_PER_WORKSPACE,
  MAX_COLUMNS_PER_TABLE,
  MAX_CONDITIONAL_RULES,
  MAX_ENUM_OPTIONS,
  MAX_FILTER_CHILDREN,
  MAX_FROZEN_COLUMNS,
  MAX_TABLES_PER_WORKSPACE,
} from './limits';

import type {
  Cell,
  CellResult,
  ChartMapping,
  ChartOptions,
  ChartSpec,
  ColumnDef,
  ColumnStyleOverride,
  ConditionalRule,
  EnumOption,
  FilterPredicate,
  LayoutNode,
  ParseResult,
  Row,
  SortSpec,
  TableMeta,
  TableStyle,
  TableStyleTokens,
  TableViewState,
  ValidationIssue,
  ViewDef,
  WorkspaceManifest,
  WorkspaceSettings,
} from './types';

/**
 * Zod schemas for every persisted shape (SPEC §6, ADR-007).
 *
 * Policy:
 * - objects are strict: an unknown field means the format moved on without a
 *   `formatVersion` bump, so it must be rejected rather than silently dropped;
 * - ids are lenient on read (`col_time` from the SPEC §7.2 example is legal)
 *   while `factories.ts` always writes `<prefix>_<uuid>`;
 * - semantic cross-field rules that need table/view context live in
 *   `invariants.ts`, not here.
 */

/* -------------------------------------------------------------------------- */
/* Scalars                                                                    */
/* -------------------------------------------------------------------------- */

const ID_SEGMENT = '[A-Za-z0-9][A-Za-z0-9_-]*';

const COLUMN_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TABLE_FILE_PATTERN = /^tables\/[A-Za-z0-9._-]+\.jsonl$/;
const BUILTIN_STYLE_PATTERN = /^builtin\.[a-z0-9-]+$/;
const STYLE_ID_PATTERN = /^sty_[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** `2026-10-20T05:00:00.000Z`; offsets are tolerated on read. */
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const cellSchema = z.union([z.number().finite(), z.string(), z.boolean(), z.null()]);

export const builtinColumnTypeSchema = z.enum(['number', 'text', 'date', 'boolean', 'enum']);

export const columnRoleSchema = z.enum(['x', 'y', 'series', 'label', 'none']);

export const compareOpSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'startsWith',
  'endsWith',
  'between',
  'isNull',
  'notNull',
]);

function idSchema(prefix: string, label: string): z.ZodString {
  return z
    .string()
    .regex(new RegExp(`^${prefix}_${ID_SEGMENT}$`), `${label} must look like ${prefix}_<id>`);
}

export const workspaceIdSchema = idSchema('ws', 'workspace id');
export const tableIdSchema = idSchema('tbl', 'table id');
export const columnIdSchema = idSchema('col', 'column id');
export const rowIdSchema = idSchema('row', 'row id');
export const chartIdSchema = idSchema('cht', 'chart id');
export const viewIdSchema = idSchema('viw', 'view id');
export const styleIdSchema = idSchema('sty', 'style id');
export const ruleIdSchema = idSchema('rule', 'rule id');

/** A table view points at a chart or at a table. */
export const viewRefIdSchema = z
  .string()
  .regex(/^(tbl|cht)_[A-Za-z0-9][A-Za-z0-9_-]*$/, 'view refId must be a table or chart id');

/** `builtin.<name>` (code constant) or `sty_<id>` (persisted style). */
export const styleRefSchema = z
  .string()
  .refine(
    (value) => BUILTIN_STYLE_PATTERN.test(value) || STYLE_ID_PATTERN.test(value),
    'style id must be "builtin.<name>" or "sty_<id>"',
  );

/* -------------------------------------------------------------------------- */
/* Columns, tables, rows                                                      */
/* -------------------------------------------------------------------------- */

export const enumOptionSchema: z.ZodType<EnumOption> = z.strictObject({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const columnDefSchema: z.ZodType<ColumnDef> = z
  .strictObject({
    id: columnIdSchema,
    key: z.string().regex(COLUMN_KEY_PATTERN, 'column key must match ^[A-Za-z_][A-Za-z0-9_]*$'),
    label: z.string().min(1).max(80),
    type: builtinColumnTypeSchema,
    fieldTypeId: z.string().min(1).max(120).optional(),
    role: columnRoleSchema,
    unit: z.string().max(16).optional(),
    precision: z.number().int().min(0).max(10).optional(),
    enumOptions: z.array(enumOptionSchema).min(1).max(MAX_ENUM_OPTIONS).optional(),
    required: z.boolean().optional(),
    width: z.number().int().min(80).max(800).optional(),
  })
  .superRefine((column, context) => {
    if (column.type === 'enum' && column.enumOptions === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['enumOptions'],
        message: 'enum columns require enumOptions',
      });
      return;
    }
    const seen = new Set<string>();
    for (const [index, option] of (column.enumOptions ?? []).entries()) {
      if (seen.has(option.value)) {
        context.addIssue({
          code: 'custom',
          path: ['enumOptions', index, 'value'],
          message: `duplicate enum value "${option.value}"`,
        });
      }
      seen.add(option.value);
    }
  });

export const tableMetaSchema: z.ZodType<TableMeta> = z.strictObject({
  id: tableIdSchema,
  name: z.string().min(1).max(80),
  file: z
    .string()
    .regex(TABLE_FILE_PATTERN, 'table file must be a relative path under tables/*.jsonl'),
  schemaVersion: z.literal(1),
  columns: z.array(columnDefSchema).min(1).max(MAX_COLUMNS_PER_TABLE),
  primaryKey: columnIdSchema,
  rowCount: z.number().int().min(0),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const rowSchema: z.ZodType<Row> = z.strictObject({
  id: rowIdSchema,
  values: z.array(cellSchema),
});

/* -------------------------------------------------------------------------- */
/* Views, filters, sorting                                                    */
/* -------------------------------------------------------------------------- */

export const sortSpecSchema: z.ZodType<SortSpec> = z.strictObject({
  columnId: columnIdSchema,
  direction: z.enum(['asc', 'desc']),
});

export const filterPredicateSchema: z.ZodType<FilterPredicate> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('all'),
      children: z.array(filterPredicateSchema).min(1).max(MAX_FILTER_CHILDREN),
    }),
    z.strictObject({
      kind: z.literal('any'),
      children: z.array(filterPredicateSchema).min(1).max(MAX_FILTER_CHILDREN),
    }),
    z.strictObject({
      kind: z.literal('compare'),
      columnId: columnIdSchema,
      op: compareOpSchema,
      value: cellSchema.optional(),
      value2: cellSchema.optional(),
    }),
  ]),
);

export const tableViewStateSchema: z.ZodType<TableViewState> = z.strictObject({
  tableId: tableIdSchema,
  styleId: styleRefSchema,
  columnOrder: z.array(columnIdSchema),
  widths: z.record(columnIdSchema, z.number().min(0)),
  hiddenColumnIds: z.array(columnIdSchema),
  sort: z.array(sortSpecSchema),
  filter: filterPredicateSchema.optional(),
  frozenColumnCount: z.number().int().min(0).max(MAX_FROZEN_COLUMNS),
});

export const viewDefSchema: z.ZodType<ViewDef> = z.strictObject({
  id: viewIdSchema,
  kind: z.enum(['table', 'chart']),
  refId: viewRefIdSchema,
  title: z.string().min(1),
  tableView: tableViewStateSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Charts                                                                     */
/* -------------------------------------------------------------------------- */

export const chartMappingSchema: z.ZodType<ChartMapping> = z.discriminatedUnion('layout', [
  z.strictObject({
    layout: z.literal('wide'),
    xColumnId: columnIdSchema,
    yColumnIds: z.array(columnIdSchema).min(1),
  }),
  z.strictObject({
    layout: z.literal('long'),
    xColumnId: columnIdSchema,
    seriesColumnId: columnIdSchema,
    yColumnId: columnIdSchema,
  }),
]);

export const chartOptionsSchema: z.ZodType<ChartOptions> = z.strictObject({
  smooth: z.boolean(),
  showSymbol: z.boolean(),
  lineWidth: z.number().min(1).max(6),
  paletteId: z.enum(['default', 'muted', 'vivid', 'colorblind']),
  background: z.enum(['auto', 'light', 'dark']),
  showGrid: z.boolean(),
  legend: z.enum(['top', 'right', 'bottom', 'none']),
  xLabel: z.string().min(1).optional(),
  yLabel: z.string().min(1).optional(),
  yStartAtZero: z.boolean(),
  numberDigits: z.number().int().min(0).max(6),
  sampling: z.strictObject({
    enabled: z.boolean(),
    threshold: z.number().int().positive(),
    target: z.number().int().positive(),
  }),
});

export const chartSpecSchema: z.ZodType<ChartSpec> = z.strictObject({
  id: chartIdSchema,
  title: z.string().min(1),
  kind: z.enum(['line', 'scatter', 'bar']),
  tableId: tableIdSchema,
  mapping: chartMappingSchema,
  filter: filterPredicateSchema.optional(),
  sort: z.array(sortSpecSchema),
  options: chartOptionsSchema,
  version: z.literal(1),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

/* -------------------------------------------------------------------------- */
/* Table styles                                                               */
/* -------------------------------------------------------------------------- */

const colorSchema = z.string().min(1).max(64);

export const tableStyleTokensSchema: z.ZodType<TableStyleTokens> = z.strictObject({
  density: z.enum(['compact', 'normal', 'comfortable']),
  fontFamily: z.string().min(1).max(120),
  fontSize: z.number().min(11).max(18),
  header: z.strictObject({
    background: colorSchema,
    foreground: colorSchema,
    bold: z.boolean(),
    borderColor: colorSchema,
  }),
  body: z.strictObject({
    background: colorSchema,
    alternateBackground: colorSchema,
    foreground: colorSchema,
    borderColor: colorSchema,
    grid: z.enum(['none', 'horizontal', 'all']),
  }),
  selection: z.strictObject({ background: colorSchema, foreground: colorSchema }),
  radius: z.number().min(0).max(12),
  cellPaddingX: z.number().min(4).max(24),
  cellPaddingY: z.number().min(2).max(16),
  zebra: z.boolean(),
});

export const columnStyleOverrideSchema: z.ZodType<ColumnStyleOverride> = z.strictObject({
  label: z.string().min(1).max(80).optional(),
  width: z.number().int().min(80).max(800).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  numberFormat: z
    .strictObject({
      style: z.enum(['decimal', 'percent', 'currency']),
      digits: z.number().int().min(0).max(10),
      currency: z.string().min(1).max(8).optional(),
    })
    .optional(),
  dateFormat: z.enum(['date', 'date-time', 'time', 'iso']).optional(),
  cellRender: z.enum(['auto', 'text', 'number', 'date', 'badge', 'bar']).optional(),
});

export const conditionalRuleSchema: z.ZodType<ConditionalRule> = z.strictObject({
  id: ruleIdSchema,
  enabled: z.boolean(),
  label: z.string().min(1).max(120).optional(),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('row') }),
    z.strictObject({ kind: z.literal('cell'), columnId: columnIdSchema }),
  ]),
  when: filterPredicateSchema,
  style: z.strictObject({
    background: colorSchema.optional(),
    foreground: colorSchema.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    icon: z.enum(['up', 'down', 'warning']).optional(),
  }),
});

export const tableStyleSchema: z.ZodType<TableStyle> = z.strictObject({
  id: z
    .string()
    .refine(
      (value) => STYLE_ID_PATTERN.test(value) || BUILTIN_STYLE_PATTERN.test(value),
      'style id must be "sty_<id>" or "builtin.<name>"',
    ),
  name: z.string().min(1).max(80),
  builtin: z.boolean(),
  tokens: tableStyleTokensSchema,
  columnOverrides: z.record(columnIdSchema, columnStyleOverrideSchema),
  conditionalRules: z.array(conditionalRuleSchema).max(MAX_CONDITIONAL_RULES),
});

/* -------------------------------------------------------------------------- */
/* Workspace                                                                  */
/* -------------------------------------------------------------------------- */

export const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('pane'),
      viewIds: z.array(viewIdSchema),
      activeViewId: viewIdSchema.nullable(),
    }),
    z.strictObject({
      type: z.literal('split'),
      direction: z.enum(['horizontal', 'vertical']),
      ratio: z.number().min(0.2).max(0.8),
      first: layoutNodeSchema,
      second: layoutNodeSchema,
    }),
  ]),
);

export const workspaceSettingsSchema: z.ZodType<WorkspaceSettings> = z.strictObject({
  theme: z.enum(['system', 'light', 'dark']),
  locale: z.enum(['zh-CN', 'en-US']),
  defaultTableStyleId: styleRefSchema,
  autosave: z.boolean(),
});

export const workspaceManifestSchema: z.ZodType<WorkspaceManifest> = z.strictObject({
  formatVersion: z.literal(1),
  id: workspaceIdSchema,
  name: z.string().min(1).max(80),
  appVersion: z.string().min(1).max(64),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  tables: z.array(tableMetaSchema).max(MAX_TABLES_PER_WORKSPACE),
  charts: z.array(chartSpecSchema).max(MAX_CHARTS_PER_WORKSPACE),
  views: z.array(viewDefSchema),
  tableStyles: z.array(tableStyleSchema),
  layout: layoutNodeSchema,
  settings: workspaceSettingsSchema,
});

/* -------------------------------------------------------------------------- */
/* Parsing helpers                                                            */
/* -------------------------------------------------------------------------- */

export function formatIssuePath(path: readonly PropertyKey[]): string {
  let formatted = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      formatted += `[${segment}]`;
      continue;
    }
    formatted = formatted === '' ? String(segment) : `${formatted}.${String(segment)}`;
  }
  return formatted;
}

function valueAtPath(input: unknown, path: readonly PropertyKey[]): unknown {
  let current = input;
  for (const key of path) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

function mapZodIssue(issue: z.ZodIssue, input: unknown): ValidationIssue {
  const path = formatIssuePath(issue.path);
  switch (issue.code) {
    case 'invalid_type':
      // Zod 4 does not expose the offending value, so distinguish "missing"
      // from "wrong type" by looking the path up in the original input.
      return {
        path,
        code: valueAtPath(input, issue.path) === undefined ? 'E_REQUIRED' : 'E_TYPE',
        message: issue.message,
      };
    case 'too_small':
    case 'too_big':
      return { path, code: 'E_RANGE', message: issue.message };
    case 'invalid_value':
      return { path, code: 'E_ENUM', message: issue.message };
    default:
      return { path, code: 'E_VALIDATION', message: issue.message };
  }
}

export function toValidationIssues(error: z.ZodError, input?: unknown): ValidationIssue[] {
  return error.issues.map((issue) => mapZodIssue(issue, input));
}

function parseWith<T>(schema: z.ZodType<T>, value: unknown): ParseResult<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, issues: toValidationIssues(result.error, value) };
}

/** Parses one `manifest.json`. Cross-object rules are checked by `invariants.ts`. */
export function parseManifest(value: unknown): ParseResult<WorkspaceManifest> {
  return parseWith(workspaceManifestSchema, value);
}

/** Parses one table entry from `manifest.tables`. */
export function parseTableMeta(value: unknown): ParseResult<TableMeta> {
  return parseWith(tableMetaSchema, value);
}

/** Parses one column definition (useful for column-management commands). */
export function parseColumnDef(value: unknown): ParseResult<ColumnDef> {
  return parseWith(columnDefSchema, value);
}

/** Parses one JSONL row object without column context. */
export function parseRow(value: unknown): ParseResult<Row> {
  return parseWith(rowSchema, value);
}

/**
 * Validates an already-typed cell against a column (JSONL read path).
 *
 * Unlike `coerceCell` this performs no conversion: anything that is not the
 * physical shape promised by `column.type` is rejected, so a corrupt file is
 * reported instead of silently normalised.
 */
export function parseCell(value: unknown, column: ColumnDef): CellResult {
  if (value === null || value === undefined) {
    return emptyCell(column);
  }

  switch (column.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? { ok: true, value }
        : typeError(column, 'a finite number');
    case 'date':
      return typeof value === 'number' && Number.isInteger(value)
        ? { ok: true, value }
        : typeError(column, 'epoch milliseconds (integer)');
    case 'boolean':
      return typeof value === 'boolean' ? { ok: true, value } : typeError(column, 'a boolean');
    case 'text': {
      if (typeof value !== 'string') {
        return typeError(column, 'a string');
      }
      if (value.length > MAX_CELL_TEXT_LENGTH) {
        return {
          ok: false,
          code: 'E_RANGE',
          message: `text cell in column "${column.key}" exceeds ${MAX_CELL_TEXT_LENGTH} characters`,
        };
      }
      return { ok: true, value };
    }
    case 'enum': {
      if (typeof value !== 'string') {
        return enumError(column);
      }
      const options = column.enumOptions ?? [];
      return options.some((option) => option.value === value)
        ? { ok: true, value }
        : enumError(column);
    }
  }
}

function emptyCell(column: ColumnDef): CellResult {
  if (column.required === true) {
    return { ok: false, code: 'E_REQUIRED', message: `column "${column.key}" is required` };
  }
  return { ok: true, value: null };
}

function typeError(column: ColumnDef, expected: string): CellResult {
  return {
    ok: false,
    code: 'E_TYPE',
    message: `column "${column.key}" expects ${expected}`,
  };
}

function enumError(column: ColumnDef): CellResult {
  return {
    ok: false,
    code: 'E_ENUM',
    message: `value of column "${column.key}" must be one of its enum values`,
  };
}

/** Narrowing helper shared by callers that need `Cell` from `unknown`. */
export function isCell(value: unknown): value is Cell {
  return cellSchema.safeParse(value).success;
}
