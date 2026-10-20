/**
 * Application menu skeleton (T0.2).
 *
 * The template is built from plain data so it can be unit tested without an
 * Electron runtime. Developer-only entries (reload, DevTools) exist only when
 * the app runs through `electron-vite dev`.
 */

import type { MenuItemConstructorOptions } from 'electron';

export interface MenuContext {
  appName: string;
  isDev: boolean;
  platform: NodeJS.Platform;
}

export interface MenuActions {
  showAbout(): void;
}

export function buildMenuTemplate(
  context: MenuContext,
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  const isMac = context.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({ role: 'appMenu' });
  }

  template.push({
    label: '&File',
    submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
  });

  template.push({
    label: '&Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  });

  const viewSubmenu: MenuItemConstructorOptions[] = [];
  if (context.isDev) {
    viewSubmenu.push(
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
    );
  }
  viewSubmenu.push(
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  );
  template.push({ label: '&View', submenu: viewSubmenu });

  template.push({
    label: '&Window',
    submenu: [{ role: 'minimize' }, { role: 'zoom' }],
  });

  template.push({
    label: '&Help',
    submenu: [
      {
        label: `About ${context.appName}`,
        click: (): void => {
          actions.showAbout();
        },
      },
    ],
  });

  return template;
}
