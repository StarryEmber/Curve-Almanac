import { useCallback, useEffect, useRef, useState } from 'react';

import { createPasteColumns, PASTE_PROGRESS_THRESHOLD } from '@curve/app-core';
import type {
  PasteColumnDraft,
  PasteIssue,
  PastePrepareOutcome,
  PasteProgress,
  PasteRequestBase,
} from '@curve/app-core';
import { MAX_COLUMNS_PER_TABLE, toAppError } from '@curve/domain';
import type { ColumnDef } from '@curve/domain';

import { useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { PasteColumnsDialog } from './PasteColumnsDialog';
import { PasteErrorDialog } from './PasteErrorDialog';
import { PasteProgressDialog } from './PasteProgressDialog';

import type { PasteTarget } from '../grid/grid-navigation';
import type { ReactElement } from 'react';

type PastePhase = 'idle' | 'preparing' | 'columns' | 'errors' | 'applying';

interface PasteBase extends PasteRequestBase {
  text: string;
}

const EMPTY_PROGRESS: PasteProgress = {
  processedRows: 0,
  totalRows: 0,
  done: 0,
  total: 0,
};

export interface UsePasteOptions {
  tableId: string;
  viewId: string;
  /** Focuses the grid cell at a 0-based visible row/column. */
  onLocate: (rowIndex: number, colIndex: number) => void;
}

export interface UsePasteResult {
  handlePaste: (
    text: string,
    target: Pick<PasteTarget, 'rowId' | 'columnId'>,
    columnIds: readonly string[],
  ) => void;
  dialogs: ReactElement;
}

/**
 * Paste orchestration for one table view (T2.4).
 *
 * The hook owns only UI phases and calls the app-core actions for parsing,
 * validation and the command. A paste that needs new columns opens the column
 * dialog; a type error opens the issue dialog; a matrix of 10,000+ cells shows
 * the cancellable progress dialog. No component below this hook writes cells.
 */
export function usePaste({ tableId, viewId, onLocate }: UsePasteOptions): UsePasteResult {
  const { core } = useRendererCore();
  const { t } = useI18n();
  const [phase, setPhase] = useState<PastePhase>('idle');
  const [drafts, setDrafts] = useState<PasteColumnDraft[]>([]);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly PasteIssue[]>([]);
  const [totalIssues, setTotalIssues] = useState(0);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogBody, setDialogBody] = useState('');
  const [progress, setProgress] = useState<PasteProgress>(EMPTY_PROGRESS);
  const [showProgress, setShowProgress] = useState(false);
  const baseRef = useRef<PasteBase | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    baseRef.current = null;
    setPhase('idle');
    setDrafts([]);
    setColumnsError(null);
    setIssues([]);
    setTotalIssues(0);
    setDialogTitle('');
    setDialogBody('');
    setProgress(EMPTY_PROGRESS);
    setShowProgress(false);
  }, []);

  useEffect(() => {
    reset();
  }, [tableId, viewId, reset]);

  const runPrepare = useCallback(
    async (current: PasteBase, newColumns?: readonly ColumnDef[]): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase('preparing');
      setShowProgress(false);
      setProgress(EMPTY_PROGRESS);
      setIssues([]);
      setTotalIssues(0);

      const tableData = core.store.getState().tables[tableId];
      const existingColumnCount = tableData?.table.columns.length ?? 0;

      let outcome: PastePrepareOutcome;
      try {
        outcome = await core.actions.preparePaste(
          {
            tableId: current.tableId,
            viewId: current.viewId,
            columnIds: current.columnIds,
            anchor: current.anchor,
            text: current.text,
            ...(newColumns === undefined ? {} : { newColumns }),
          },
          {
            signal: controller.signal,
            onProgress: (next) => {
              setProgress(next);
              if (next.total >= PASTE_PROGRESS_THRESHOLD) {
                setShowProgress(true);
              }
            },
          },
        );
      } catch (thrown) {
        if (abortRef.current !== controller) {
          return;
        }
        setShowProgress(false);
        setDialogTitle(t('paste.error.title'));
        setDialogBody(describeAppError(toAppError(thrown), t));
        setPhase('errors');
        return;
      }
      if (abortRef.current !== controller) {
        return;
      }

      if (outcome.ok) {
        setPhase('applying');
        setProgress((previous) => ({ ...previous, done: previous.total }));
        const applied = await core.actions.applyPaste({
          tableId: current.tableId,
          viewId: current.viewId,
          columnIds: current.columnIds,
          anchor: current.anchor,
          matrix: outcome.data.matrix.cells,
          ...(newColumns === undefined ? {} : { newColumns }),
        });
        if (abortRef.current !== controller) {
          return;
        }
        if (applied.ok) {
          reset();
          return;
        }
        setShowProgress(false);
        if (applied.committed === true) {
          setDialogTitle(t('paste.savedButNotPersisted.title'));
          setDialogBody(t('paste.savedButNotPersisted.body'));
          setIssues([]);
          setTotalIssues(0);
          setPhase('errors');
          return;
        }
        const appliedIssues = applied.issues ?? [];
        setIssues(appliedIssues);
        setTotalIssues(applied.totalIssues ?? 0);
        setDialogTitle(t('paste.error.title'));
        setDialogBody(
          appliedIssues.length > 0 ? t('paste.error.body') : describeAppError(applied.error, t),
        );
        setPhase('errors');
        return;
      }

      setShowProgress(false);
      if (outcome.kind === 'needs-columns') {
        setDrafts(
          Array.from({ length: outcome.newColumnsRequired }, (_, index) => ({
            label: t('paste.columns.defaultLabel', { index: existingColumnCount + index + 1 }),
            type: 'text' as const,
          })),
        );
        setColumnsError(null);
        setPhase('columns');
        return;
      }
      if (outcome.kind === 'blocked') {
        setDialogTitle(t('paste.filter.title'));
        setDialogBody(t('paste.filter.body'));
        setIssues([]);
        setTotalIssues(0);
        setPhase('errors');
        return;
      }
      if (outcome.kind === 'invalid') {
        setIssues(outcome.issues);
        setTotalIssues(outcome.totalIssues);
        setDialogTitle(t('paste.error.title'));
        setDialogBody(
          outcome.issues.length > 0 ? t('paste.error.body') : describeAppError(outcome.error, t),
        );
        setPhase('errors');
        return;
      }
      reset();
    },
    [core, reset, t, tableId],
  );

  const handlePaste = useCallback(
    (
      text: string,
      target: Pick<PasteTarget, 'rowId' | 'columnId'>,
      columnIds: readonly string[],
    ): void => {
      if (phase !== 'idle') {
        return;
      }
      const current: PasteBase = {
        tableId,
        viewId,
        columnIds: [...columnIds],
        anchor: { rowId: target.rowId, columnId: target.columnId },
        text,
      };
      baseRef.current = current;
      void runPrepare(current);
    },
    [phase, runPrepare, tableId, viewId],
  );

  const changeColumnDraft = useCallback((index: number, patch: Partial<PasteColumnDraft>): void => {
    setDrafts((current) =>
      current.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)),
    );
    setColumnsError(null);
  }, []);

  const confirmColumns = useCallback((): void => {
    const current = baseRef.current;
    const tableData = core.store.getState().tables[tableId];
    if (current === null || tableData === undefined) {
      return;
    }
    const created = createPasteColumns(tableData.table, drafts);
    if (!created.ok) {
      const reason = created.issues[0]?.reason;
      setColumnsError(
        reason === 'limit'
          ? t('paste.columns.error.limit')
          : reason === 'required'
            ? t('paste.columns.error.required')
            : t('paste.columns.error.invalid'),
      );
      return;
    }
    setColumnsError(null);
    void runPrepare(current, created.columns);
  }, [core, drafts, runPrepare, t, tableId]);

  const tableData = core.store.getState().tables[tableId];
  const columnLabels = new Map(
    (tableData?.table.columns ?? []).map((column) => [column.id, column.label]),
  );

  const anchorIndex = (() => {
    const current = baseRef.current;
    if (current === null || tableData === undefined) {
      return 0;
    }
    if (current.anchor.rowId === null) {
      return 0;
    }
    const index = tableData.rows.findIndex((row) => row.id === current.anchor.rowId);
    return index < 0 ? 0 : index;
  })();

  const locatable = ((): PasteIssue | undefined => {
    const current = baseRef.current;
    if (current === null || tableData === undefined) {
      return undefined;
    }
    return issues.find((issue) => {
      if (issue.matrixRow < 0 || issue.matrixColumn < 0 || issue.columnId === undefined) {
        return false;
      }
      const rowIndex = anchorIndex + issue.matrixRow;
      return (
        rowIndex >= 0 &&
        rowIndex < tableData.rows.length &&
        current.columnIds.includes(issue.columnId)
      );
    });
  })();

  const locate = (): void => {
    const current = baseRef.current;
    if (current === null || locatable === undefined || locatable.columnId === undefined) {
      return;
    }
    const rowIndex = anchorIndex + locatable.matrixRow;
    const colIndex = current.columnIds.indexOf(locatable.columnId);
    if (rowIndex < 0 || colIndex < 0) {
      return;
    }
    onLocate(rowIndex, colIndex);
    reset();
  };

  const columnsOpen = phase === 'columns';
  const errorsOpen = phase === 'errors';
  const progressOpen = showProgress && (phase === 'preparing' || phase === 'applying');

  return {
    handlePaste,
    dialogs: (
      <>
        <PasteColumnsDialog
          open={columnsOpen}
          count={drafts.length}
          drafts={drafts}
          existingColumnCount={tableData?.table.columns.length ?? 0}
          maxColumns={MAX_COLUMNS_PER_TABLE}
          busy={false}
          error={columnsError}
          onChange={changeColumnDraft}
          onConfirm={confirmColumns}
          onClose={reset}
        />
        <PasteErrorDialog
          open={errorsOpen}
          title={dialogTitle}
          body={dialogBody}
          issues={issues}
          totalIssues={totalIssues}
          columnLabels={columnLabels}
          canLocate={locatable !== undefined}
          locateHint={t('paste.error.locateUnavailable')}
          onLocate={locate}
          onClose={reset}
        />
        <PasteProgressDialog
          open={progressOpen}
          progress={progress}
          phase={phase === 'applying' ? 'saving' : 'validating'}
          onCancel={reset}
        />
      </>
    ),
  };
}
