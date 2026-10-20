// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastHost, useToasts } from './toast';

import type { ToastMessage } from './toast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useToasts', () => {
  it('pushes toasts with unique ids', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.push('error', 'boom');
      result.current.push('info', 'fyi');
    });

    expect(result.current.toasts.map((toast) => toast.text)).toEqual(['boom', 'fyi']);
    expect(new Set(result.current.toasts.map((toast) => toast.id)).size).toBe(2);
  });

  it('dismisses a toast by id', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.push('error', 'boom');
      result.current.push('error', 'bang');
    });
    const [first] = result.current.toasts;
    act(() => {
      result.current.dismiss(first?.id ?? '');
    });

    expect(result.current.toasts.map((toast) => toast.text)).toEqual(['bang']);
  });

  it('auto-dismisses after the configured delay', () => {
    const { result } = renderHook(() => useToasts({ autoDismissMs: 1000 }));

    act(() => {
      result.current.push('error', 'boom');
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('keeps toasts when auto-dismiss is disabled', () => {
    const { result } = renderHook(() => useToasts({ autoDismissMs: 0 }));

    act(() => {
      result.current.push('info', 'sticky');
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.toasts).toHaveLength(1);
  });

  it('clears pending timers on unmount', () => {
    const { result, unmount } = renderHook(() => useToasts({ autoDismissMs: 1000 }));

    act(() => {
      result.current.push('error', 'boom');
    });
    unmount();

    expect(() => {
      vi.advanceTimersByTime(5000);
    }).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function toast(overrides: Partial<ToastMessage> = {}): ToastMessage {
  return { id: 'toast-1', tone: 'error', text: 'boom', ...overrides };
}

describe('ToastHost', () => {
  it('renders nothing without toasts', () => {
    const { container } = render(<ToastHost toasts={[]} onDismiss={() => undefined} />);

    expect(container.innerHTML).toBe('');
  });

  it('uses an alert for errors and a status for information', () => {
    render(
      <ToastHost
        toasts={[toast(), toast({ id: 'toast-2', tone: 'info', text: 'fyi' })]}
        onDismiss={() => undefined}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('boom');
    expect(screen.getByRole('status').textContent).toContain('fyi');
  });

  it('dismisses through the accessible button', () => {
    const onDismiss = vi.fn();
    render(<ToastHost toasts={[toast()]} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onDismiss).toHaveBeenCalledWith('toast-1');
  });
});
