/**
 * Small controlled fields for the chart inspector (T4.4).
 *
 * Text and number inputs keep a local draft while typing and commit on
 * blur/Enter, so one interaction is at most one `chart.update` command and one
 * undo entry. Selects and checkboxes commit immediately.
 */

import { useEffect, useId, useState } from 'react';

import type { KeyboardEvent, ReactElement } from 'react';

export interface ChartTextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  testId?: string;
  onCommit: (value: string) => void;
}

export function ChartTextField({
  label,
  value,
  placeholder,
  testId,
  onCommit,
}: ChartTextFieldProps): ReactElement {
  const id = useId();
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  const commit = (): void => {
    const trimmed = text.trim();
    setText(trimmed);
    if (trimmed !== value) {
      onCommit(trimmed);
    }
  };

  return (
    <div className="cs-field">
      <label className="cs-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="cs-input"
        value={text}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

export interface ChartNumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Shown when the typed value is not a number inside `[min, max]`. */
  invalidText: string;
  testId?: string;
  onCommit: (value: number) => void;
}

export function ChartNumberField({
  label,
  value,
  min,
  max,
  invalidText,
  testId,
  onCommit,
}: ChartNumberFieldProps): ReactElement {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(String(value));
    setInvalid(false);
  }, [value]);

  const parse = (raw: string): number | null => {
    if (raw.trim() === '') {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      return null;
    }
    return Math.round(parsed);
  };

  return (
    <div className="cs-field">
      <label className="cs-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="cs-input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={text}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        data-testid={testId}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
        onBlur={() => {
          const parsed = parse(text);
          if (parsed === null) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          setText(String(parsed));
          if (parsed !== value) {
            onCommit(parsed);
          }
        }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
      {invalid ? (
        <p className="cs-field__error" id={`${id}-error`} role="alert">
          {invalidText}
        </p>
      ) : null}
    </div>
  );
}

export interface ChartCheckboxProps {
  label: string;
  checked: boolean;
  testId?: string;
  onChange: (checked: boolean) => void;
}

export function ChartCheckbox({
  label,
  checked,
  testId,
  onChange,
}: ChartCheckboxProps): ReactElement {
  const id = useId();
  return (
    <label className="cs-chart-check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span>{label}</span>
    </label>
  );
}
