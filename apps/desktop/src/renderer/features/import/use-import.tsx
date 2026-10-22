import { useCallback, useEffect, useRef, useState } from 'react';

import { autoMapImportColumns, createImportColumns } from '@curve/app-core';
import type { ImportColumnDraft } from '@curve/app-core';
import { toAppError } from '@curve/domain';
import type { Cell, ColumnDef } from '@curve/domain';
import { MAX_ROWS_PER_TABLE } from '@curve/table-engine';
import type { ImportColumnMapping, ImportDelimiter, ImportPlan } from '@curve/table-engine';

import { useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';
import { createImportWorkerClient } from '../../import/client';

import { buildImportErrorCsv, importErrorFileName } from './import-error-csv';
import { ImportWizardDialog } from './ImportWizardDialog';

import type { ImportPlanView } from './import-plan-view';
import type { ImportWorkerClient } from '../../import/client';
import type { ImportEncodingChoice } from '../../import/encoding';
import type { ImportPreview } from '../../import/worker-protocol';
import type { ReactElement } from 'react';

export const IMPORT_LARGE_ROW_THRESHOLD = 100_000;
export const IMPORT_MAX_ROWS = MAX_ROWS_PER_TABLE;

interface Session {
  tableId: string;
  token: string;
  name: string;
  sha256: string;
  size: number;
  format: 'csv' | 'json';
  preview: ImportPreview;
  encoding: ImportEncodingChoice;
  delimiter?: ImportDelimiter;
  hasHeader: boolean;
  drafts: ImportColumnDraft[];
  mappings: ImportColumnMapping[];
}

function planView(plan: ImportPlan): ImportPlanView {
  return plan.ok
    ? {
        ok: true,
        stats: plan.stats,
        issues: plan.issues,
        totalIssues: plan.totalIssues,
        finalRowCount: plan.finalRowCount,
      }
    : {
        ok: false,
        error: plan.error,
        stats: plan.stats,
        issues: plan.issues,
        totalIssues: plan.totalIssues,
      };
}

function hasDuplicateTargets(mappings: readonly ImportColumnMapping[]): boolean {
  const seen = new Set<string>();
  for (const mapping of mappings) {
    if (mapping.target.kind !== 'existing') {
      continue;
    }
    if (seen.has(mapping.target.columnId)) {
      return true;
    }
    seen.add(mapping.target.columnId);
  }
  return false;
}

export interface UseImportOptions {
  /** Called after the wizard has closed for any reason (success or cancel). */
  onClosed?: () => void;
}

export interface UseImportResult {
  start(tableId: string): void;
  dialogs: ReactElement;
}

export function useImport(options: UseImportOptions = {}): UseImportResult {
  const { core, api } = useRendererCore();
  const { t } = useI18n();
  const onClosed = options.onClosed;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [session, setSession] = useState<Session | null>(null);
  const [plan, setPlan] = useState<ImportPlanView | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [largeConfirmed, setLargeConfirmed] = useState(false);
  const clientRef = useRef<ImportWorkerClient | null>(null);
  const planRef = useRef<ImportPlan | null>(null);
  const tableIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);

  const reset = useCallback((): void => {
    generationRef.current += 1;
    clientRef.current?.terminate();
    clientRef.current = null;
    planRef.current = null;
    tableIdRef.current = null;
    setOpen(false);
    setStep(1);
    setSession(null);
    setPlan(null);
    setSkipInvalid(false);
    setMode('append');
    setBusy(false);
    setApplying(false);
    setBusyLabel(null);
    setError(null);
    setReplaceConfirmed(false);
    setLargeConfirmed(false);
    onClosed?.();
  }, [onClosed]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      clientRef.current?.terminate();
    },
    [],
  );

  const invalidatePlan = useCallback((): void => {
    planRef.current = null;
    setPlan(null);
  }, []);

  const tableData =
    tableIdRef.current === null ? undefined : core.store.getState().tables[tableIdRef.current];
  const existingColumns: readonly ColumnDef[] = tableData?.table.columns ?? [];

  const start = useCallback(
    (tableId: string): void => {
      if (busy || open) {
        return;
      }
      const data = core.store.getState().tables[tableId];
      if (data === undefined) {
        return;
      }
      tableIdRef.current = tableId;
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      setOpen(true);
      setStep(1);
      setBusy(true);
      setBusyLabel(t('import.busy.reading'));
      setError(null);
      void (async () => {
        try {
          const imported = await api.file.importText({
            filters: [
              { name: t('import.file.filterCsv'), extensions: ['csv', 'tsv'] },
              { name: t('import.file.filterJson'), extensions: ['json'] },
            ],
          });
          if (generation !== generationRef.current) {
            return;
          }
          if (!imported.ok) {
            setError(describeAppError(imported.error, t));
            setBusy(false);
            setBusyLabel(null);
            return;
          }
          if (imported.data === null) {
            reset();
            return;
          }
          const client = createImportWorkerClient();
          clientRef.current = client;
          const opened = await client.open(imported.data.bytes, imported.data.name);
          if (generation !== generationRef.current) {
            return;
          }
          if (!opened.ok) {
            setError(describeAppError(opened.error, t));
            setBusy(false);
            setBusyLabel(null);
            return;
          }
          const preview = opened.result;
          setSession({
            tableId,
            token: imported.data.token,
            name: imported.data.name,
            sha256: imported.data.sha256,
            size: imported.data.size,
            format: imported.data.format,
            preview,
            encoding: 'auto',
            ...(preview.delimiter === undefined ? {} : { delimiter: preview.delimiter }),
            hasHeader: preview.hasHeader,
            drafts: [],
            mappings: [],
          });
          setBusy(false);
          setBusyLabel(null);
        } catch (thrown) {
          if (generation !== generationRef.current) {
            return;
          }
          setError(describeAppError(toAppError(thrown), t));
          setBusy(false);
          setBusyLabel(null);
        }
      })();
    },
    [api, busy, core, open, reset, t],
  );

  const configure = useCallback(
    (patch: {
      encoding?: ImportEncodingChoice;
      delimiter?: ImportDelimiter;
      hasHeader?: boolean;
    }): void => {
      const current = session;
      const client = clientRef.current;
      if (current === null || client === null || busy) {
        return;
      }
      const generation = generationRef.current;
      setBusy(true);
      setBusyLabel(t('import.busy.parsing'));
      setError(null);
      void (async () => {
        const result = await client.configure({
          encoding: patch.encoding ?? current.encoding,
          ...(patch.delimiter === undefined && current.delimiter === undefined
            ? {}
            : { delimiter: patch.delimiter ?? current.delimiter }),
          hasHeader: patch.hasHeader ?? current.hasHeader,
        });
        if (generation !== generationRef.current) {
          return;
        }
        if (!result.ok) {
          setError(describeAppError(result.error, t));
          setBusy(false);
          setBusyLabel(null);
          return;
        }
        setSession((previous) =>
          previous === null
            ? previous
            : {
                ...previous,
                preview: result.result,
                encoding: patch.encoding ?? previous.encoding,
                ...(result.result.delimiter === undefined
                  ? { delimiter: undefined }
                  : { delimiter: result.result.delimiter }),
                hasHeader: result.result.hasHeader,
              },
        );
        invalidatePlan();
        setBusy(false);
        setBusyLabel(null);
      })();
    },
    [busy, invalidatePlan, session, t],
  );

  const initializeMapping = useCallback((): void => {
    const current = session;
    const data = tableData;
    if (current === null || data === undefined) {
      return;
    }
    const auto = autoMapImportColumns(data.table, current.preview.columns);
    const existingBySource = new Map(
      auto.mappings
        .filter(
          (
            mapping,
          ): mapping is ImportColumnMapping & {
            target: { kind: 'existing'; columnId: string };
          } => mapping.target.kind === 'existing',
        )
        .map((mapping) => [mapping.sourceIndex, mapping.target] as const),
    );
    const drafts: ImportColumnDraft[] = current.preview.columns.map((source) => ({
      label: source.name,
      type: source.type,
    }));
    const mappings: ImportColumnMapping[] = current.preview.columns.map((source) => {
      const existing = existingBySource.get(source.index);
      return existing === undefined
        ? { sourceIndex: source.index, target: { kind: 'new', newColumnIndex: source.index } }
        : { sourceIndex: source.index, target: existing };
    });
    setSession({ ...current, drafts, mappings });
    invalidatePlan();
  }, [invalidatePlan, session, tableData]);

  const updateMapping = useCallback(
    (sourceIndex: number, target: ImportColumnMapping['target']): void => {
      setSession((current) =>
        current === null
          ? current
          : {
              ...current,
              mappings: current.mappings.map((mapping) =>
                mapping.sourceIndex === sourceIndex ? { ...mapping, target } : mapping,
              ),
            },
      );
      invalidatePlan();
    },
    [invalidatePlan],
  );

  const updateDraft = useCallback(
    (index: number, patch: Partial<ImportColumnDraft>): void => {
      setSession((current) =>
        current === null
          ? current
          : {
              ...current,
              drafts: current.drafts.map((draft, position) =>
                position === index ? { ...draft, ...patch } : draft,
              ),
            },
      );
      invalidatePlan();
    },
    [invalidatePlan],
  );

  const buildPlanRequest = useCallback(
    (
      skip: boolean,
      planMode: 'append' | 'replace',
    ): { ok: true; request: Parameters<ImportWorkerClient['plan']>[0] } | { ok: false } => {
      const current = session;
      const data = tableData;
      if (current === null || data === undefined) {
        return { ok: false };
      }

      const usedNewIndices = [
        ...new Set(
          current.mappings
            .filter(
              (
                mapping,
              ): mapping is ImportColumnMapping & {
                target: { kind: 'new'; newColumnIndex: number };
              } => mapping.target.kind === 'new',
            )
            .map((mapping) => mapping.target.newColumnIndex),
        ),
      ].sort((left, right) => left - right);
      const usedDrafts = usedNewIndices
        .map((index) => current.drafts[index])
        .filter((draft): draft is ImportColumnDraft => draft !== undefined);
      const created = createImportColumns(data.table, usedDrafts);
      if (!created.ok) {
        setError(t('import.mapping.invalidNewColumns'));
        return { ok: false };
      }
      const mappings = current.mappings.map((mapping) =>
        mapping.target.kind === 'new'
          ? {
              sourceIndex: mapping.sourceIndex,
              target: {
                kind: 'new' as const,
                newColumnIndex: usedNewIndices.indexOf(mapping.target.newColumnIndex),
              },
            }
          : mapping,
      );
      const keyIndex = data.table.columns.findIndex(
        (column) => column.id === data.table.primaryKey,
      );
      const existingKeys: Cell[] =
        keyIndex < 0 ? [] : data.rows.map((row) => row.values[keyIndex] ?? null);
      return {
        ok: true,
        request: {
          table: data.table,
          mode: planMode,
          mappings,
          ...(created.columns.length === 0 ? {} : { newColumns: created.columns }),
          skipInvalid: skip,
          existingKeys,
          existingRowCount: data.rows.length,
        },
      };
    },
    [session, t, tableData],
  );

  const runPlan = useCallback(
    (skip: boolean, targetStep: 4 | 5 = 4, planMode: 'append' | 'replace' = mode): void => {
      const client = clientRef.current;
      const current = session;
      if (client === null || current === null) {
        return;
      }
      const built = buildPlanRequest(skip, planMode);
      if (!built.ok) {
        return;
      }
      const generation = generationRef.current;
      setBusy(true);
      setBusyLabel(t('import.busy.validating'));
      setError(null);
      setStep(targetStep);
      void (async () => {
        const planned = await client.plan(built.request);
        if (generation !== generationRef.current) {
          return;
        }
        if (!planned.ok) {
          setError(describeAppError(planned.error, t));
          setBusy(false);
          setBusyLabel(null);
          return;
        }
        planRef.current = planned.result;
        setPlan(planView(planned.result));
        setStep(planned.result.ok ? targetStep : 4);
        setBusy(false);
        setBusyLabel(null);
      })();
    },
    [buildPlanRequest, mode, session, t],
  );

  const validate = useCallback((): void => {
    runPlan(skipInvalid);
  }, [runPlan, skipInvalid]);

  const changeSkip = useCallback(
    (skip: boolean): void => {
      setSkipInvalid(skip);
      runPlan(skip);
    },
    [runPlan],
  );

  const changeMode = useCallback(
    (next: 'append' | 'replace'): void => {
      setMode(next);
      setReplaceConfirmed(false);
      runPlan(skipInvalid, 5, next);
    },
    [runPlan, skipInvalid],
  );

  const exportErrors = useCallback((): void => {
    const issues = plan?.issues ?? [];
    if (issues.length === 0) {
      return;
    }
    void (async () => {
      const exported = await api.file.exportText({
        suggestedName: importErrorFileName(),
        content: buildImportErrorCsv(issues),
        filters: [{ name: t('import.export.filter'), extensions: ['csv'] }],
      });
      if (!exported.ok) {
        setError(describeAppError(exported.error, t));
      }
    })();
  }, [api, plan, t]);

  const commit = useCallback((): void => {
    const current = session;
    const planned = planRef.current;
    if (current === null || planned === null || !planned.ok || busy) {
      return;
    }
    const generation = generationRef.current;
    setBusy(true);
    setApplying(true);
    setBusyLabel(t('import.busy.saving'));
    setError(null);
    void (async () => {
      const applied = await core.actions.applyImport({
        tableId: current.tableId,
        mode,
        rows: planned.rows,
        ...(planned.newColumns.length === 0 ? {} : { newColumns: planned.newColumns }),
        source: {
          token: current.token,
          name: current.name,
          sha256: current.sha256,
          size: current.size,
          encoding: current.preview.encoding,
          format: current.format,
        },
      });
      if (generation !== generationRef.current) {
        return;
      }
      if (!applied.ok) {
        setBusy(false);
        setApplying(false);
        setBusyLabel(null);
        if (applied.committed === true) {
          core.store.getState().actions.setError(applied.error);
          reset();
          return;
        }
        setError(describeAppError(applied.error, t));
        return;
      }
      const tableId = current.tableId;
      reset();
      void core.actions.openTable(tableId);
    })();
  }, [busy, core, mode, reset, session, t]);

  const goNext = useCallback((): void => {
    if (session === null) {
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      initializeMapping();
      setStep(3);
      return;
    }
    if (step === 4 && plan?.ok === true) {
      setStep(5);
    }
  }, [initializeMapping, plan, session, step]);

  const goBack = useCallback((): void => {
    if (step === 1) {
      return;
    }
    setStep((current) => (current === 1 ? 1 : ((current - 1) as 1 | 2 | 3 | 4 | 5)));
    setReplaceConfirmed(false);
    setLargeConfirmed(false);
  }, [step]);

  const requiredMissing = ((): string[] => {
    if (session === null || tableData === undefined) {
      return [];
    }
    const covered = new Set(
      session.mappings
        .filter(
          (
            mapping,
          ): mapping is ImportColumnMapping & {
            target: { kind: 'existing'; columnId: string };
          } => mapping.target.kind === 'existing',
        )
        .map((mapping) => mapping.target.columnId),
    );
    return tableData.table.columns
      .filter(
        (column) =>
          column.required === true &&
          column.id !== tableData.table.primaryKey &&
          !covered.has(column.id),
      )
      .map((column) => column.label);
  })();

  const duplicateTarget = session === null ? false : hasDuplicateTargets(session.mappings);
  const largeRows = plan?.ok === true && plan.finalRowCount > IMPORT_LARGE_ROW_THRESHOLD;

  return {
    start,
    dialogs: (
      <ImportWizardDialog
        open={open}
        tableName={tableData?.table.name ?? ''}
        fileName={session?.name ?? ''}
        fileSize={session?.size ?? 0}
        existingRowCount={tableData?.rows.length ?? 0}
        step={step}
        preview={session?.preview ?? null}
        existingColumns={existingColumns}
        encoding={session?.encoding ?? 'auto'}
        delimiter={session?.delimiter}
        hasHeader={session?.hasHeader ?? true}
        drafts={session?.drafts ?? []}
        mappings={session?.mappings ?? []}
        plan={plan}
        skipInvalid={skipInvalid}
        mode={mode}
        busy={busy}
        busyLabel={busyLabel}
        canCancelBusy={busy && !applying}
        error={error}
        requiredMissing={requiredMissing}
        duplicateTarget={duplicateTarget}
        largeRows={largeRows}
        replaceConfirmed={replaceConfirmed}
        largeConfirmed={largeConfirmed}
        onEncodingChange={(encoding) => configure({ encoding })}
        onDelimiterChange={(delimiter) => configure({ delimiter })}
        onHeaderChange={(hasHeader) => configure({ hasHeader })}
        onMappingChange={updateMapping}
        onDraftChange={updateDraft}
        onNext={goNext}
        onBack={goBack}
        onValidate={validate}
        onSkipChange={changeSkip}
        onExportErrors={exportErrors}
        onModeChange={changeMode}
        onReplaceConfirmChange={setReplaceConfirmed}
        onLargeConfirmChange={setLargeConfirmed}
        onCommit={commit}
        onClose={reset}
        onCancelBusy={reset}
      />
    ),
  };
}
