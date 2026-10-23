// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getBuiltinStyle } from '@curve/domain';

import { TableStyleProvider } from './TableStyleProvider';

afterEach(() => {
  cleanup();
});

describe('TableStyleProvider', () => {
  it('renders a section with the style id and every CSS variable', () => {
    const style = getBuiltinStyle('builtin.dark');
    expect(style).toBeDefined();

    render(
      <TableStyleProvider
        tableStyle={style ?? getBuiltinStyle('builtin.report-light')!}
        data-testid="surface"
      >
        <span>cell</span>
      </TableStyleProvider>,
    );

    const surface = screen.getByTestId('surface');
    expect(surface.tagName).toBe('SECTION');
    expect(surface.getAttribute('data-table-style')).toBe('builtin.dark');
    expect(surface.style.getPropertyValue('--cs-table-body-bg')).toBe('#1e1e1e');
    expect(surface.style.getPropertyValue('--cs-table-row-height')).toBe('32px');
    expect(surface.className).toContain('cs-table-style');
  });

  it('updates the variables when the style changes', () => {
    const finance = getBuiltinStyle('builtin.finance');
    expect(finance).toBeDefined();

    const { rerender } = render(
      <TableStyleProvider
        tableStyle={finance ?? getBuiltinStyle('builtin.report-light')!}
        data-testid="surface"
      >
        <span>cell</span>
      </TableStyleProvider>,
    );

    const surface = screen.getByTestId('surface');
    expect(surface.style.getPropertyValue('--cs-table-row-alt-bg')).toBe('#eef2f7');

    rerender(
      <TableStyleProvider
        tableStyle={getBuiltinStyle('builtin.compact-light')!}
        data-testid="surface"
      >
        <span>cell</span>
      </TableStyleProvider>,
    );

    expect(screen.getByTestId('surface').getAttribute('data-table-style')).toBe(
      'builtin.compact-light',
    );
    expect(surface.style.getPropertyValue('--cs-table-row-height')).toBe('24px');
  });

  it('keeps caller classes and attributes on the surface', () => {
    render(
      <TableStyleProvider
        tableStyle={getBuiltinStyle('builtin.report-light')!}
        className="cs-grid"
        aria-label="Readings"
        data-testid="surface"
      >
        <span>cell</span>
      </TableStyleProvider>,
    );

    const surface = screen.getByTestId('surface');
    expect(surface.className).toContain('cs-table-style');
    expect(surface.className).toContain('cs-grid');
    expect(surface.getAttribute('aria-label')).toBe('Readings');
  });
});
