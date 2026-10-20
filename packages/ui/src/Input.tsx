import { useId } from 'react';

import { cx } from './class-names';

import type { InputHTMLAttributes, ReactElement } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Visible label, wired to the control with `htmlFor`. */
  label: string;
  id?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, id, hint, error, className, ...rest }: InputProps): ReactElement {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint === undefined ? undefined : `${inputId}-hint`;
  const errorId = error === undefined ? undefined : `${inputId}-error`;
  const describedBy = [hintId, errorId].filter((value) => value !== undefined).join(' ');

  return (
    <div className={cx('cs-field', className)}>
      <label className="cs-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        className="cs-input"
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
      />
      {hint === undefined ? null : (
        <p className="cs-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p className="cs-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
