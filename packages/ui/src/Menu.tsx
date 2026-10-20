import { useEffect, useId, useRef, useState } from 'react';

import { Button } from './Button';
import { cx } from './class-names';

import type { ReactElement } from 'react';

export interface MenuItemDefinition {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Turns the item into a `menuitemradio` with `aria-checked`. */
  checked?: boolean;
}

export interface MenuProps {
  /** Accessible name of the menu itself (e.g. "Theme"). */
  label: string;
  /** Visible trigger text; defaults to `label`. */
  triggerLabel?: string;
  items: readonly MenuItemDefinition[];
  align?: 'start' | 'end';
  className?: string;
}

/**
 * Menu button with the APG keyboard contract: ArrowDown/ArrowUp/Enter/Space
 * open it, Arrow keys move between items, Home/End jump, Escape closes and
 * returns focus to the trigger, Tab closes and moves on (TESTPLAN §2).
 */
export function Menu({
  label,
  triggerLabel,
  items,
  align = 'start',
  className,
}: MenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const enabledIndexes = items
    .map((item, index) => (item.disabled === true ? -1 : index))
    .filter((index) => index >= 0);

  const setActive = (index: number): void => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  };

  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    itemRefs.current[activeIndexRef.current]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const openAt = (index: number): void => {
    setActive(index);
    setOpen(true);
  };

  const move = (delta: 1 | -1): void => {
    if (enabledIndexes.length === 0) {
      return;
    }
    const current = enabledIndexes.indexOf(activeIndexRef.current);
    const start = current === -1 ? 0 : current;
    const next = enabledIndexes[(start + delta + enabledIndexes.length) % enabledIndexes.length];
    if (next === undefined) {
      return;
    }
    setActive(next);
    itemRefs.current[next]?.focus();
  };

  const firstEnabled = enabledIndexes[0];
  const lastEnabled = enabledIndexes[enabledIndexes.length - 1];

  return (
    <div className={cx('cs-menu', className)} ref={containerRef}>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        className="cs-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel === undefined ? label : `${label}: ${triggerLabel}`}
        onClick={() => {
          if (open) {
            close(false);
            return;
          }
          openAt(firstEnabled ?? 0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (open) {
              move(event.key === 'ArrowDown' ? 1 : -1);
              return;
            }
            openAt(event.key === 'ArrowDown' ? (firstEnabled ?? 0) : (lastEnabled ?? 0));
            return;
          }
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            close(true);
          }
        }}
      >
        {triggerLabel ?? label}
      </Button>

      {open ? (
        <div
          className={cx('cs-menu__list', `cs-menu__list--${align}`)}
          role="menu"
          id={menuId}
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
              return;
            }
            if (event.key === 'Home' && firstEnabled !== undefined) {
              event.preventDefault();
              setActive(firstEnabled);
              itemRefs.current[firstEnabled]?.focus();
              return;
            }
            if (event.key === 'End' && lastEnabled !== undefined) {
              event.preventDefault();
              setActive(lastEnabled);
              itemRefs.current[lastEnabled]?.focus();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              close(true);
              return;
            }
            if (event.key === 'Tab') {
              close(false);
            }
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked === undefined ? undefined : item.checked}
              className="cs-menu__item"
              disabled={item.disabled}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => {
                item.onSelect();
                close(true);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
