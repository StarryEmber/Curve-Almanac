import { useId } from 'react';

import { cx } from './class-names';

import type { ReactElement, SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  /** Rendered as `disabled` on the `<option>` (T4.4 chart layouts). */
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'id' | 'children'
> {
  /** Visible label; pass `hideLabel` for dense toolbars. */
  label: string;
  options: readonly SelectOption[];
  id?: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}

export function Select({
  label,
  options,
  id,
  hint,
  error,
  hideLabel = false,
  className,
  ...rest
}: SelectProps): ReactElement {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint === undefined ? undefined : `${selectId}-hint`;
  const errorId = error === undefined ? undefined : `${selectId}-error`;
  const describedBy = [hintId, errorId].filter((value) => value !== undefined).join(' ');

  return (
    <div className={cx('cs-field', 'cs-field--inline', className)}>
      <label
        className={cx('cs-field__label', hideLabel && 'cs-visually-hidden')}
        htmlFor={selectId}
      >
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        className="cs-select"
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled === true}>
            {option.label}
          </option>
        ))}
      </select>
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
