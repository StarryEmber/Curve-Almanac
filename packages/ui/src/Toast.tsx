import { useCallback, useEffect, useRef, useState } from 'react';

import { cx } from './class-names';

import type { ReactElement } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

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
  /** Accessible name of the dismiss button, supplied by the app's message table. */
  dismissLabel: string;
  /** Accessible name of the notifications region. */
  regionLabel: string;
}

export const DEFAULT_TOAST_AUTO_DISMISS_MS = 6000;

export function useToasts(options: UseToastsOptions = {}): ToastController {
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const autoDismissMs = options.autoDismissMs ?? DEFAULT_TOAST_AUTO_DISMISS_MS;

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

/**
 * Renders the toast stack (SPEC §16.3: errors are announced as `alert`, status
 * changes as `status`; the dismiss control is a real, named button).
 */
export function ToastHost({
  toasts,
  onDismiss,
  dismissLabel,
  regionLabel,
}: ToastHostProps): ReactElement | null {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="cs-toasts" role="region" aria-label={regionLabel}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx('cs-toast', `cs-toast--${toast.tone}`)}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span className="cs-toast__text">{toast.text}</span>
          <button
            type="button"
            className="cs-toast__close"
            onClick={() => {
              onDismiss(toast.id);
            }}
            aria-label={dismissLabel}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
  );
}
