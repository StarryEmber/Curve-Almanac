import type { Row } from '@curve/domain';

/**
 * Publishes a freshly built row array as immutable state (T2.7, ADR-033).
 *
 * Immer finalizes a modified draft by walking its copied children while other
 * drafts in the same produce are still unfinalized. For a 100k-row array that
 * walk costs ~250ms per commit even though only one row changed. A frozen array
 * is skipped by `finalizeProperty`, so replacing `rows` with a fresh frozen copy
 * keeps a single-cell commit at ~1ms.
 *
 * Only `table.cell.set` uses this today: paste/import/row-insert keep their
 * existing behavior because they already replace or splice a *copy* (Immer
 * copies a frozen base before mutating it), and their budgets are met. Commands
 * that replace the array must use this helper; commands must never mutate the
 * published array in place (ES modules are strict, so an accidental write to a
 * frozen array throws instead of silently corrupting undo).
 */
export function frozenRows(rows: Row[]): Row[] {
  Object.freeze(rows);
  return rows;
}
