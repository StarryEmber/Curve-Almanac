// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Menu } from './Menu';

import type { MenuItemDefinition } from './Menu';

afterEach(() => {
  cleanup();
});

function buildItems(onSelect: (id: string) => void = () => undefined): MenuItemDefinition[] {
  return [
    { id: 'light', label: 'Light', onSelect: () => onSelect('light'), checked: false },
    { id: 'dark', label: 'Dark', onSelect: () => onSelect('dark'), checked: true },
    { id: 'system', label: 'System', onSelect: () => onSelect('system'), checked: false },
  ];
}

function openMenu(items: MenuItemDefinition[] = buildItems()): HTMLElement {
  render(<Menu label="Theme" triggerLabel="Dark" items={items} />);
  const trigger = screen.getByRole('button', { name: 'Theme: Dark' });
  fireEvent.click(trigger);
  return trigger;
}

describe('Menu', () => {
  it('is closed until the trigger is used', () => {
    render(<Menu label="Theme" items={buildItems()} />);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Theme' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('opens, focuses the first item and marks the trigger expanded', () => {
    openMenu();

    expect(screen.getByRole('menu', { name: 'Theme' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Theme: Dark' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Light' }));
  });

  it('exposes radio semantics for checked items', () => {
    openMenu();

    expect(screen.getByRole('menuitemradio', { name: 'Dark' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Light' }).getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('moves between items with the arrow keys and wraps around', () => {
    openMenu();
    const menu = screen.getByRole('menu');
    const [light, dark, system] = ['Light', 'Dark', 'System'].map((name) =>
      screen.getByRole('menuitemradio', { name }),
    );

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(dark);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(system);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(light);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(system);
  });

  it('supports Home and End', () => {
    openMenu();
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'System' }));
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Light' }));
  });

  it('skips disabled items when navigating', () => {
    const items = buildItems();
    const withDisabled: MenuItemDefinition[] = [
      items[0] as MenuItemDefinition,
      { id: 'dark', label: 'Dark', onSelect: () => undefined, disabled: true },
      items[2] as MenuItemDefinition,
    ];
    openMenu(withDisabled);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });

    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'System' }));
  });

  it('selects an item, closes and returns focus to the trigger', () => {
    const onSelect = vi.fn();
    const trigger = openMenu(buildItems(onSelect));

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }));

    expect(onSelect).toHaveBeenCalledWith('dark');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape and on an outside press', () => {
    const trigger = openMenu();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeDefined();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with ArrowDown and focuses the first item', () => {
    render(<Menu label="Theme" items={buildItems()} />);
    const trigger = screen.getByRole('button', { name: 'Theme' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Light' }));
  });
});
