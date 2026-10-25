/**
 * Left navigator: chart list with new/copy/rename/delete (T4.4, SPEC §11.5).
 *
 * Clicking a chart activates its tab (creating one when it was closed). All
 * mutations go through `chart.*` commands, so they are manifest-only, persisted
 * and undoable through the same history as the inspector.
 */

import { useState } from 'react';

import type { AppError, ChartSpec } from '@curve/domain';
import { Button } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';

import { chartKindLabel } from './chart-text';
import { DeleteChartDialog, RenameChartDialog } from './ChartDialogs';
import { NewChartDialog } from './NewChartDialog';

import type { ReactElement } from 'react';

export function ChartList(): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const charts = useAppState((state) => state.charts);
  const views = useAppState((state) => state.views);
  const activeViewId = useAppState((state) => state.ui.activeViewId);
  const [newOpen, setNewOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChartSpec | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChartSpec | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reportError = (error: AppError): void => {
    core.store.getState().actions.setError(error);
  };

  const list = Object.values(charts);
  const activeChartId =
    activeViewId === null
      ? null
      : (() => {
          const view = views[activeViewId];
          return view?.kind === 'chart' ? view.refId : null;
        })();

  const openChart = (chartId: string): void => {
    void core.actions.openChart(chartId).then((outcome) => {
      if (!outcome.ok) {
        reportError(outcome.error);
      }
    });
  };

  const copyChart = (chartId: string): void => {
    void core.actions.duplicateChart(chartId).then((outcome) => {
      if (!outcome.ok) {
        reportError(outcome.error);
      }
    });
  };

  const closeDelete = (): void => {
    setDeleteTarget(null);
    setDeleteBusy(false);
    setDeleteError(null);
  };

  const confirmDelete = async (): Promise<void> => {
    if (deleteTarget === null) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    const outcome = await core.actions.deleteChart(deleteTarget.id);
    setDeleteBusy(false);
    if (outcome.ok || outcome.committed === true) {
      closeDelete();
      return;
    }
    setDeleteError(describeAppError(outcome.error, t));
  };

  return (
    <section className="cs-chart-list" data-testid="chart-list" aria-label={t('chart.list.title')}>
      <div className="cs-chart-list__header">
        <h2 className="cs-chart-list__title">{t('chart.list.title')}</h2>
        <Button
          size="sm"
          variant="primary"
          data-testid="chart-new"
          onClick={() => {
            setNewOpen(true);
          }}
        >
          {t('chart.list.new')}
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="cs-chart-list__empty" data-testid="chart-list-empty">
          {t('chart.list.empty')}
        </p>
      ) : (
        <ul className="cs-chart-list__items">
          {list.map((chart) => (
            <li
              key={chart.id}
              className="cs-chart-list__item"
              data-testid={`chart-row-${chart.id}`}
              data-active={chart.id === activeChartId ? 'true' : 'false'}
            >
              <button
                type="button"
                className="cs-chart-list__open"
                aria-label={t('chart.list.open', { title: chart.title })}
                onClick={() => {
                  openChart(chart.id);
                }}
              >
                <span className="cs-chart-list__name">{chart.title}</span>
                <span className="cs-chart-list__kind">{chartKindLabel(chart.kind, t)}</span>
              </button>
              <div className="cs-chart-list__actions">
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={t('chart.list.copy', { title: chart.title })}
                  title={t('chart.list.copy', { title: chart.title })}
                  data-testid={`chart-copy-${chart.id}`}
                  onClick={() => {
                    copyChart(chart.id);
                  }}
                >
                  <span aria-hidden="true">{'⧉'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={t('chart.list.rename', { title: chart.title })}
                  title={t('chart.list.rename', { title: chart.title })}
                  data-testid={`chart-rename-${chart.id}`}
                  onClick={() => {
                    setRenameTarget(chart);
                  }}
                >
                  <span aria-hidden="true">{'✎'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={t('chart.list.delete', { title: chart.title })}
                  title={t('chart.list.delete', { title: chart.title })}
                  data-testid={`chart-delete-${chart.id}`}
                  onClick={() => {
                    setDeleteTarget(chart);
                  }}
                >
                  <span aria-hidden="true">{'×'}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NewChartDialog
        open={newOpen}
        onClose={() => {
          setNewOpen(false);
        }}
      />

      <RenameChartDialog
        open={renameTarget !== null}
        chart={renameTarget}
        onClose={() => {
          setRenameTarget(null);
        }}
        onSave={(title) => {
          if (renameTarget === null) {
            return;
          }
          const target = renameTarget;
          setRenameTarget(null);
          if (title === target.title) {
            return;
          }
          void core.actions.updateChart({ ...target, title }).then((outcome) => {
            if (!outcome.ok) {
              reportError(outcome.error);
            }
          });
        }}
      />

      <DeleteChartDialog
        chart={deleteTarget}
        busy={deleteBusy}
        error={deleteError}
        onClose={closeDelete}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}
