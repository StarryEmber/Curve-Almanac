/**
 * Settings dialog (T5.5, SPEC §16.3–§16.4, ADR-050).
 *
 * Theme, language and autosave are application settings (`settings.json`).
 * The default table style is workspace data (SPEC §6.5): with a workspace open
 * the choice goes through the existing `style.apply { target: 'default' }`
 * action, so it is undoable and written to the manifest. Without a workspace it
 * sets the builtin style used to seed the next workspace.
 *
 * Every control applies immediately: switching the language must not require a
 * restart, and the dialog itself re-renders in the new language.
 */

import { useState } from 'react';

import { isBuiltinStyleId, listBuiltinStyles } from '@curve/domain';
import { Dialog, Select, Button } from '@curve/ui';
import type { SelectOption } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';
import { styleDisplayName } from '../style/style-text';

import { useSettings } from './SettingsProvider';

import type { AppError } from '../../../shared/contracts/ipc';
import type { ReactElement } from 'react';

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps): ReactElement {
  const { t, locale } = useI18n();
  const { settings, error, update } = useSettings();
  const { core } = useRendererCore();
  const workspace = useAppState((state) => state.workspace);
  const userStyles = useAppState((state) => state.tableStyles);
  const [styleError, setStyleError] = useState<AppError | null>(null);

  const currentStyleId = workspace?.settings.defaultTableStyleId ?? settings.defaultTableStyleId;
  const styleOptions: SelectOption[] = [
    ...listBuiltinStyles().map((style) => ({
      value: style.id,
      label: styleDisplayName(style, t),
    })),
    ...Object.values(userStyles)
      .filter((style) => !style.builtin)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((style) => ({ value: style.id, label: styleDisplayName(style, t) })),
  ];
  if (!styleOptions.some((option) => option.value === currentStyleId)) {
    styleOptions.push({ value: currentStyleId, label: currentStyleId });
  }

  const persistenceError = error === null ? null : describeAppError(error, t);
  const styleFailure = styleError === null ? null : describeAppError(styleError, t);

  const chooseStyle = (styleId: string): void => {
    if (workspace === null) {
      void update({ defaultTableStyleId: styleId });
      return;
    }
    void (async () => {
      const outcome = await core.actions.applyTableStyle(styleId, { kind: 'default' });
      if (!outcome.ok) {
        setStyleError(outcome.error);
        return;
      }
      setStyleError(null);
      if (isBuiltinStyleId(styleId)) {
        void update({ defaultTableStyleId: styleId });
      }
    })();
  };

  return (
    <Dialog
      open={open}
      title={t('settings.title')}
      description={t('settings.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      className="cs-settings-dialog"
      footer={
        <Button
          data-testid="settings-close"
          onClick={() => {
            onClose();
          }}
        >
          {t('common.close')}
        </Button>
      }
    >
      <div className="cs-settings" data-testid="settings-dialog">
        <Select
          label={t('settings.theme')}
          value={settings.theme}
          data-testid="settings-theme"
          options={(['light', 'dark', 'system'] as const).map((mode) => ({
            value: mode,
            label: t(`theme.${mode}`),
          }))}
          onChange={(event) => {
            const mode = event.target.value;
            if (mode === 'light' || mode === 'dark' || mode === 'system') {
              void update({ theme: mode });
            }
          }}
        />

        <Select
          label={t('settings.language')}
          value={locale}
          data-testid="settings-language"
          options={(['zh-CN', 'en-US'] as const).map((code) => ({
            value: code,
            label: t(`language.${code}`),
          }))}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'zh-CN' || next === 'en-US') {
              void update({ locale: next });
            }
          }}
        />

        <Select
          label={t('settings.autosave')}
          value={settings.autosave ? 'on' : 'off'}
          hint={t('settings.autosaveHint')}
          data-testid="settings-autosave"
          options={[
            { value: 'on', label: t('settings.autosaveOn') },
            { value: 'off', label: t('settings.autosaveOff') },
          ]}
          onChange={(event) => {
            void update({ autosave: event.target.value === 'on' });
          }}
        />

        <Select
          label={t('settings.defaultStyle')}
          value={currentStyleId}
          hint={workspace === null ? t('settings.defaultStyleNew') : t('settings.defaultStyleHint')}
          data-testid="settings-default-style"
          options={styleOptions}
          onChange={(event) => {
            chooseStyle(event.target.value);
          }}
        />

        {persistenceError === null ? null : (
          <p className="cs-field__error" role="alert" data-testid="settings-error">
            {persistenceError}
          </p>
        )}
        {styleFailure === null ? null : (
          <p className="cs-field__error" role="alert" data-testid="settings-style-error">
            {styleFailure}
          </p>
        )}
      </div>
    </Dialog>
  );
}
