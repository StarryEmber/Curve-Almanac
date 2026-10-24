/** Inspector style summary and entry point to the style editor (T3.4). */

import { useEffect, useMemo, useState } from 'react';

import { resolveStyle } from '@curve/domain';
import type { TableStyle } from '@curve/domain';
import { Button } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';

import { densityLabel, styleDisplayName } from './style-text';
import { StyleEditorDialog } from './StyleEditorDialog';

import type { ReactElement } from 'react';

export function StylePanel(): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const activeViewId = useAppState((state) => state.ui.activeViewId);
  const view = useAppState((state) =>
    activeViewId === null ? undefined : state.views[activeViewId],
  );
  const tableData = useAppState((state) => {
    const activeId = state.ui.activeViewId;
    const activeView = activeId === null ? undefined : state.views[activeId];
    return activeView?.kind === 'table' ? state.tables[activeView.refId] : undefined;
  });
  const tableStyles = useAppState((state) => state.tableStyles);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [view?.id]);

  const resolution = useMemo(() => {
    if (view?.kind !== 'table' || view.tableView === undefined) {
      return null;
    }
    return resolveStyle(view.tableView.styleId, Object.values(tableStyles));
  }, [tableStyles, view]);

  if (
    view === undefined ||
    view.kind !== 'table' ||
    view.tableView === undefined ||
    tableData === undefined ||
    resolution === null
  ) {
    return <p className="cs-style-hint">{t('style.panel.empty')}</p>;
  }

  const style: TableStyle = resolution.style;
  const builtin = style.builtin;

  return (
    <section
      className="cs-style-panel"
      data-testid="style-panel"
      aria-label={t('style.panel.title')}
    >
      <div className="cs-style-panel__header">
        <h2 className="cs-style-panel__title">{t('style.panel.title')}</h2>
        <span className="cs-style-panel__badge">
          {builtin ? t('style.panel.builtin') : t('style.panel.custom')}
        </span>
      </div>
      <p className="cs-style-panel__name" data-testid="style-current-name">
        {styleDisplayName(style, t)}
      </p>
      <dl className="cs-style-panel__facts">
        <div>
          <dt>{t('style.panel.density')}</dt>
          <dd>{densityLabel(style.tokens.density, t)}</dd>
        </div>
        <div>
          <dt>{t('style.panel.rules')}</dt>
          <dd>{t('style.panel.ruleCount', { count: style.conditionalRules.length })}</dd>
        </div>
        <div>
          <dt>{t('style.panel.columns')}</dt>
          <dd>
            {t('style.panel.columnCount', {
              count: Object.keys(style.columnOverrides).length,
            })}
          </dd>
        </div>
      </dl>
      {resolution.fallback ? (
        <p className="cs-style-error" role="alert">
          {t('style.panel.fallback')}
        </p>
      ) : null}
      <p className="cs-style-hint">{t('style.panel.hint')}</p>
      <Button
        variant="secondary"
        data-testid="style-edit-open"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('style.panel.edit')}
      </Button>

      <StyleEditorDialog
        open={open}
        table={tableData.table}
        view={view}
        tableStyle={style}
        rows={tableData.rows.slice(0, 50)}
        onClose={() => {
          setOpen(false);
        }}
        onCreateStyle={(next) => core.actions.createTableStyle(next, view.id)}
        onUpdateStyle={(next) => core.actions.updateTableStyle(next)}
      />
    </section>
  );
}
