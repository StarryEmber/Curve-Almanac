/**
 * Plugin manager (T6.3, SPEC §14.1/§14.3).
 *
 * Lists every compiled-in plugin with its state, the contributions it currently
 * owns and the last error, and lets the user disable/enable it for this session.
 * Disabling goes through the host (`deactivate`), so every open selector drops
 * the options on the next registry notification; nothing is written to
 * `settings.json` or the workspace (ADR-054).
 *
 * The dialog also shows the plugin log ring, which is the target of the
 * "view log" action on a plugin error toast.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { toAppError } from '@curve/domain';
import type { PluginState } from '@curve/plugin-sdk';
import { Button, Dialog } from '@curve/ui';

import { describeAppError } from '../../error-text';
import { useI18n } from '../../i18n';
import { setPluginEnabled } from '../../plugins';
import { usePluginLog, usePluginSnapshot } from '../../plugins/use-plugin-snapshot';

import type { MessageKey } from '../../i18n';
import type { PluginSnapshot } from '../../plugins';
import type { ReactElement } from 'react';

export interface PluginManagerFocus {
  /** `plugins` shows the list (default); `log` scrolls to and focuses the log. */
  readonly section: 'plugins' | 'log';
}

export interface PluginManagerDialogProps {
  open: boolean;
  focus: PluginManagerFocus;
  onClose(): void;
}

const STATUS_KEYS: Record<PluginState['status'], MessageKey> = {
  pending: 'plugins.status.pending',
  active: 'plugins.status.active',
  inactive: 'plugins.status.inactive',
  disabled: 'plugins.status.disabled',
};

function countContributions(
  snapshot: PluginSnapshot,
  pluginId: string,
): { fields: number; importers: number; chartKinds: number; commands: number } {
  const ofPlugin = (source: { kind: string; pluginId?: string }): boolean =>
    source.kind === 'plugin' && source.pluginId === pluginId;
  return {
    fields: snapshot.fields.filter((entry) => ofPlugin(entry.source)).length,
    importers: snapshot.importers.filter((entry) => ofPlugin(entry.source)).length,
    chartKinds: snapshot.chartKinds.filter((entry) => ofPlugin(entry.source)).length,
    commands: snapshot.commands.filter((entry) => ofPlugin(entry.source)).length,
  };
}

export function PluginManagerDialog({
  open,
  focus,
  onClose,
}: PluginManagerDialogProps): ReactElement {
  const { t, locale } = useI18n();
  const snapshot = usePluginSnapshot(open);
  const entries = usePluginLog(open);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const logRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) {
      setBusyId(null);
      setToggleError(null);
      return;
    }
    if (focus.section === 'log') {
      logRef.current?.scrollIntoView?.({ block: 'nearest' });
      logRef.current?.focus();
    }
  }, [open, focus]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [locale],
  );

  const plugins = snapshot.plugins;

  const toggle = async (plugin: PluginState): Promise<void> => {
    setBusyId(plugin.id);
    setToggleError(null);
    try {
      await setPluginEnabled(plugin.id, plugin.status !== 'active');
    } catch (thrown) {
      setToggleError(describeAppError(toAppError(thrown), t));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      open={open}
      title={t('plugins.title')}
      description={t('plugins.description')}
      closeLabel={t('common.close')}
      onClose={onClose}
      className="cs-plugin-manager"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div data-testid="plugin-manager" className="cs-plugin-manager__body">
        <section aria-label={t('plugins.listTitle')} className="cs-plugin-manager__section">
          <h3 className="cs-plugin-manager__heading">{t('plugins.listTitle')}</h3>
          {plugins.length === 0 ? (
            <p className="cs-plugin-manager__hint">{t('plugins.empty')}</p>
          ) : (
            <ul className="cs-plugin-manager__list">
              {plugins.map((plugin) => {
                const counts = countContributions(snapshot, plugin.id);
                const active = plugin.status === 'active';
                return (
                  <li
                    key={plugin.id}
                    className="cs-plugin-manager__row"
                    data-testid={`plugin-row-${plugin.id}`}
                    data-plugin-status={plugin.status}
                  >
                    <div className="cs-plugin-manager__identity">
                      <span className="cs-plugin-manager__name">{plugin.name}</span>
                      <span className="cs-plugin-manager__meta">
                        {t('plugins.meta', {
                          id: plugin.id,
                          version: plugin.version,
                          apiVersion: plugin.apiVersion,
                        })}
                      </span>
                      <span className="cs-plugin-manager__status">
                        {t(STATUS_KEYS[plugin.status])}
                      </span>
                      <span className="cs-plugin-manager__contributions">
                        {t('plugins.contributions', counts)}
                      </span>
                      {plugin.error === undefined ? null : (
                        <span className="cs-plugin-manager__error" role="alert">
                          {`${plugin.error.code}: ${plugin.error.message}`}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={active ? 'secondary' : 'primary'}
                      data-testid={`plugin-toggle-${plugin.id}`}
                      disabled={busyId !== null}
                      onClick={() => {
                        void toggle(plugin);
                      }}
                    >
                      {active ? t('plugins.disable') : t('plugins.enable')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {toggleError === null ? null : (
            <p className="cs-dialog__error" role="alert">
              {toggleError}
            </p>
          )}
          <p className="cs-plugin-manager__hint">{t('plugins.sessionOnly')}</p>
        </section>

        <section
          aria-label={t('plugins.logTitle')}
          className="cs-plugin-manager__section"
          data-testid="plugin-log"
          ref={logRef}
          tabIndex={-1}
        >
          <h3 className="cs-plugin-manager__heading">{t('plugins.logTitle')}</h3>
          <p className="cs-plugin-manager__hint">{t('plugins.logHint')}</p>
          {entries.length === 0 ? (
            <p className="cs-plugin-manager__hint" data-testid="plugin-log-empty" role="status">
              {t('plugins.logEmpty')}
            </p>
          ) : (
            <ul className="cs-plugin-manager__log">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="cs-plugin-manager__log-entry"
                  data-testid="plugin-log-entry"
                  data-log-level={entry.level}
                >
                  <time
                    className="cs-plugin-manager__log-time"
                    dateTime={new Date(entry.timestamp).toISOString()}
                  >
                    {formatter.format(entry.timestamp)}
                  </time>
                  <span className="cs-plugin-manager__log-text">{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
