/**
 * Resolves the rows a table view should render (T2.6).
 *
 * No filter/sort means the table's physical rows are returned by reference, so
 * the 100k first-frame path is unchanged. Once a query exists, up to
 * `QUERY_WORKER_ROW_THRESHOLD` rows are filtered on the main thread and larger
 * tables use the dedicated query Worker; a Worker failure falls back to the same
 * pure function and is surfaced to the grid toolbar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { toAppError } from '@curve/domain';
import type { AppError, FilterPredicate, Row, SortSpec, TableViewState } from '@curve/domain';
import { queryRowIds, QUERY_WORKER_ROW_THRESHOLD } from '@curve/table-engine';
import type { TableData } from '@curve/table-engine';

import { useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';

export type ViewQueryMode = 'plain' | 'pending' | 'sync' | 'worker' | 'fallback';

export interface ViewRowsState {
  rows: readonly Row[];
  totalRows: number;
  visibleRows: number;
  mode: ViewQueryMode;
  busy: boolean;
  /** Filter/sort time reported by the Worker or measured on the main thread. */
  queryMs: number | null;
  /**
   * T2.7/ADR-033: end-to-end query wall time including the first Worker snapshot
   * sync (which `data-query-ms` deliberately excludes). Trend only, no budget.
   */
  totalMs: number | null;
  /** Set when even the main-thread fallback failed (invalid persisted filter). */
  error: AppError | null;
  /** Worker failure that triggered a successful main-thread fallback. */
  warning: AppError | null;
}

const EMPTY_SORT: readonly SortSpec[] = Object.freeze([]);

interface QueryKey {
  tableId: string;
  filter: FilterPredicate | undefined;
  sort: readonly SortSpec[];
  locale: string;
}

interface QueryState {
  key: QueryKey;
  rowIds: string[];
  mode: Exclude<ViewQueryMode, 'plain' | 'pending'>;
  queryMs: number | null;
  totalMs: number | null;
  error: AppError | null;
  warning: AppError | null;
}

function sameKey(left: QueryKey, right: QueryKey): boolean {
  return (
    left.tableId === right.tableId &&
    left.locale === right.locale &&
    left.filter === right.filter &&
    left.sort === right.sort
  );
}

export function useViewRows(
  tableData: TableData,
  tableView: TableViewState | undefined,
): ViewRowsState {
  const { query } = useRendererCore();
  const { locale } = useI18n();
  const filter = tableView?.filter;
  const sort = tableView?.sort ?? EMPTY_SORT;
  const active = filter !== undefined || sort.length > 0;

  const key = useMemo<QueryKey | null>(
    () => (active ? { tableId: tableData.table.id, filter, sort, locale } : null),
    [active, filter, locale, sort, tableData.table.id],
  );

  const [state, setState] = useState<QueryState | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    if (key === null) {
      setLoading(false);
      return undefined;
    }
    const runGeneration = generation.current + 1;
    generation.current = runGeneration;
    let cancelled = false;
    setLoading(true);
    const startedAt = performance.now();

    const current = (): boolean => !cancelled && generation.current === runGeneration;

    const runSync = (workerWarning: AppError | null): void => {
      try {
        const started = performance.now();
        const result = queryRowIds(
          tableData.rows,
          tableData.table,
          { ...(key.filter === undefined ? {} : { filter: key.filter }), sort: key.sort },
          { locale: key.locale },
        );
        if (!current()) {
          return;
        }
        setState({
          key,
          rowIds: result.rowIds,
          mode: workerWarning === null ? 'sync' : 'fallback',
          queryMs: performance.now() - started,
          totalMs: performance.now() - startedAt,
          error: null,
          warning: workerWarning,
        });
      } catch (thrown) {
        if (!current()) {
          return;
        }
        setState({
          key,
          rowIds: [],
          mode: 'sync',
          queryMs: null,
          totalMs: null,
          error: toAppError(thrown),
          warning: workerWarning,
        });
      } finally {
        if (current()) {
          setLoading(false);
        }
      }
    };

    const run = async (): Promise<void> => {
      if (tableData.rows.length <= QUERY_WORKER_ROW_THRESHOLD) {
        runSync(null);
        return;
      }
      const synced = await query.syncTable(tableData.table, tableData.rows);
      if (!current()) {
        return;
      }
      if (!synced.ok) {
        runSync(synced.error);
        return;
      }
      const queried = await query.query({
        tableId: tableData.table.id,
        ...(key.filter === undefined ? {} : { filter: key.filter }),
        sort: [...key.sort],
        locale: key.locale,
      });
      if (!current()) {
        return;
      }
      if (!queried.ok) {
        runSync(queried.error);
        return;
      }
      setState({
        key,
        rowIds: queried.result.rowIds,
        mode: 'worker',
        queryMs: queried.result.durationMs,
        totalMs: performance.now() - startedAt,
        error: null,
        warning: null,
      });
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [key, query, tableData.rows, tableData.table]);

  const rowById = useMemo(() => {
    const map = new Map<string, Row>();
    if (key === null) {
      // Unfiltered views render `tableData.rows` directly; building a 100k map
      // on every cell edit would add ~15ms to the commit path for nothing.
      return map;
    }
    for (const row of tableData.rows) {
      map.set(row.id, row);
    }
    return map;
  }, [key, tableData.rows]);

  const current = key !== null && state !== null && sameKey(state.key, key) ? state : null;

  const rows = useMemo<readonly Row[]>(() => {
    if (key === null) {
      return tableData.rows;
    }
    if (current === null) {
      return [];
    }
    const resolved: Row[] = [];
    for (const rowId of current.rowIds) {
      const row = rowById.get(rowId);
      if (row !== undefined) {
        resolved.push(row);
      }
    }
    return resolved;
  }, [current, key, rowById, tableData.rows]);

  if (key === null) {
    return {
      rows: tableData.rows,
      totalRows: tableData.rows.length,
      visibleRows: tableData.rows.length,
      mode: 'plain',
      busy: false,
      queryMs: null,
      totalMs: null,
      error: null,
      warning: null,
    };
  }

  return {
    rows,
    totalRows: tableData.rows.length,
    visibleRows: rows.length,
    mode: current?.mode ?? 'pending',
    busy: current === null || loading,
    queryMs: current?.queryMs ?? null,
    totalMs: current?.totalMs ?? null,
    error: current?.error ?? null,
    warning: current?.warning ?? null,
  };
}
