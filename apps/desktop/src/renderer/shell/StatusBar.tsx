import { Select } from '@curve/ui';

import { LOCALES, isLocale, useI18n } from '../i18n';

import type { RuntimeState } from './use-runtime-info';
import type { ReactElement } from 'react';

export interface StatusBarProps {
  runtime: RuntimeState;
}

export function StatusBar({ runtime }: StatusBarProps): ReactElement {
  const { t, locale, setLocale } = useI18n();

  const runtimeText =
    runtime.status === 'ready'
      ? `${t('shell.status.version', { version: runtime.info.version })} · ${t(
          'shell.status.platform',
          { platform: runtime.info.platform },
        )}`
      : runtime.status === 'loading'
        ? t('shell.status.loading')
        : t('shell.status.unavailable');

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
        {`${t('shell.status.workspace')}: ${t('shell.status.workspaceNone')}`}
      </span>
      <span className="cs-statusbar__item" data-testid="autosave-status">
        {`${t('shell.status.autosave')}: ${t('shell.status.autosaveIdle')}`}
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
