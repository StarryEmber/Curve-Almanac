/**
 * Table style constants and pure helpers (SPEC §6.4, §10.1, §10.3).
 *
 * Built-in styles are code constants: they are deeply frozen, never persisted
 * in `manifest.tableStyles`, and have stable ids. User styles live in the
 * manifest and are resolved by id at render time.
 */

import { createStyleId } from './factories';

import type { UuidFactory } from './factories';
import type {
  ColumnStyleOverride,
  ConditionalRule,
  FilterPredicate,
  TableStyle,
  TableStyleTokens,
} from './types';

/** Stable ids from SPEC §10.3. Renaming one is a data-compatibility break. */
export const BUILTIN_STYLE_IDS = [
  'builtin.report-light',
  'builtin.compact-light',
  'builtin.dark',
  'builtin.finance',
] as const;

export type BuiltinStyleId = (typeof BUILTIN_STYLE_IDS)[number];

export const DEFAULT_TABLE_STYLE_ID: BuiltinStyleId = 'builtin.report-light';

const REPORT_LIGHT_TOKENS: TableStyleTokens = deepFreeze({
  density: 'normal',
  fontFamily: 'system-ui',
  fontSize: 13,
  header: {
    background: '#374151',
    foreground: '#ffffff',
    bold: true,
    borderColor: '#d1d5db',
  },
  body: {
    background: '#ffffff',
    alternateBackground: '#f9fafb',
    foreground: '#111827',
    borderColor: '#d1d5db',
    grid: 'horizontal',
  },
  selection: { background: '#1d4ed8', foreground: '#ffffff' },
  radius: 4,
  cellPaddingX: 10,
  cellPaddingY: 7,
  zebra: false,
});

/** Defaults used by `createTableStyle` and by the report-light builtin. */
export const DEFAULT_TABLE_STYLE_TOKENS: TableStyleTokens = REPORT_LIGHT_TOKENS;

const COMPACT_LIGHT_TOKENS: TableStyleTokens = deepFreeze({
  density: 'compact',
  fontFamily: 'system-ui',
  fontSize: 12,
  header: {
    background: '#e2e8f0',
    foreground: '#0f172a',
    bold: true,
    borderColor: '#cbd5e1',
  },
  body: {
    background: '#ffffff',
    alternateBackground: '#f8fafc',
    foreground: '#0f172a',
    borderColor: '#e2e8f0',
    grid: 'horizontal',
  },
  selection: { background: '#1d4ed8', foreground: '#ffffff' },
  radius: 0,
  cellPaddingX: 6,
  cellPaddingY: 4,
  zebra: false,
});

const DARK_TOKENS: TableStyleTokens = deepFreeze({
  density: 'normal',
  fontFamily: 'system-ui',
  fontSize: 13,
  header: {
    background: '#252526',
    foreground: '#e5e5e5',
    bold: true,
    borderColor: '#3c3c3c',
  },
  body: {
    background: '#1e1e1e',
    alternateBackground: '#252526',
    foreground: '#d4d4d4',
    borderColor: '#3c3c3c',
    grid: 'horizontal',
  },
  selection: { background: '#2563eb', foreground: '#ffffff' },
  radius: 4,
  cellPaddingX: 10,
  cellPaddingY: 7,
  zebra: false,
});

const FINANCE_TOKENS: TableStyleTokens = deepFreeze({
  density: 'normal',
  fontFamily: "ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', Consolas, monospace",
  fontSize: 13,
  header: {
    background: '#1f2937',
    foreground: '#f9fafb',
    bold: true,
    borderColor: '#cbd5e1',
  },
  body: {
    background: '#ffffff',
    alternateBackground: '#eef2f7',
    foreground: '#111827',
    borderColor: '#cbd5e1',
    grid: 'horizontal',
  },
  selection: { background: '#1d4ed8', foreground: '#ffffff' },
  radius: 2,
  cellPaddingX: 10,
  cellPaddingY: 7,
  zebra: true,
});

const BUILTIN_TABLE_STYLES: readonly TableStyle[] = Object.freeze([
  deepFreeze<TableStyle>({
    id: 'builtin.report-light',
    name: '报告（浅）',
    builtin: true,
    tokens: REPORT_LIGHT_TOKENS,
    columnOverrides: {},
    conditionalRules: [],
  }),
  deepFreeze<TableStyle>({
    id: 'builtin.compact-light',
    name: '紧凑（浅）',
    builtin: true,
    tokens: COMPACT_LIGHT_TOKENS,
    columnOverrides: {},
    conditionalRules: [],
  }),
  deepFreeze<TableStyle>({
    id: 'builtin.dark',
    name: '深色',
    builtin: true,
    tokens: DARK_TOKENS,
    columnOverrides: {},
    conditionalRules: [],
  }),
  deepFreeze<TableStyle>({
    id: 'builtin.finance',
    name: '财务',
    builtin: true,
    tokens: FINANCE_TOKENS,
    columnOverrides: {},
    conditionalRules: [],
  }),
]);

const BUILTIN_STYLE_BY_ID = new Map(BUILTIN_TABLE_STYLES.map((style) => [style.id, style]));

