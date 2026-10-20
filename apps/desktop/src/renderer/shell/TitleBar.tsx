import { Button, Menu, THEME_MODES } from '@curve/ui';
import type { MenuItemDefinition } from '@curve/ui';

import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';

import { AppMark, PanelIcon } from './icons';

import type { ReactElement } from 'react';

export interface TitleBarProps {
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onOpenHelp: () => void;
}

export function TitleBar({
  sidebarOpen,
  inspectorOpen,
  onToggleSidebar,
  onToggleInspector,
  onOpenHelp,
}: TitleBarProps): ReactElement {
  const { t } = useI18n();
  const { mode, setMode } = useTheme();

  const themeItems: MenuItemDefinition[] = THEME_MODES.map((option) => ({
    id: option,
    label: t(`theme.${option}`),
    checked: mode === option,
    onSelect: () => {
      setMode(option);
    },
  }));

  return (
    <header className="cs-app__titlebar" data-testid="titlebar">
      <div className="cs-titlebar__brand">
        <AppMark className="cs-titlebar__mark" />
        <h1 className="cs-titlebar__product">{t('app.name')}</h1>
        <span className="cs-titlebar__workspace" data-testid="workspace-label">
          {t('shell.titleBar.workspaceEmpty')}
        </span>
      </div>

      <div className="cs-titlebar__actions">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t('shell.titleBar.toggleSidebar')}
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <PanelIcon panel="sidebar" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t('shell.titleBar.toggleInspector')}
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
        >
          <PanelIcon panel="inspector" />
        </Button>
        <Menu
          label={t('theme.menuLabel')}
          triggerLabel={t(`theme.${mode}`)}
          items={themeItems}
          align="end"
        />
        <Button variant="ghost" size="sm" onClick={onOpenHelp}>
          {t('shell.titleBar.help')}
        </Button>
      </div>
    </header>
  );
}
