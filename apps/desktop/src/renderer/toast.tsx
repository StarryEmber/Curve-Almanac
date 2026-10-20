/**
 * Toast skeleton for the renderer.
 *
 * T0.3 only needs "show the error envelope, let the user dismiss it". T0.4
 * replaces this with the token-driven `Toast` from `@curve/ui`; the hook API is
 * intentionally small so the swap stays local.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReactElement } from 'react';

export type ToastTone = 'info' | 'error';

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  text: string;
}

export interface ToastController {
  toasts: readonly ToastMessage[];
  push(tone: ToastTone, text: string): void;
  dismiss(id: string): void;
}

export interface UseToastsOptions {
  /** Auto-dismiss delay in ms; `0` keeps toasts until dismissed. */
  autoDismissMs?: number;
}

export interface ToastHostProps {
  toasts: readonly ToastMessage[];
  onDismiss: (id: string) => void;
}

const DEFAULT_AUTO_DISMISS_MS = 6000;

export function useToasts(options: UseToastsOptions = {}): ToastController {
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const autoDismissMs = options.autoDismissMs ?? DEFAULT_AUTO_DISMISS_MS;

  const dismiss = useCallback((id: string): void => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, text: string): void => {
      nextId.current += 1;
      const id = `toast-${String(nextId.current)}`;
      setToasts((current) => [...current, { id, tone, text }]);

      if (autoDismissMs > 0) {
        const timer = setTimeout(() => {
          timers.current.delete(id);
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, autoDismissMs);
        timers.current.set(id, timer);
      }
    },
    [autoDismissMs],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}

export function ToastHost({ toasts, onDismiss }: ToastHostProps): ReactElement | null {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.tone}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span className="toast__text">{toast.text}</span>
          <button
            type="button"
            className="toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
