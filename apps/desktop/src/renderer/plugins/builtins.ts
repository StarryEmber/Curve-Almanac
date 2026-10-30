/**
 * Builtin contributions registered into the plugin host (T6.3, SPEC §14.4).
 *
 * The UI must not carry its own copy of these lists any more: storage types
 * (the five builtin field types), the CSV/TSV and JSON importers and the three
 * v1 chart kinds are registered here through the same `Registry` API plugins
 * use, so a single registry snapshot drives every selector and removal of a
 * contribution is instantly visible (T6.3, ADR-054).
 *
 * Builtin field types use the storage type as their id, so a plugin can never
 * claim `number`/`text`/… and `ColumnDef.fieldTypeId` keeps pointing only at
 * semantic types (`com.curvealmanac.rating`), never at a storage type. Their
 * semantic functions delegate to `@curve/domain` where a rule already exists;
 * the app renders columns without a `fieldTypeId` through the domain formatter
 * directly, so these definitions describe the builtin capability rather than
 * duplicating the display pipeline.
 */

import { coerceCell, formatCellValue } from '@curve/domain';
import type { BuiltinColumnType, Cell, ColumnDef } from '@curve/domain';
import type {
  ChartKindDef,
  FieldTypeDef,
  ImporterDef,
  ImportResult,
  PluginHost,
} from '@curve/plugin-sdk';
import { parseCsv, parseJson } from '@curve/table-engine';
import type { ParsedImportData } from '@curve/table-engine';

/** Storage types in the order the column dialog lists them (SPEC §6.1). */
export const BUILTIN_COLUMN_TYPES: readonly BuiltinColumnType[] = [
  'text',
  'number',
  'date',
  'boolean',
  'enum',
];

const BUILTIN_FIELD_TYPE_LABELS: Record<BuiltinColumnType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  boolean: 'Boolean',
  enum: 'Enum',
};

const BUILTIN_FIELD_TYPE_WIDTHS: Record<BuiltinColumnType, number> = {
  text: 160,
  number: 120,
  date: 120,
  boolean: 96,
  enum: 128,
};

/** Chat kind ids of the v1 renderer; `ChartSpec.kind` is one of these (SPEC §11.3). */
export const BUILTIN_CHART_KIND_IDS = ['line', 'scatter', 'bar'] as const;

export type BuiltinChartKindId = (typeof BUILTIN_CHART_KIND_IDS)[number];

const BUILTIN_CHART_KIND_LABELS: Record<BuiltinChartKindId, string> = {
  line: 'Line',
  scatter: 'Scatter',
  bar: 'Bar',
};

export const BUILTIN_CSV_IMPORTER_ID = 'builtin.csv';
export const BUILTIN_JSON_IMPORTER_ID = 'builtin.json';

export type BuiltinImporterFormat = 'csv' | 'json';

/** Importer id → the parser the import Worker must use (T6.3). */
export const BUILTIN_IMPORTER_FORMATS: ReadonlyMap<string, BuiltinImporterFormat> = new Map([
  [BUILTIN_CSV_IMPORTER_ID, 'csv'],
  [BUILTIN_JSON_IMPORTER_ID, 'json'],
]);

export function builtinImporterFormat(importerId: string): BuiltinImporterFormat | undefined {
  return BUILTIN_IMPORTER_FORMATS.get(importerId);
}

function stubColumn(type: BuiltinColumnType): ColumnDef {
  return {
    id: `builtin.${type}`,
    key: type,
    label: BUILTIN_FIELD_TYPE_LABELS[type],
    type,
    role: 'none',
  };
}

function parseBuiltinText(
  type: BuiltinColumnType,
  raw: string,
): { ok: true; value: Cell } | { ok: false; message: string } {
  if (type === 'enum') {
    // Enum values are text; whether a value is one of the column's options is
    // `validate`'s job (the T6.2 split between type parsing and value domain).
    const trimmed = raw.trim();
    return { ok: true, value: trimmed.length === 0 ? null : trimmed };
  }
  const coerced = coerceCell(raw, stubColumn(type));
  return coerced.ok ? { ok: true, value: coerced.value } : { ok: false, message: coerced.message };
}

function formatBuiltin(
  type: BuiltinColumnType,
  value: Cell,
  context: { locale: string; precision?: number; unit?: string },
): string {
  if (value === null) {
    return '';
  }
  const column: ColumnDef = {
    ...stubColumn(type),
    ...(context.precision === undefined ? {} : { precision: context.precision }),
    ...(context.unit === undefined ? {} : { unit: context.unit }),
  };
  return formatCellValue(value, column, { locale: context.locale });
}

