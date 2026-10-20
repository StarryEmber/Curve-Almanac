import { useId, useRef, useState } from 'react';

import { cx } from './class-names';

import type { KeyboardEvent, ReactElement, ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  /** Accessible name of the tab list (e.g. "Navigator"). */
  label: string;
  tabs: readonly TabItem[];
  defaultTabId?: string;
  className?: string;
}

/**
 * Tabs with automatic activation and roving tabindex: ArrowLeft/ArrowRight,
 * Home and End move focus *and* selection, as APG recommends (TESTPLAN §2).
 */
export function Tabs({ label, tabs, defaultTabId, className }: TabsProps): ReactElement {
  const baseId = useId();
  const [selectedId, setSelectedId] = useState<string | undefined>(defaultTabId ?? tabs[0]?.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = tabs.findIndex((tab) => tab.id === selectedId);

  const select = (index: number): void => {
    const tab = tabs[index];
    if (!tab) {
      return;
    }
    setSelectedId(tab.id);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = selectedIndex === -1 ? 0 : selectedIndex;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      select((current + 1) % tabs.length);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      select((current - 1 + tabs.length) % tabs.length);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      select(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      select(tabs.length - 1);
    }
  };

  return (
    <div className={cx('cs-tabs', className)}>
      <div className="cs-tabs__list" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
        {tabs.map((tab, index) => {
          const selected = tab.id === selectedId;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className="cs-tab"
              onClick={() => {
                setSelectedId(tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          className="cs-tabs__panel"
          tabIndex={0}
          hidden={tab.id !== selectedId}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
