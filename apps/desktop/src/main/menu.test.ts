import { describe, expect, it, vi } from 'vitest';

import { buildMenuTemplate } from './menu';

import type { MenuActions } from './menu';
import type { MenuItemConstructorOptions } from 'electron';

function collectRoles(items: MenuItemConstructorOptions[]): string[] {
  const roles: string[] = [];
  for (const item of items) {
    if (typeof item.role === 'string') {
      roles.push(item.role);
    }
    if (Array.isArray(item.submenu)) {
      roles.push(...collectRoles(item.submenu));
    }
  }
  return roles;
}

function build(overrides: { isDev?: boolean; platform?: NodeJS.Platform } = {}) {
  const actions: MenuActions = { showAbout: vi.fn() };
  const template = buildMenuTemplate(
    {
      appName: 'Curve Almanac',
      isDev: overrides.isDev ?? false,
      platform: overrides.platform ?? 'win32',
    },
    actions,
  );
  return { template, actions };
}

describe('buildMenuTemplate', () => {
  it('offers the expected top-level menus on Windows', () => {
    const { template } = build();

    expect(template.map((item) => item.label)).toEqual([
      '&File',
      '&Edit',
      '&View',
      '&Window',
      '&Help',
    ]);
  });

  it('hides reload and DevTools entries from production builds', () => {
    const roles = collectRoles(build({ isDev: false }).template);

    expect(roles).not.toContain('toggleDevTools');
    expect(roles).not.toContain('reload');
    expect(roles).not.toContain('forceReload');
    expect(roles).toContain('resetZoom');
  });

  it('adds reload and DevTools entries in development', () => {
    const roles = collectRoles(build({ isDev: true }).template);

    expect(roles).toContain('toggleDevTools');
    expect(roles).toContain('reload');
  });

  it('prepends the macOS app menu only on darwin', () => {
    expect(build({ platform: 'darwin' }).template[0]?.role).toBe('appMenu');
    expect(build({ platform: 'win32' }).template[0]?.role).toBeUndefined();
  });

  it('quits from the File menu on Windows and closes on macOS', () => {
    expect(collectRoles(build({ platform: 'win32' }).template)).toContain('quit');
    expect(collectRoles(build({ platform: 'darwin' }).template)).toContain('close');
  });

  it('routes the About item to the provided action', () => {
    const { template, actions } = build();
    const helpMenu = template.find((item) => item.label === '&Help');

    expect(Array.isArray(helpMenu?.submenu)).toBe(true);
    const aboutItem = (helpMenu?.submenu as MenuItemConstructorOptions[])[0];

    expect(aboutItem?.label).toBe('About Curve Almanac');
    (aboutItem?.click as unknown as () => void)();
    expect(actions.showAbout).toHaveBeenCalledTimes(1);
  });
});
