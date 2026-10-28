import { Menu } from '@curve/ui';
import type { MenuItemDefinition } from '@curve/ui';

import { useAppState, useRendererCore } from '../../app-core/use-app-core';
import { useI18n } from '../../i18n';

import { historyActionKey } from './history-action-label';

import type { ReactElement } from 'react';

/** Cross-platform shortcut text for the menu; the key handler accepts both. */
function shortcutText(shift: boolean): string {
  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  return `${isMac ? 'Cmd' : 'Ctrl'}${shift ? '+Shift' : ''}+Z`;
}

/**
 * Title-bar Edit menu (T5.2).
 *
 * The menu is driven by the UI-only `ui.history` snapshot: its labels show the
 * next undo/redo command and disabled items explain when the stacks are empty.
 * `data-*` attributes double as the E2E contract for E7's history assertions.
 */
export function HistoryMenu(): ReactElement {
  const { t } = useI18n();
  const { core } = useRendererCore();
  const history = useAppState((state) => state.ui.history);

  const undoShortcut = shortcutText(false);
  const redoShortcut = shortcutText(true);
  const items: MenuItemDefinition[] = [
    {
      id: 'undo',
      label: history.canUndo
        ? t('history.undoAction', {
            name: t(historyActionKey(history.undoAction)),
            shortcut: undoShortcut,
          })
        : t('history.undoEmpty'),
      disabled: !history.canUndo,
      onSelect: () => {
        void core.actions.undo();
      },
    },
    {
      id: 'redo',
      label: history.canRedo
        ? t('history.redoAction', {
            name: t(historyActionKey(history.redoAction)),
            shortcut: redoShortcut,
          })
        : t('history.redoEmpty'),
      disabled: !history.canRedo,
      onSelect: () => {
        void core.actions.redo();
      },
    },
  ];

  return (
    <span
      className="cs-titlebar__history"
      data-testid="history-menu"
      data-can-undo={history.canUndo ? 'true' : 'false'}
      data-can-redo={history.canRedo ? 'true' : 'false'}
      data-undo-action={history.undoAction ?? ''}
      data-redo-action={history.redoAction ?? ''}
      data-undo-depth={history.undoDepth}
      data-redo-depth={history.redoDepth}
    >
      <Menu
        label={t('history.menuLabel')}
        triggerLabel={t('history.menuTrigger')}
        items={items}
        align="start"
      />
    </span>
  );
}
