import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './Button';
import { cx } from './class-names';

import type { ReactElement, ReactNode, RefObject } from 'react';

export interface DialogProps {
  open: boolean;
  /** Accessible name; rendered as the dialog heading. */
  title: string;
  description?: string;
  /** Accessible name of the icon-only close button. */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Clicking the backdrop closes by default (APG allows both). */
  dismissOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Modal dialog with a focus trap, Escape-to-close and focus restoration
 * (TESTPLAN §2 `ui/components`; SPEC §16.3 "Esc 关闭对话框").
 *
 * The trap runs on `document` in the capture phase so it also wins over the
 * shell's own key handlers, and a `focusin` guard pulls focus back if something
 * outside the dialog (for example a toast) tries to steal it while open.
 */
export function Dialog({
  open,
  title,
  description,
  closeLabel,
  onClose,
  children,
  footer,
  dismissOnBackdrop = true,
  initialFocusRef,
  className,
}: DialogProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  const initialFocusRefRef = useRef(initialFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
    initialFocusRefRef.current = initialFocusRef;
  }, [onClose, initialFocusRef]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const panel = panelRef.current;
    if (!panel) {
      return undefined;
    }

    const previouslyFocused = document.activeElement;
    const initial = initialFocusRefRef.current?.current ?? focusableElements(panel)[0] ?? panel;
    initial.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const items = focusableElements(panel);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const active = document.activeElement;
      if (!(active instanceof Node) || !panel.contains(active) || active === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent): void => {
      const target = event.target;
      if (target instanceof Node && !panel.contains(target)) {
        (focusableElements(panel)[0] ?? panel).focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn);
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn);
      document.documentElement.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    // A background `mousedown` closes the dialog; `click` would also fire when a
    // drag starts inside the panel and ends on the backdrop.
    <div
      className="cs-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissOnBackdrop) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={cx('cs-dialog', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
      >
        <header className="cs-dialog__header">
          <h2 className="cs-dialog__title" id={titleId}>
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={closeLabel}
            className="cs-dialog__close"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </Button>
        </header>
        {description === undefined ? null : (
          <p className="cs-dialog__description" id={descriptionId}>
            {description}
          </p>
        )}
        <div className="cs-dialog__body">{children}</div>
        {footer === undefined ? null : <footer className="cs-dialog__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
