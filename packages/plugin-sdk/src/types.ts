/**
 * Public plugin contract (SPEC §14.2, T6.1/ADR-052).
 *
 * Everything a statically imported plugin may see. The package depends on
 * `@curve/domain` only and never imports React, Electron, fs or table-engine;
 * plugins must not reach into app internals (SPEC §4.3.6).
 */

import type {
  BuiltinColumnType,
  Cell,
  ChartKind,
  ChartOptions,
  ColumnDef,
  ErrorCode,
} from '@curve/domain';

/** Who registered a contribution (ADR-052). */
export type ContributionSource =
  { readonly kind: 'builtin' } | { readonly kind: 'plugin'; readonly pluginId: string };

export interface RegistryEntry<T> {
  readonly id: string;
  readonly def: T;
  readonly source: ContributionSource;
}

/**
 * Pure data + subscription registry. Builtins come first in `list()`, then
 * plugin contributions in registration order; `replace` keeps the position.
 */
export interface Registry<T> {
  register(id: string, def: T): () => void;
  replace(id: string, def: T): void;
  get(id: string): T | undefined;
  list(): ReadonlyArray<RegistryEntry<T>>;
  /** Called synchronously after every mutation; the argument is a snapshot. */
  subscribe(listener: (entries: ReadonlyArray<RegistryEntry<T>>) => void): () => void;
  dispose(): void;
}

export interface PluginLogger {
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

export interface PluginDefinition {
  /** Reverse-domain id, for example `com.curvealmanac.sample`. */
  id: string;
  name: string;
  /** Semver of the plugin itself. */
  version: string;
  /** Host API version the plugin targets; v1 host is `"1.0"`. */
  apiVersion: string;
  /** v2 reservation; v1 ignores it but keeps the field (SPEC §14.5). */
  permissions?: string[];
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface PluginContext {
  readonly apiVersion: '1.0';
  readonly fields: Registry<FieldTypeDef>;
  readonly importers: Registry<ImporterDef>;
  readonly chartKinds: Registry<ChartKindDef>;
  readonly commands: Registry<CommandDef>;
  readonly log: PluginLogger;
}

export interface FieldTypeDef {
  /** Must not collide with a builtin type (`number`/`text`/`date`/`boolean`/`enum`). */
  id: string;
  label: string;
  /** Physical storage type; decides the Cell shape in JSONL (ADR-015). */
  storageType: BuiltinColumnType;
  parseText(raw: string): { ok: true; value: Cell } | { ok: false; message: string };
  format(value: Cell, ctx: { locale: string; precision?: number; unit?: string }): string;
  validate(value: Cell, column: ColumnDef): string | null;
  compare(a: Cell, b: Cell): number;
  defaultWidth: number;
}

export type ImportCellValue = string | number | boolean | null;
export type ImportColumnType = 'text' | 'number' | 'date' | 'boolean';

export interface ImportInput {
  fileName: string;
  text: string;
  locale: 'zh-CN' | 'en-US';
}

/**
 * Structurally compatible with table-engine's `ImportDataset` (ADR-052): the
 * wizard can consume it without plugin-sdk depending on table-engine.
 */
export interface ImportResult {
  headers: string[];
  rows: ImportCellValue[][];
  columns?: { name: string; type: ImportColumnType }[];
  warnings?: string[];
}

export interface ImporterDef {
  id: string;
  label: string;
  extensions: string[];
  parse(input: ImportInput, signal: AbortSignal): Promise<ImportResult>;
}

export interface ChartKindDef {
  id: string;
  label: string;
  /** v1 maps this to the ECharts series type. */
  seriesType: ChartKind;
  defaults?: Partial<ChartOptions>;
}

export interface PluginCommandContext {
  readonly log: PluginLogger;
  execute(commandId: string, payload: unknown): Promise<void>;
}

export interface CommandDef {
  /** `plugin.<pluginId>.<action>` by convention. */
  id: string;
  label: string;
  run(ctx: PluginCommandContext): Promise<void>;
}

export type PluginStatus = 'pending' | 'active' | 'inactive' | 'disabled';

export interface PluginErrorInfo {
  readonly code: ErrorCode;
  readonly message: string;
}

export interface PluginState {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string;
  readonly status: PluginStatus;
  readonly error?: PluginErrorInfo;
}

export interface PluginHostOptions {
  readonly plugins: readonly PluginDefinition[];
  /** Defaults to a console logger; tests inject an in-memory one. */
  readonly logger?: PluginLogger;
}

export interface PluginHost {
  readonly apiVersion: '1.0';
  /** Host-owned builtin contributions; plugins get scoped views of the same state. */
  readonly fields: Registry<FieldTypeDef>;
  readonly importers: Registry<ImporterDef>;
  readonly chartKinds: Registry<ChartKindDef>;
  readonly commands: Registry<CommandDef>;
  activateAll(): Promise<readonly PluginState[]>;
  activate(pluginId: string): Promise<PluginState>;
  deactivate(pluginId: string): Promise<PluginState>;
  getPlugins(): readonly PluginState[];
  /** In-memory only in T6.1 (ADR-052); manual disable/persistence is T6.3. */
  getDisabled(): readonly PluginState[];
  dispose(): void;
}
