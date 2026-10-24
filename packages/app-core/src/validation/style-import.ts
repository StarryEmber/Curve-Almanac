/**
 * Template import validation (SPEC §10.5; T3.5).
 *
 * Imported `.curvestyle.json` files are untrusted input. Parsing and identity
 * reassignment happen here (pure, no IO) so the renderer only displays the
 * result and the manifest is never touched before validation succeeds.
 */

import { parseStyleExportDocument, reassignStyleIdentity, resolveStyleName } from '@curve/domain';
import type {
  FilterPredicate,
  StyleExportFailureReason,
  TableMeta,
  TableStyle,
  UuidFactory,
} from '@curve/domain';

export interface PrepareStyleImportOptions {
  /** Persisted style names (including builtin canonical names) already in use. */
  existingNames: readonly string[];
  uuid?: UuidFactory;
}

export type PrepareStyleImportResult =
  | {
      readonly ok: true;
      readonly style: TableStyle;
      /** Final, unique style name assigned to the copy. */
      readonly name: string;
      readonly sourceName: string;
      /** True when the source name was already taken and a ` (2)` suffix was added. */
      readonly renamed: boolean;
    }
  | { readonly ok: false; readonly reason: StyleExportFailureReason; readonly detail?: string };

/**
 * Validates an exported style document and prepares a persisted copy: new
 * `sty_` id, `builtin: false`, fresh `rule_` ids and a unique name.
 */
export function prepareStyleImport(
  text: string,
  options: PrepareStyleImportOptions,
): PrepareStyleImportResult {
  const parsed = parseStyleExportDocument(text);
  if (!parsed.ok) {
    return parsed;
  }

  const sourceName = parsed.document.style.name;
  const name = resolveStyleName(sourceName, options.existingNames);
  const style = reassignStyleIdentity(parsed.document.style, {
    name,
    ...(options.uuid === undefined ? {} : { uuid: options.uuid }),
  });
  return { ok: true, style, name, sourceName, renamed: name !== sourceName };
}

function collectPredicateColumns(predicate: FilterPredicate, ids: Set<string>): void {
  if (predicate.kind === 'compare') {
    ids.add(predicate.columnId);
    return;
  }
  for (const child of predicate.children) {
    collectPredicateColumns(child, ids);
  }
}

/** Every column id referenced by overrides or conditional rules, sorted. */
export function collectStyleColumnIds(style: TableStyle): string[] {
  const ids = new Set<string>(Object.keys(style.columnOverrides));
  for (const rule of style.conditionalRules) {
    if (rule.target.kind === 'cell') {
      ids.add(rule.target.columnId);
    }
    collectPredicateColumns(rule.when, ids);
  }
  return [...ids].sort();
}

/**
 * Column references that the target table does not have. They are kept in the
 * style (SPEC §6.6.7/§10.5) and only reported to the user; evaluation ignores
 * missing columns (ADR-036).
 */
export function missingStyleColumns(style: TableStyle, table: TableMeta): string[] {
  const available = new Set(table.columns.map((column) => column.id));
  return collectStyleColumnIds(style).filter((columnId) => !available.has(columnId));
}
