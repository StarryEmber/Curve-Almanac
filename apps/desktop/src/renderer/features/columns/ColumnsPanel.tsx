import { useState } from 'react';

import type { ColumnChangeInspection, ColumnDraft } from '@curve/app-core';
import { MAX_COLUMNS_PER_TABLE } from '@curve/domain';
import type { ColumnDef } from '@curve/domain';
import { Button } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { isDestructiveColumnChange } from './column-form';
import { ColumnChangeDialog } from './ColumnChangeDialog';
import { ColumnFormDialog } from './ColumnFormDialog';

import type { ColumnChangeIntent } from './ColumnChangeDialog';
import type { ColumnFormSubmitResult } from './ColumnFormDialog';
import type { ReactElement } from 'react';

type DialogState =
  | { kind: 'none' }
  | { kind: 'form'; mode: 'add' | 'edit'; column?: ColumnDef }
  | {
      kind: 'confirm';
      intent: ColumnChangeIntent;
      columnId: string;
      columnName: string;
      inspection: ColumnChangeInspection;
      draft?: ColumnDraft;
    };

export interface ColumnsPanelProps {
  tableId: string;
}

/**
 * Inspector column manager (T2.3, Q7).
 *
 * Lists the active table's columns with up/down keyboard-reorder buttons; add,
 * edit, delete and primary-key actions open a dialog. Destructive changes are
 * confirmed with affected-row/reference counts (Q5), and the add button is
 * disabled at the 100-column limit (Q6).
 */
