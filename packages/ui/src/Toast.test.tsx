// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastHost, useToasts } from './Toast';

import type { ToastMessage } from './Toast';

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
      result.current.push('success', 'saved');
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

function host(
  toasts: readonly ToastMessage[],
  onDismiss: (id: string) => void = () => undefined,
): void {
  render(
    <ToastHost
      toasts={toasts}
      onDismiss={onDismiss}
      dismissLabel="Dismiss notification"
      regionLabel="Notifications"
    />,
  );
}

describe('ToastHost', () => {
  it('renders nothing without toasts', () => {
    const { container } = render(
      <ToastHost
        toasts={[]}
        onDismiss={() => undefined}
        dismissLabel="Dismiss notification"
        regionLabel="Notifications"
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('announces errors as alerts and everything else as status', () => {
    host([toast(), toast({ id: 'toast-2', tone: 'info', text: 'fyi' })]);

    expect(screen.getByRole('alert').textContent).toContain('boom');
    expect(screen.getByRole('status').textContent).toContain('fyi');
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeDefined();
  });

  it('dismisses through the accessible button', () => {
    const onDismiss = vi.fn();
    host([toast()], onDismiss);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(onDismiss).toHaveBeenCalledWith('toast-1');
  });
});