export const DEFAULT_TABLE_STYLE: TableStyle =
  BUILTIN_STYLE_BY_ID.get(DEFAULT_TABLE_STYLE_ID) ?? failMissingDefault();

/** All built-in styles in display order. The returned array is frozen. */
export function listBuiltinStyles(): readonly TableStyle[] {
  return BUILTIN_TABLE_STYLES;
}

/** Returns one built-in style by its stable id. */
export function getBuiltinStyle(id: string): TableStyle | undefined {
  return BUILTIN_STYLE_BY_ID.get(id);
}

/** Narrows a style id to one of the four SPEC §10.3 constants. */
export function isBuiltinStyleId(value: string): value is BuiltinStyleId {
  return (BUILTIN_STYLE_IDS as readonly string[]).includes(value);
}

/** True when a view/default style id can resolve to a builtin or a persisted style. */
export function isResolvableStyleId(styleId: string, userStyleIds: ReadonlySet<string>): boolean {
  return (
    isBuiltinStyleId(styleId) || (!styleId.startsWith('builtin.') && userStyleIds.has(styleId))
  );
}

/** Shared warning text for the loader and `resolveStyle`. */
export function unresolvedStyleWarning(styleId: string): string {
  return `table style "${styleId}" cannot be resolved; falling back to "${DEFAULT_TABLE_STYLE_ID}"`;
}

export interface TableStyleResolution {
  style: TableStyle;
  fallback: boolean;
  warning?: string;
}

/**
 * Resolves a style id against the builtins and the workspace's persisted styles.
 * Unknown ids (including unknown `builtin.*` values) fall back to report-light.
 */
export function resolveStyle(
  styleId: string,
  userStyles: readonly TableStyle[] = [],
): TableStyleResolution {
  const builtin = getBuiltinStyle(styleId);
  if (builtin !== undefined) {
    return { style: builtin, fallback: false };
  }

  const userStyle = userStyles.find((style) => style.id === styleId && !style.builtin);
  if (userStyle !== undefined) {
    return { style: userStyle, fallback: false };
  }

  return {
    style: DEFAULT_TABLE_STYLE,
    fallback: true,
    warning: unresolvedStyleWarning(styleId),
  };
}

export interface CreateTableStyleOptions {
  name: string;
  id?: string;
  uuid?: UuidFactory;
  tokens?: TableStyleTokens;
  columnOverrides?: Readonly<Record<string, ColumnStyleOverride>>;
  conditionalRules?: readonly ConditionalRule[];
}

/** Creates a detached user style; builtins are created only by this module. */
export function createTableStyle(options: CreateTableStyleOptions): TableStyle {
  return {
    id: options.id ?? createStyleId(options.uuid),
    name: options.name,
    builtin: false,
    tokens: cloneTokens(options.tokens ?? DEFAULT_TABLE_STYLE_TOKENS),
    columnOverrides: cloneColumnOverrides(options.columnOverrides ?? {}),
    conditionalRules: cloneConditionalRules(options.conditionalRules ?? []),
  };
}

export interface ForkTableStyleOptions {
  name?: string;
  uuid?: UuidFactory;
}

/**
 * Copies a style into a new user style. The source (including a frozen builtin)
 * is never mutated; nested tokens, overrides and filter predicates are cloned.
 */
export function forkTableStyle(style: TableStyle, options: ForkTableStyleOptions = {}): TableStyle {
  return {
    id: createStyleId(options.uuid),
    name: options.name ?? forkStyleName(style.name),
    builtin: false,
    tokens: cloneTokens(style.tokens),
    columnOverrides: cloneColumnOverrides(style.columnOverrides),
    conditionalRules: cloneConditionalRules(style.conditionalRules),
  };
}

function failMissingDefault(): never {
  throw new Error(`The default table style "${DEFAULT_TABLE_STYLE_ID}" is not registered.`);
}

function forkStyleName(name: string): string {
  return `${name} (2)`;
}

function cloneTokens(tokens: TableStyleTokens): TableStyleTokens {
  return {
    ...tokens,
    header: { ...tokens.header },
    body: { ...tokens.body },
    selection: { ...tokens.selection },
  };
}

function cloneColumnOverrides(
  overrides: Readonly<Record<string, ColumnStyleOverride>>,
): Record<string, ColumnStyleOverride> {
  const cloned: Record<string, ColumnStyleOverride> = {};
  for (const [columnId, override] of Object.entries(overrides)) {
    const { numberFormat, ...rest } = override;
    cloned[columnId] =
      numberFormat === undefined ? { ...rest } : { ...rest, numberFormat: { ...numberFormat } };
  }
  return cloned;
}

function cloneConditionalRules(rules: readonly ConditionalRule[]): ConditionalRule[] {
  return rules.map((rule) => ({
    ...rule,
    target: { ...rule.target },
    when: cloneFilterPredicate(rule.when),
    style: { ...rule.style },
  }));
}

function cloneFilterPredicate(predicate: FilterPredicate): FilterPredicate {
  if (predicate.kind === 'compare') {
    return { ...predicate };
  }
  return { kind: predicate.kind, children: predicate.children.map(cloneFilterPredicate) };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
