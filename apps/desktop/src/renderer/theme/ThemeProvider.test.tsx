// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MediaQueryLike } from '@curve/ui';

import { ThemeProvider, useTheme } from './ThemeProvider';

import type { ReactElement } from 'react';

function Probe(): ReactElement {
  const { mode, resolved, setMode } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved">{resolved}</span>
      <button type="button" onClick={() => setMode('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setMode('light')}>
        light
      </button>
      <button type="button" onClick={() => setMode('system')}>
        system
      </button>
    </div>
  );
}

function renderProvider(): void {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider', () => {
  it('starts in system mode and resolves light when the OS has no preference', () => {
    renderProvider();

    expect(screen.getByTestId('mode').textContent).toBe('system');
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('restores a stored dark preference', () => {
    window.localStorage.setItem('curve-studio.theme', 'dark');

    renderProvider();

    expect(screen.getByTestId('mode').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('honours an explicit initial mode over storage', () => {
    window.localStorage.setItem('curve-studio.theme', 'dark');

    render(
      <ThemeProvider initialMode="light">
        <Probe />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('persists and applies mode changes', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'dark' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('curve-studio.theme')).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'light' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('follows OS changes while in system mode and detaches on unmount', () => {
    let listener: ((event: { matches: boolean }) => void) | undefined;
    const removeEventListener = vi.fn();
    const query: MediaQueryLike = {
      matches: false,
      addEventListener: (_type, next) => {
        listener = next;
      },
      removeEventListener,
    };
    vi.stubGlobal('matchMedia', () => query);

    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    act(() => {
      listener?.({ matches: true });
    });

    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    unmount();
    expect(removeEventListener).toHaveBeenCalledTimes(1);
  });
});
