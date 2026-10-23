/**
 * Hard limits from SPEC §2.2. They are enforced by the domain when loading or
 * mutating a workspace, and reused by the UI to disable offending actions.
 */

/** Columns per table. */
export const MAX_COLUMNS_PER_TABLE = 100;

/** Tables per workspace. */
export const MAX_TABLES_PER_WORKSPACE = 20;

/** Charts per workspace. */
export const MAX_CHARTS_PER_WORKSPACE = 50;

/** Series rendered per chart; extras are dropped with a warning. */
export const MAX_SERIES_PER_CHART = 20;

/** Characters in a single text cell. */
export const MAX_CELL_TEXT_LENGTH = 100_000;

/** Enum options per enum column. */
export const MAX_ENUM_OPTIONS = 100;

/** Children of an `all`/`any` filter node. */
export const MAX_FILTER_CHILDREN = 20;

/** Sort levels applied to a table view (SPEC §9.5). */
export const MAX_SORT_LEVELS = 3;

/** Conditional formatting rules per style. */
export const MAX_CONDITIONAL_RULES = 50;

/** Panes in a workspace layout. */
export const MAX_PANES = 4;

/** Columns that can be frozen. */
export const MAX_FROZEN_COLUMNS = 3;

/** Rows kept in a domain validation report before it is truncated. */
export const MAX_REPORTED_ISSUES = 100;