export function ColumnsPanel({ tableId }: ColumnsPanelProps): ReactElement | null {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const tableData = useAppState((state) => state.tables[tableId]);
  const activeViewId = useAppState((state) => state.ui.activeViewId);
  const activeView = useAppState((state) =>
    activeViewId === null ? undefined : state.views[activeViewId],
  );
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (tableData === undefined) {
    return null;
  }
  const table = tableData.table;
  const limited = table.columns.length >= MAX_COLUMNS_PER_TABLE;
  const tableView =
    activeView !== undefined && activeView.kind === 'table' ? activeView.tableView : undefined;
  const hiddenColumnIds = tableView?.hiddenColumnIds ?? [];
  const visibleCount = table.columns.length - hiddenColumnIds.length;

  const setHiddenColumns = async (next: readonly string[]): Promise<void> => {
    if (activeView === undefined || tableView === undefined) {
      return;
    }
    const outcome = await core.actions.updateView(activeView.id, {
      hiddenColumnIds: [...next],
    });
    if (!outcome.ok) {
      core.store.getState().actions.setError(outcome.error);
    }
  };

  const toggleColumnHidden = (column: ColumnDef): void => {
    if (tableView === undefined) {
      return;
    }
    if (hiddenColumnIds.includes(column.id)) {
      void setHiddenColumns(hiddenColumnIds.filter((id) => id !== column.id));
      return;
    }
    if (visibleCount <= 1) {
      return;
    }
    void setHiddenColumns([...hiddenColumnIds, column.id]);
  };

  const openAdd = (): void => {
    setDialog({ kind: 'form', mode: 'add' });
  };

  const openEdit = (column: ColumnDef): void => {
    setDialog({ kind: 'form', mode: 'edit', column });
  };

  const closeDialog = (): void => {
    setDialog({ kind: 'none' });
    setConfirmBusy(false);
    setConfirmError(null);
  };

  const moveColumn = async (column: ColumnDef, direction: -1 | 1): Promise<void> => {
    const order = table.columns.map((entry) => entry.id);
    const index = order.indexOf(column.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) {
      return;
    }
    const swapped = [...order];
    const first = swapped[index];
    const second = swapped[target];
    if (first === undefined || second === undefined) {
      return;
    }
    swapped[index] = second;
    swapped[target] = first;
    const outcome = await core.actions.reorderColumns(tableId, swapped);
    if (!outcome.ok) {
      core.store.getState().actions.setError(outcome.error);
    }
  };

  const openDelete = (column: ColumnDef): void => {
    setConfirmError(null);
    setDialog({
      kind: 'confirm',
      intent: 'delete',
      columnId: column.id,
      columnName: column.label,
      inspection: core.actions.inspectColumnChange({
        kind: 'delete',
        tableId,
        columnId: column.id,
      }),
    });
  };

  const openPrimaryKey = (column: ColumnDef): void => {
    setConfirmError(null);
    setDialog({
      kind: 'confirm',
      intent: 'primary-key',
      columnId: column.id,
      columnName: column.label,
      inspection: core.actions.inspectColumnChange({
        kind: 'primary-key',
        tableId,
        columnId: column.id,
      }),
    });
  };

  const submitForm = async (
    draft: ColumnDraft,
    normalized: ColumnDef,
  ): Promise<ColumnFormSubmitResult> => {
    if (dialog.kind !== 'form') {
      return { kind: 'done' };
    }
    if (dialog.mode === 'add') {
      const outcome = await core.actions.addColumn(tableId, draft);
      if (outcome.ok) {
        return { kind: 'done' };
      }
      if (outcome.committed === true) {
        return { kind: 'done' };
      }
      if (outcome.issues !== undefined) {
        return { kind: 'issues', issues: outcome.issues };
      }
      return { kind: 'error', message: describeAppError(outcome.error, t) };
    }

    const current = dialog.column;
    if (current === undefined) {
      return { kind: 'error', message: describeAppError({ code: 'E_UNKNOWN', message: '' }, t) };
    }
    if (!isDestructiveColumnChange(current, draft)) {
      const outcome = await core.actions.updateColumn(tableId, current.id, draft);
      if (outcome.ok) {
        return { kind: 'done' };
      }
      if (outcome.committed === true) {
        return { kind: 'done' };
      }
      if (outcome.issues !== undefined) {
        return { kind: 'issues', issues: outcome.issues };
      }
      if (outcome.failures !== undefined) {
        setDialog({
          kind: 'confirm',
          intent: 'update',
          columnId: current.id,
          columnName: current.label,
          inspection: {
            ok: false,
            error: outcome.error,
            failures: outcome.failures,
            totalFailures: outcome.totalFailures ?? outcome.failures.length,
          },
        });
        return { kind: 'confirm' };
      }
      return { kind: 'error', message: describeAppError(outcome.error, t) };
    }

    setConfirmError(null);
    setDialog({
      kind: 'confirm',
      intent: 'update',
      columnId: current.id,
      columnName: current.label,
      inspection: core.actions.inspectColumnChange({
        kind: 'update',
        tableId,
        column: normalized,
      }),
      draft,
    });
    return { kind: 'confirm' };
  };

  const confirmChange = async (): Promise<void> => {
    if (dialog.kind !== 'confirm') {
      return;
    }
    setConfirmBusy(true);
    setConfirmError(null);
    const outcome =
      dialog.intent === 'delete'
        ? await core.actions.deleteColumn(tableId, dialog.columnId)
        : dialog.intent === 'update' && dialog.draft !== undefined
          ? await core.actions.updateColumn(tableId, dialog.columnId, dialog.draft)
          : dialog.intent === 'primary-key'
            ? await core.actions.changePrimaryKey(tableId, dialog.columnId)
            : { ok: false as const, error: { code: 'E_UNKNOWN' as const, message: '' } };

    setConfirmBusy(false);
    if (outcome.ok) {
      setDialog({ kind: 'none' });
      return;
    }
    if (outcome.committed === true) {
      setDialog({ kind: 'none' });
      return;
    }
    if (outcome.failures !== undefined) {
      setDialog({
        ...dialog,
        inspection: {
          ok: false,
          error: outcome.error,
          failures: outcome.failures,
          totalFailures: outcome.totalFailures ?? outcome.failures.length,
        },
      });
      return;
    }
    setConfirmError(describeAppError(outcome.error, t));
  };

  const activeColumn = dialog.kind === 'form' ? dialog.column : undefined;

  return (
    <section className="cs-columns" data-testid="columns-panel" aria-label={t('columns.label')}>
      <div className="cs-columns__header">
        <h2 className="cs-columns__title">{t('columns.title')}</h2>
        <span className="cs-columns__count">
          {t('columns.count', { count: table.columns.length })}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={limited}
          title={limited ? t('columns.limitReached') : undefined}
          data-testid="column-add"
          onClick={openAdd}
        >
          {t('columns.add')}
        </Button>
      </div>
      {limited ? (
        <p className="cs-columns__hint" data-testid="column-limit">
          {t('columns.limitReached')}
        </p>
      ) : null}

      {table.columns.length === 0 ? (
        <p className="cs-columns__empty">{t('columns.empty')}</p>
      ) : (
        <ul className="cs-columns__list">
          {table.columns.map((column, index) => {
            const isPrimaryKey = column.id === table.primaryKey;
            const enumCount = column.enumOptions?.length ?? 0;
            return (
              <li
                key={column.id}
                className="cs-columns__item"
                data-testid={`column-row-${column.id}`}
              >
                <button
                  type="button"
                  className="cs-columns__open"
                  aria-label={t('columns.edit', { name: column.label })}
                  onClick={() => {
                    openEdit(column);
                  }}
                >
                  <span className="cs-columns__name">{column.label}</span>
                  <span className="cs-columns__key">{column.key}</span>
                  <span className="cs-columns__badges">
                    <span className="cs-columns__badge">{t(`columns.type.${column.type}`)}</span>
                    <span className="cs-columns__badge">{t(`columns.role.${column.role}`)}</span>
                    {isPrimaryKey ? (
                      <span className="cs-columns__badge cs-columns__badge--key">
                        {t('columns.primaryKeyBadge')}
                      </span>
                    ) : null}
                    {column.required === true ? (
                      <span className="cs-columns__badge">{t('columns.requiredBadge')}</span>
                    ) : null}
                    {enumCount > 0 ? (
                      <span className="cs-columns__badge">
                        {t('columns.enumBadge', { count: enumCount })}
                      </span>
                    ) : null}
                  </span>
                </button>
                <div className="cs-columns__actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    aria-label={
                      hiddenColumnIds.includes(column.id)
                        ? t('columns.show', { name: column.label })
                        : t('columns.hide', { name: column.label })
                    }
                    title={
                      hiddenColumnIds.includes(column.id)
                        ? t('columns.show', { name: column.label })
                        : visibleCount <= 1
                          ? t('columns.lastVisible')
                          : t('columns.hide', { name: column.label })
                    }
                    disabled={tableView === undefined}
                    onClick={() => {
                      toggleColumnHidden(column);
                    }}
                  >
                    <span aria-hidden="true">
                      {hiddenColumnIds.includes(column.id) ? '+' : '−'}
                    </span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    aria-label={t('columns.moveUp', { name: column.label })}
                    disabled={index === 0}
                    onClick={() => {
                      void moveColumn(column, -1);
                    }}
                  >
                    <span aria-hidden="true">{'↑'}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    aria-label={t('columns.moveDown', { name: column.label })}
                    disabled={index === table.columns.length - 1}
                    onClick={() => {
                      void moveColumn(column, 1);
                    }}
                  >
                    <span aria-hidden="true">{'↓'}</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenColumnIds.length > 0 ? (
        <section
          className="cs-columns__hidden"
          aria-label={t('columns.hiddenTitle')}
          data-testid="hidden-columns"
        >
          <h3 className="cs-columns__hidden-title">{t('columns.hiddenTitle')}</h3>
          <p className="cs-columns__hint">
            {t('columns.hiddenCount', { count: hiddenColumnIds.length })}
          </p>
          <ul className="cs-columns__hidden-list">
            {hiddenColumnIds.map((columnId) => {
              const column = table.columns.find((entry) => entry.id === columnId);
              if (column === undefined) {
                return null;
              }
              return (
                <li key={column.id} className="cs-columns__hidden-item">
                  <span>{column.label}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={t('columns.show', { name: column.label })}
                    onClick={() => {
                      toggleColumnHidden(column);
                    }}
                  >
                    {t('columns.show', { name: column.label })}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <ColumnFormDialog
        open={dialog.kind === 'form'}
        mode={dialog.kind === 'form' ? dialog.mode : 'add'}
        table={table}
        {...(activeColumn === undefined ? {} : { column: activeColumn })}
        onClose={closeDialog}
        onRequestDelete={openDelete}
        onRequestPrimaryKey={openPrimaryKey}
        onSubmit={submitForm}
      />

      <ColumnChangeDialog
        open={dialog.kind === 'confirm'}
        intent={dialog.kind === 'confirm' ? dialog.intent : 'delete'}
        columnName={dialog.kind === 'confirm' ? dialog.columnName : ''}
        inspection={dialog.kind === 'confirm' ? dialog.inspection : null}
        busy={confirmBusy}
        error={confirmError}
        onConfirm={() => {
          void confirmChange();
        }}
        onClose={closeDialog}
      />
    </section>
  );
}
