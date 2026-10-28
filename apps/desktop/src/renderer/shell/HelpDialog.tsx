import { Button, Dialog } from '@curve/ui';

import { listShortcutCommands } from '../features/keymap/commands';
import { formatShortcut } from '../features/keymap/shortcut';
import { useI18n } from '../i18n';

import type { ReactElement } from 'react';

export interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: 'shell.help.keyTab', description: 'shell.help.tabText' },
  { keys: 'shell.help.keyEscape', description: 'shell.help.escapeText' },
  { keys: 'shell.help.keyArrows', description: 'shell.help.arrowsText' },
] as const;

const COMMANDS = listShortcutCommands();

/** First real `Dialog` consumer: also the keyboard/E2E entry point for Esc + focus trap. */
export function HelpDialog({ open, onClose }: HelpDialogProps): ReactElement {
  const { t } = useI18n();

  return (
    <Dialog
      open={open}
      title={t('shell.help.title')}
      description={t('shell.help.description')}
      closeLabel={t('shell.help.close')}
      onClose={onClose}
      className="cs-help-dialog"
      footer={
        <Button variant="primary" onClick={onClose}>
          {t('shell.help.dismiss')}
        </Button>
      }
    >
      <dl className="cs-shortcuts">
        {SHORTCUTS.map((shortcut) => (
          <div className="cs-shortcuts__row" key={shortcut.keys}>
            <dt>
              <kbd className="cs-kbd">{t(shortcut.keys)}</kbd>
            </dt>
            <dd>{t(shortcut.description)}</dd>
          </div>
        ))}
      </dl>

      <h3 className="cs-shortcuts__title">{t('shell.help.commandsTitle')}</h3>
      <dl className="cs-shortcuts">
        {COMMANDS.map((command) => (
          <div className="cs-shortcuts__row" key={command.id}>
            <dt>
              {command.shortcuts.map((shortcut, index) => (
                <span key={shortcut}>
                  {index > 0 ? ' / ' : null}
                  <kbd className="cs-kbd">{formatShortcut(shortcut)}</kbd>
                </span>
              ))}
            </dt>
            <dd>{t(command.labelKey)}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
