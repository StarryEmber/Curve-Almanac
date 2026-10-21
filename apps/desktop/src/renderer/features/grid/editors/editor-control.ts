import type { KeyboardEvent } from 'react';

export type EditorCommitDirection = 'down' | 'up' | 'left' | 'right';

export interface EditorControlProps {
  /** Localised accessible label, e.g. "Edit Amount". */
  label: string;
  value: string;
  /** Full localised issue text; the editor points aria-describedby at it. */
  error: string | null;
  busy: boolean;
  onChange(value: string): void;
  onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>): void;
  onBlur(): void;
  onCompositionStart(): void;
  onCompositionEnd(): void;
  registerRef(element: HTMLInputElement | HTMLSelectElement | null): void;
}
