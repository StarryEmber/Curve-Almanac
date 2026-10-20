// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Tabs } from './Tabs';

afterEach(() => {
  cleanup();
});

function renderTabs(): void {
  render(
    <Tabs
      label="Navigator"
      tabs={[
        { id: 'tables', label: 'Tables', content: <p>No tables yet.</p> },
        { id: 'charts', label: 'Charts', content: <p>No charts yet.</p> },
        { id: 'styles', label: 'Styles', content: <p>No styles yet.</p> },
      ]}
    />,
  );
}

describe('Tabs', () => {
  it('renders a labelled tab list with the first tab selected', () => {
    renderTabs();

    expect(screen.getByRole('tablist', { name: 'Navigator' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Tables' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Charts' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tabpanel').textContent).toBe('No tables yet.');
  });

  it('links each tab to its panel', () => {
    renderTabs();

    const tab = screen.getByRole('tab', { name: 'Charts' });
    const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
  });

  it('moves selection and focus with arrow keys, wrapping at both ends', () => {
    renderTabs();
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Charts' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Charts' }));
    expect(screen.getByRole('tabpanel').textContent).toBe('No charts yet.');

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Styles' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Tables' }).getAttribute('aria-selected')).toBe('true');
  });

  it('jumps to the first and last tab with Home and End', () => {
    renderTabs();
    const tablist = screen.getByRole('tablist');

    fireEvent.keyDown(tablist, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Styles' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Tables' }).getAttribute('aria-selected')).toBe('true');
  });

  it('selects a tab on click and hides the other panels', () => {
    renderTabs();

    fireEvent.click(screen.getByRole('tab', { name: 'Charts' }));

    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    const visible = panels.filter((panel) => !panel.hasAttribute('hidden'));
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toBe('No charts yet.');
  });

  it('uses a single tab stop and moves it with the selection', () => {
    renderTabs();

    expect(screen.getByRole('tab', { name: 'Tables' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Charts' }).getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Tables' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('tab', { name: 'Charts' }).getAttribute('tabindex')).toBe('0');
  });
});
