/** Tab bar for the open views (T2.1; pane splitting is T5.1). */

import type { ViewDef } from '@curve/domain';

import type { KeyboardEvent, ReactElement } from 'react';

export interface TabBarProps {
  viewIds: readonly string[];
  views: Record<string, ViewDef>;
  activeViewId: string | null;
  label: string;
  closeLabel: (title: string) => string;
  onActivate: (viewId: string) => void;
  onClose: (viewId: string) => void;
}

export function TabBar({
  viewIds,
  views,
  activeViewId,
  label,
  closeLabel,
  onActivate,
  onClose,
}: TabBarProps): ReactElement {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    const index = viewIds.findIndex((id) => id === activeViewId);
    if (index < 0 || viewIds.length === 0) {
      return;
    }
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = viewIds[(index + delta + viewIds.length) % viewIds.length];
    if (next !== undefined) {
      onActivate(next);
    }
  };

  return (
    <div className="cs-tabbar" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {viewIds.map((viewId) => {
        const view = views[viewId];
        if (view === undefined) {
          return null;
        }
        const selected = viewId === activeViewId;
        return (
          <div key={viewId} className="cs-tabbar__item" role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={selected ? 'cs-tabbar__tab cs-tabbar__tab--active' : 'cs-tabbar__tab'}
              onClick={() => {
                onActivate(viewId);
              }}
            >
              {view.title}
            </button>
            <button
              type="button"
              className="cs-tabbar__close"
              aria-label={closeLabel(view.title)}
              onClick={() => {
                onClose(viewId);
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
