import { Button, Select } from '@curve/ui';

import { useAppState, useRendererCore } from '../app-core/use-app-core';
import { describeAppError } from '../error-text';
import { describeCellIssue } from '../features/grid/cell-issue-text';
import { useSettings } from '../features/settings/SettingsProvider';
import { LOCALES, isLocale, useI18n } from '../i18n';

import type { RuntimeState } from './use-runtime-info';
import type { ReactElement } from 'react';

export interface StatusBarProps {
  runtime: RuntimeState;
}

export function StatusBar({ runtime }: StatusBarProps): ReactElement {
  const { t, locale, setLocale } = useI18n();
  const { settings } = useSettings();
  const { core } = useRendererCore();
  const workspace = useAppState((state) => state.workspace);
  const editIssue = useAppState((state) => state.ui.editIssue);
  const save = useAppState((state) => state.ui.save);
  const columnLabel = useAppState((state) => {
    const issue = state.ui.editIssue;
    if (issue?.columnId === undefined) {
      return undefined;
    }
    const tableId = state.ui.activeTableId;
    const table = tableId === null ? undefined : state.tables[tableId];
    return table?.table.columns.find((column) => column.id === issue.columnId)?.label;
  });

  const runtimeText =
    runtime.status === 'ready'
      ? `${t('shell.status.version', { version: runtime.info.version })} · ${t(
          'shell.status.platform',
          { platform: runtime.info.platform },
        )}`
      : runtime.status === 'loading'
        ? t('shell.status.loading')
        : t('shell.status.unavailable');

  const saveText =
    save.status === 'saving'
      ? t('shell.status.saving')
      : save.status === 'error'
        ? t('shell.status.saveError')
        : t('shell.status.saved');
  const autosaveText = settings.autosave
    ? saveText
    : save.status === 'error'
      ? t('shell.status.saveError')
      : save.unsaved
        ? t('shell.status.unsaved')
        : t('shell.status.autosaveOff');
  const editText =
    editIssue === null ? null : describeCellIssue(editIssue, t, columnLabel ?? editIssue.columnId);

  return (
    <footer
      className="cs-app__statusbar"
      aria-label={t('shell.status.label')}
      data-testid="statusbar"
    >
      <span className="cs-statusbar__item" data-testid="runtime-status">
        {runtimeText}
      </span>
      <span className="cs-statusbar__item" data-testid="workspace-status">
        {`${t('shell.status.workspace')}: ${
          workspace === null ? t('shell.status.workspaceNone') : workspace.name
        }`}
      </span>
      {editText === null ? null : (
        <span
          id="cs-edit-status"
          className="cs-statusbar__item cs-statusbar__edit-error"
          role="status"
          aria-live="polite"
          data-testid="edit-status"
        >
          {editText}
        </span>
      )}
      <span
        className="cs-statusbar__item cs-statusbar__save"
        data-testid="autosave-status"
        aria-live="polite"
        title={save.error === null ? undefined : describeAppError(save.error, t)}
      >
        {`${t('shell.status.autosave')}: ${
          workspace === null ? t('shell.status.autosaveIdle') : autosaveText
        }`}
        {workspace !== null && save.status === 'error' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void core.actions.retrySave();
            }}
          >
            {t('shell.status.retry')}
          </Button>
        ) : null}
      </span>
      <Select
        className="cs-statusbar__language"
        label={t('language.label')}
        options={LOCALES.map((option) => ({ value: option, label: t(`language.${option}`) }))}
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) {
            setLocale(event.target.value);
          }
        }}
        hideLabel
      />
    </footer>
  );
}
