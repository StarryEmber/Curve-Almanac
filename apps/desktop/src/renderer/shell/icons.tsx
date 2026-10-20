import type { ReactElement } from 'react';

export interface AppMarkProps {
  size?: number;
  className?: string;
}

/** Product mark: a single curve, drawn with the current text colour. */
export function AppMark({ size = 20, className }: AppMarkProps): ReactElement {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 18c3.2 0 4.3-9 7.5-9S15 15 21 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="3" cy="18" r="1.6" fill="currentColor" />
      <circle cx="21" cy="6" r="1.6" fill="currentColor" />
    </svg>
  );
}

export interface PanelIconProps {
  panel: 'sidebar' | 'inspector';
}

/** Outline glyph for the panel toggles; paired with an `aria-label` button. */
export function PanelIcon({ panel }: PanelIconProps): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      {panel === 'sidebar' ? (
        <line x1="6" y1="2.75" x2="6" y2="13.25" />
      ) : (
        <line x1="10" y1="2.75" x2="10" y2="13.25" />
      )}
    </svg>
  );
}
