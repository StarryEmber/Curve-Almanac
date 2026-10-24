/**
 * Renderer controller for `file:exportCsv` (T3.6, ADR-039).
 *
 * The dialog owns the options; this hook turns them into CSV chunks, streams
 * them through the typed IPC client, reports progress and cancels cleanly.
 * Formatting is the real `formatStyledCellValue` path, never a second copy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { createAppError, toAppError } from '@curve/domain';
import type { Cell, ColumnDef, Row, TableMeta, TableStyle, AppError, ViewDef } from '@curve/domain';
import { csvExportFileName, encodeCsvChunks, rawCsvCellText } from '@curve/table-engine';
import type { CsvValueMode } from '@curve/table-engine';
import { formatStyledCellValue } from '@curve/ui';

import { useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';

import { buildCsvExportColumns, selectCsvExportRows } from './export-csv-plan';

import type { CsvExportScope } from './export-csv-plan';

export type CsvExportPhase =
  'idle' | 'starting' | 'running' | 'cancelling' | 'cancelled' | 'done' | 'error';

export interface CsvExportRequest {
  mode: CsvValueMode;
  scope: CsvExportScope;
}

export interface CsvExportResult {
  path: string;
  rows: number;
  bytes: number;
}

export interface CsvExportController {
  phase: CsvExportPhase;
  sentRows: number;
  totalRows: number;
  result: CsvExportResult | null;
  error: AppError | null;
  start(request: CsvExportRequest): Promise<void>;
  cancel(): void;
  reset(): void;
}

export interface UseCsvExportInput {
  tableMeta: TableMeta;
  tableStyle: TableStyle;
  view: ViewDef;
  visibleColumns: readonly ColumnDef[];
  /** Rows currently shown by the grid (filtered and sorted). */
  rows: readonly Row[];
  /** Physical rows, used by the "all rows" scope. */
  allRows: readonly Row[];
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function useCsvExport(input: UseCsvExportInput): CsvExportController {
  const { api } = useRendererCore();
  const { locale, t } = useI18n();
  const [phase, setPhaseState] = useState<CsvExportPhase>('idle');
  const [sentRows, setSentRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [result, setResult] = useState<CsvExportResult | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const phaseRef = useRef<CsvExportPhase>('idle');
  const runIdRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);

  const setPhase = useCallback((next: CsvExportPhase): void => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const cancelToken = useCallback(
    async (token: string): Promise<void> => {
      try {
        await api.file.exportCsv({ op: 'cancel', token });
      } catch {
        // Best effort: the main process also cleans up on quit.
      }
    },
    [api],
  );

  const reset = useCallback((): void => {
    runIdRef.current += 1;
    cancelRequestedRef.current = false;
    const token = tokenRef.current;
    tokenRef.current = null;
    if (token !== null) {
      void cancelToken(token);
    }
    setSentRows(0);
    setTotalRows(0);
    setResult(null);
    setError(null);
    setPhase('idle');
  }, [cancelToken, setPhase]);

  const cancel = useCallback((): void => {
    if (phaseRef.current !== 'starting' && phaseRef.current !== 'running') {
      return;
    }
    cancelRequestedRef.current = true;
    setPhase('cancelling');
  }, [setPhase]);

  const start = useCallback(
    async (request: CsvExportRequest): Promise<void> => {
      if (
        phaseRef.current === 'starting' ||
        phaseRef.current === 'running' ||
        phaseRef.current === 'cancelling'
      ) {
        return;
      }

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      cancelRequestedRef.current = false;
      setResult(null);
      setError(null);
      setSentRows(0);
      setTotalRows(0);
      setPhase('starting');

      // Let the dialog paint "preparing" before a 100k sort/format can block.
      await nextTask();
      if (runId !== runIdRef.current) {
        return;
      }

      const tokenHolder = { token: null as string | null };
      try {
        const sort = input.view.tableView?.sort ?? [];
        const selectedRows = selectCsvExportRows(
          request.scope,
          input.rows,
          input.allRows,
          input.tableMeta,
          sort,
          locale,
        );
        setTotalRows(selectedRows.length);

        const columns = buildCsvExportColumns(
          input.tableMeta,
          input.visibleColumns,
          request.mode,
          input.tableStyle,
        );
        const formatCell =
          request.mode === 'display'
            ? (value: Cell, column: ColumnDef): string =>
                formatStyledCellValue(value, column, input.tableStyle, {
                  locale,
                  trueLabel: t('grid.editor.true'),
                  falseLabel: t('grid.editor.false'),
                })
            : rawCsvCellText;

        const begin = await api.file.exportCsv({
          op: 'begin',
          suggestedName: csvExportFileName(input.tableMeta.name, new Date()),
          filters: [{ name: t('grid.export.filterName'), extensions: ['csv'] }],
        });

        if (runId !== runIdRef.current) {
          if (begin.ok && begin.data !== null && begin.data.op === 'begin') {
            await cancelToken(begin.data.token);
          }
          return;
        }
        if (!begin.ok) {
          setError(begin.error);
          setPhase('error');
          return;
        }
        if (begin.data === null) {
          setPhase('idle');
          return;
        }
        if (begin.data.op !== 'begin') {
          setError(createAppError('E_EXPORT_FAILED', 'The export session could not be started.'));
          setPhase('error');
          return;
        }

        const token = begin.data.token;
        tokenHolder.token = token;
        tokenRef.current = token;

        if (cancelRequestedRef.current) {
          tokenRef.current = null;
          await cancelToken(token);
          if (runId !== runIdRef.current) {
            return;
          }
          setPhase('cancelled');
          return;
        }

        setPhase('running');
        let sent = 0;
        for (const chunk of encodeCsvChunks({
          columns,
          rows: selectedRows,
          formatCell,
        })) {
          if (runId !== runIdRef.current) {
            return;
          }
          if (cancelRequestedRef.current) {
            tokenRef.current = null;
            await cancelToken(token);
            if (runId !== runIdRef.current) {
              return;
            }
            setPhase('cancelled');
            return;
          }

          const appended = await api.file.exportCsv({
            op: 'append',
            token,
            chunk: chunk.text,
          });
          if (runId !== runIdRef.current) {
            return;
          }
          if (!appended.ok) {
            tokenRef.current = null;
            await cancelToken(token);
            if (runId !== runIdRef.current) {
              return;
            }
            setError(appended.error);
            setPhase('error');
            return;
          }
          sent += chunk.rows;
          setSentRows(sent);
          await nextTask();
        }

        if (cancelRequestedRef.current) {
          tokenRef.current = null;
          await cancelToken(token);
          if (runId !== runIdRef.current) {
            return;
          }
          setPhase('cancelled');
          return;
        }

        const finished = await api.file.exportCsv({
          op: 'finish',
          token,
          rows: selectedRows.length,
        });
        if (runId !== runIdRef.current) {
          return;
        }
        tokenRef.current = null;
        if (!finished.ok) {
          setError(finished.error);
          setPhase('error');
          return;
        }
        if (finished.data === null || finished.data.op !== 'finish') {
          setError(createAppError('E_EXPORT_FAILED', 'The export file did not finish writing.'));
          setPhase('error');
          return;
        }
        setResult({
          path: finished.data.path,
          rows: finished.data.rows,
          bytes: finished.data.bytes,
        });
        setPhase('done');
      } catch (thrown) {
        if (runId !== runIdRef.current) {
          return;
        }
        tokenRef.current = null;
        if (tokenHolder.token !== null) {
          await cancelToken(tokenHolder.token);
        }
        setError(toAppError(thrown));
        setPhase('error');
      }
    },
    [api, cancelToken, input, locale, setPhase, t],
  );

  useEffect(
    () => () => {
      runIdRef.current += 1;
      const token = tokenRef.current;
      tokenRef.current = null;
      if (token !== null) {
        void cancelToken(token);
      }
    },
    [cancelToken],
  );

  return {
    phase,
    sentRows,
    totalRows,
    result,
    error,
    start,
    cancel,
    reset,
  };
}
