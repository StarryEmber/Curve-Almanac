// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GridCell } from './GridCell';

import type { GridCellProps } from './GridCell';

afterEach(() => {
  cleanup();
});

function props(overrides: Partial<GridCellProps> = {}): GridCellProps {
  return {
    rowIndex: 0,
    colIndex: 1,
    rowId: 'row_a',
    columnId: 'col_test',
    text: '42',
    align: 'right',
    render: 'text',
    barRatio: null,
    badgeTone: null,
    width: 120,
    stickyLeft: null,
    active: false,
    selected: false,
    editing: false,
    onActivate: vi.fn(),
    onBeginEdit: vi.fn(),
    ...overrides,
  };
}

describe('GridCell', () => {
  it('exposes the resolved alignment and render mode to CSS', () => {
    render(<GridCell {...props()} />);

    const cell = screen.getByRole('gridcell');
    expect(cell.getAttribute('data-align')).toBe('right');
    expect(cell.getAttribute('data-render')).toBe('text');
    expect(cell.textContent).toBe('42');
  });

  it('renders an enum badge with a stable tone', () => {
    render(<GridCell {...props({ text: 'Open', render: 'badge', badgeTone: 2 })} />);

    const badge = screen.getByText('Open');
    expect(badge.className).toContain('cs-grid__badge');
    expect(badge.getAttribute('data-tone')).toBe('2');
    expect(screen.getByRole('gridcell').getAttribute('data-badge-tone')).toBe('2');
  });

  it('draws a background bar without hiding the value', () => {
    render(<GridCell {...props({ render: 'bar', barRatio: 0.25 })} />);

    const bar = screen.getByRole('gridcell').querySelector('.cs-grid__bar');
    expect(bar).not.toBeNull();
    expect((bar as HTMLElement).style.width).toBe('25%');
    expect(screen.getByText('42')).toBeDefined();
  });

  it('renders a zero-width bar for a flat range', () => {
    render(<GridCell {...props({ render: 'bar', barRatio: 0 })} />);

    const bar = screen.getByRole('gridcell').querySelector('.cs-grid__bar');
    expect((bar as HTMLElement).style.width).toBe('0%');
  });

  it('keeps an empty cell focusable and non-collapsing', () => {
    render(<GridCell {...props({ text: '' })} />);

    expect(screen.getByRole('gridcell').textContent).toBe('\u00a0');
  });

  it('prefers the editor while editing', () => {
    render(<GridCell {...props({ editing: true, editor: <input data-testid="editor" /> })} />);

    expect(screen.getByTestId('editor')).toBeDefined();
    expect(screen.queryByText('42')).toBeNull();
  });

  it('forwards activation and edit gestures', () => {
    const onActivate = vi.fn();
    const onBeginEdit = vi.fn();
    render(<GridCell {...props({ onActivate, onBeginEdit })} />);
    const cell = screen.getByRole('gridcell');

    fireEvent.mouseDown(cell);
    fireEvent.doubleClick(cell);

    expect(onActivate).toHaveBeenCalledWith(0, 1, false);
    expect(onBeginEdit).toHaveBeenCalledWith(0, 1);
  });
});