function validateBuiltin(type: BuiltinColumnType, value: Cell, _column: ColumnDef): string | null {
  if (value === null || value === '') {
    // Emptiness (and `required`) is enforced by the storage rules of T2.2.
    return null;
  }
  switch (type) {
    case 'text':
      return typeof value === 'string' ? null : 'The value must be text.';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : 'The value must be a finite number.';
    case 'date':
      return typeof value === 'number' && Number.isInteger(value)
        ? null
        : 'The value must be epoch milliseconds.';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'The value must be a boolean.';
    case 'enum':
      return typeof value === 'string' ? null : 'The value must be one of the enum options.';
  }
}

function compareBuiltin(type: BuiltinColumnType, a: Cell, b: Cell): number {
  const leftEmpty = a === null || a === '';
  const rightEmpty = b === null || b === '';
  if (leftEmpty || rightEmpty) {
    return leftEmpty && rightEmpty ? 0 : leftEmpty ? 1 : -1;
  }
  switch (type) {
    case 'number':
    case 'date':
      return Number(a) - Number(b);
    case 'boolean':
      return Number(a === true) - Number(b === true);
    case 'text':
    case 'enum':
      return String(a).localeCompare(String(b));
  }
}

function builtinFieldType(type: BuiltinColumnType): FieldTypeDef {
  return {
    id: type,
    label: BUILTIN_FIELD_TYPE_LABELS[type],
    storageType: type,
    parseText: (raw: string) => parseBuiltinText(type, raw),
    format: (value: Cell, context: { locale: string; precision?: number; unit?: string }) =>
      formatBuiltin(type, value, context),
    validate: (value: Cell, column: ColumnDef) => validateBuiltin(type, value, column),
    compare: (a: Cell, b: Cell) => compareBuiltin(type, a, b),
    defaultWidth: BUILTIN_FIELD_TYPE_WIDTHS[type],
  };
}

/** The five builtin field types, in dialog order (SPEC §14.4). */
export const BUILTIN_FIELD_TYPES: readonly FieldTypeDef[] =
  BUILTIN_COLUMN_TYPES.map(builtinFieldType);

function toImportResult(parsed: ParsedImportData): ImportResult {
  return {
    headers: [...parsed.headers],
    rows: parsed.rows.map((row) => [...row]),
    columns: parsed.columns.map((column) => ({ name: column.name, type: column.type })),
    warnings: [...parsed.warnings],
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('The import was cancelled.');
  }
}

/**
 * Builtin CSV/TSV importer.
 *
 * The wizard runs builtin files through the import Worker (encoding sniffing,
 * delimiter/header overrides and 100k-row planning stay off the main thread);
 * the registry entry describes the same capability and is what an explicit
 * "CSV/TSV" selection resolves to (`builtinImporterFormat` forces the Worker's
 * parser). `parse` here is the programmatic equivalent used by tests and by any
 * future surface that parses text in the renderer.
 */
export const builtinCsvImporter: ImporterDef = {
  id: BUILTIN_CSV_IMPORTER_ID,
  label: 'CSV / TSV',
  extensions: ['.csv', '.tsv', '.txt'],
  async parse(input, signal): Promise<ImportResult> {
    throwIfAborted(signal);
    const parsed = parseCsv(input.text);
    throwIfAborted(signal);
    return toImportResult(parsed);
  },
};

/** Builtin JSON importer (array of objects or `{ rows: [...] }`). */
export const builtinJsonImporter: ImporterDef = {
  id: BUILTIN_JSON_IMPORTER_ID,
  label: 'JSON',
  extensions: ['.json'],
  async parse(input, signal): Promise<ImportResult> {
    throwIfAborted(signal);
    const parsed = parseJson(input.text);
    throwIfAborted(signal);
    return toImportResult(parsed);
  },
};

export const BUILTIN_IMPORTERS: readonly ImporterDef[] = [builtinCsvImporter, builtinJsonImporter];

/** The three v1 chart kinds; plugin kinds are presets over these series types. */
export const BUILTIN_CHART_KINDS: readonly ChartKindDef[] = BUILTIN_CHART_KIND_IDS.map((id) => ({
  id,
  label: BUILTIN_CHART_KIND_LABELS[id],
  seriesType: id,
}));

/**
 * Registers every builtin contribution into the host registries. Called once
 * from `activateRendererPlugins()` before plugins activate, so builtin entries
 * always come first in `list()` (SPEC §14.3).
 */
export function registerBuiltinContributions(host: PluginHost): void {
  for (const fieldType of BUILTIN_FIELD_TYPES) {
    host.fields.register(fieldType.id, fieldType);
  }
  for (const importer of BUILTIN_IMPORTERS) {
    host.importers.register(importer.id, importer);
  }
  for (const chartKind of BUILTIN_CHART_KINDS) {
    host.chartKinds.register(chartKind.id, chartKind);
  }
}
