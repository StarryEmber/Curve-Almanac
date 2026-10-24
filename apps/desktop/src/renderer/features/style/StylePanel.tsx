/**
 * Inspector style summary, editor entry point and template management (T3.4/T3.5).
 *
 * The panel owns the dialogs and wires their callbacks to command-bus actions and
 * the `file:*` IPC channels; the dialogs themselves stay presentational.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_TABLE_STYLE_ID,
  createStyleExportDocument,
  listBuiltinStyles,
  resolveStyle,
  serializeStyleExportDocument,
} from '@curve/domain';
import type { TableStyle } from '@curve/domain';
import { Button } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';

import { densityLabel, styleDisplayName } from './style-text';
import { decodeStyleFileBytes, fileNameFromPath, styleExportFileName } from './style-transfer';
import { StyleEditorDialog } from './StyleEditorDialog';
import { TemplateImportDialog } from './TemplateImportDialog';
import { TemplateManagerDialog } from './TemplateManagerDialog';

import type { PickStyleFileResult } from './TemplateImportDialog';
import type { TemplateActionResult, TemplateExportResult } from './TemplateManagerDialog';
import type { ReactElement } from 'react';

export function StylePanel(): ReactElement {
  const { t } = useI18n();
  const { core, api } = useRendererCore();
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
  const views = useAppState((state) => state.views);
  const defaultStyleId = useAppState(
    (state) => state.workspace?.settings.defaultTableStyleId ?? DEFAULT_TABLE_STYLE_ID,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    setEditorOpen(false);
    setManagerOpen(false);
    setImportOpen(false);
  }, [view?.id]);

  const userStyles = useMemo(() => Object.values(tableStyles), [tableStyles]);
  const existingNames = useMemo(() => {
    const names = new Set<string>();
    for (const builtin of listBuiltinStyles()) {
      names.add(builtin.name);
      names.add(styleDisplayName(builtin, t));
    }
    for (const style of userStyles) {
      names.add(style.name);
    }
    return [...names];
  }, [t, userStyles]);

  const resolution = useMemo(() => {
    if (view?.kind !== 'table' || view.tableView === undefined) {
      return null;
    }
    return resolveStyle(view.tableView.styleId, userStyles);
  }, [userStyles, view]);

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

  const pickStyleFile = async (): Promise<PickStyleFileResult> => {
    const picked = await api.file.importText({
      filters: [{ name: t('style.templates.importFilter'), extensions: ['json'] }],
    });
    if (!picked.ok) {
      return { ok: false, error: picked.error };
    }
    if (picked.data === null) {
      return { ok: true, file: null };
    }
    return {
      ok: true,
      file: {
        name: picked.data.name,
        text: decodeStyleFileBytes(picked.data.bytes),
      },
    };
  };

  const exportStyle = async (template: TableStyle): Promise<TemplateExportResult> => {
    const content = serializeStyleExportDocument(
      createStyleExportDocument(template, { now: new Date() }),
    );
    const reply = await api.file.exportText({
      suggestedName: styleExportFileName(template.name),
      content,
      filters: [{ name: t('style.templates.exportFilter'), extensions: ['json'] }],
    });
    if (!reply.ok) {
      return { ok: false, error: reply.error };
    }
    return {
      ok: true,
      fileName: reply.data === null ? null : fileNameFromPath(reply.data.path),
    };
  };

  const importStyle = async (
    template: TableStyle,
    applyToView: boolean,
  ): Promise<TemplateActionResult> => {
    const outcome = await core.actions.createTableStyle(
      template,
      applyToView ? view.id : undefined,
    );
    return outcome.ok
      ? { ok: true }
      : {
          ok: false,
          error: outcome.error,
          ...(outcome.committed === true ? { committed: true } : {}),
        };
  };

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
      <div className="cs-style-panel__actions">
        <Button
          variant="secondary"
          data-testid="style-edit-open"
          onClick={() => {
            setEditorOpen(true);
          }}
        >
          {t('style.panel.edit')}
        </Button>
        <Button
          variant="ghost"
          data-testid="style-templates-open"
          onClick={() => {
            setManagerOpen(true);
          }}
        >
          {t('style.templates.manage')}
        </Button>
      </div>

      <StyleEditorDialog
        open={editorOpen}
        table={tableData.table}
        view={view}
        tableStyle={style}
        rows={tableData.rows.slice(0, 50)}
        existingNames={existingNames}
        onClose={() => {
          setEditorOpen(false);
        }}
        onCreateStyle={(next) => core.actions.createTableStyle(next, view.id)}
        onUpdateStyle={(next) => core.actions.updateTableStyle(next)}
      />

      <TemplateManagerDialog
        open={managerOpen}
        currentStyleId={style.id}
        defaultStyleId={defaultStyleId}
        styles={userStyles}
        views={views}
        onClose={() => {
          setManagerOpen(false);
        }}
        onImport={() => {
          setManagerOpen(false);
          setImportOpen(true);
        }}
        onApply={async (styleId, target) => {
          const outcome = await core.actions.applyTableStyle(
            styleId,
            target === 'view' ? { kind: 'view', viewId: view.id } : { kind: 'default' },
          );
          return outcome.ok
            ? { ok: true }
            : {
                ok: false,
                error: outcome.error,
                ...(outcome.committed === true ? { committed: true } : {}),
              };
        }}
        onDuplicate={async (styleId) => {
          const outcome = await core.actions.duplicateTableStyle(styleId);
          return outcome.ok
            ? { ok: true, styleId: outcome.data.styleId, name: outcome.data.name }
            : {
                ok: false,
                error: outcome.error,
                ...(outcome.committed === true ? { committed: true } : {}),
              };
        }}
        onUpdate={(next) => core.actions.updateTableStyle(next)}
        onDelete={async (styleId) => {
          const outcome = await core.actions.deleteTableStyle(styleId);
          return outcome.ok
            ? {
                ok: true,
                fallbackStyleId: outcome.data.fallbackStyleId,
                affectedViewIds: outcome.data.affectedViewIds,
              }
            : {
                ok: false,
                error: outcome.error,
                ...(outcome.committed === true ? { committed: true } : {}),
              };
        }}
        onExport={exportStyle}
      />

      <TemplateImportDialog
        open={importOpen}
        table={tableData.table}
        view={view}
        rows={tableData.rows.slice(0, 50)}
        existingNames={existingNames}
        onClose={() => {
          setImportOpen(false);
        }}
        onPickFile={pickStyleFile}
        onImport={importStyle}
      />
    </section>
  );
}
