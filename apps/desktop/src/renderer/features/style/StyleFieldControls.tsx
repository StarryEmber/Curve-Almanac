/**
 * Small controlled fields for the style editor (T3.4).
 *
 * Text/number/colour inputs update the local draft on every valid keystroke so
 * the 50-row preview stays live, but only commit on blur/Enter. Selects and
 * checkboxes commit immediately because one interaction is one undo entry.
 */

import { useEffect, useId, useState } from 'react';

import { DEFAULT_TABLE_STYLE_TOKENS, tableStyleColorSchema } from '@curve/domain';

import type { ChangeEvent, KeyboardEvent, ReactElement } from 'react';

export interface FieldValidityProps {
  /** Reports the current local validity so the editor can block “Done”. */
  onErrorChange: (error: string | null) => void;
}

export interface TextFieldProps extends FieldValidityProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  errorMessage: string;
  required?: boolean;
  maxLength?: number;
  testId?: string;
  placeholder?: string;
}

export function TextField({
  label,
  value,
  onChange,
  onCommit,
  onErrorChange,
  errorMessage,
  required = false,
  maxLength,
  testId,
  placeholder,
}: TextFieldProps): ReactElement {
  const id = useId();
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  const validate = (raw: string): string | null => {
    if (required && raw.trim() === '') {
      return errorMessage;
    }
    if (maxLength !== undefined && raw.length > maxLength) {
      return errorMessage;
    }
    return null;
  };

  const change = (raw: string): void => {
    setText(raw);
    const nextError = validate(raw);
    setError(nextError);
    onErrorChange(nextError);
    if (nextError === null) {
      onChange(raw);
    }
  };

  const blur = (): void => {
    if (error === null) {
      onCommit();
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
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : `${id}-error`}
        data-testid={testId}
        onChange={(event) => {
          change(event.target.value);
        }}
        onBlur={blur}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
      {error === null ? null : (
        <p className="cs-field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface NumberFieldProps extends FieldValidityProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onCommit: () => void;
  errorMessage: string;
  testId?: string;
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  onErrorChange,
  errorMessage,
  testId,
}: NumberFieldProps): ReactElement {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const validate = (raw: string): string | null => {
    if (raw.trim() === '') {
      return errorMessage;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      return errorMessage;
    }
    return null;
  };

  const change = (raw: string): void => {
    setText(raw);
    const nextError = validate(raw);
    setError(nextError);
    onErrorChange(nextError);
    if (nextError === null) {
      onChange(Number(raw));
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
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : `${id}-error`}
        data-testid={testId}
        onChange={(event) => {
          change(event.target.value);
        }}
        onBlur={() => {
          if (error === null) {
            onCommit();
          }
        }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
      {error === null ? null : (
        <p className="cs-field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface ColorFieldProps extends FieldValidityProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  onCommit: () => void;
  errorMessage: string;
  pickerLabel: string;
  allowEmpty?: boolean;
  testId?: string;
}

function isValidColor(value: string): boolean {
  return tableStyleColorSchema.safeParse(value).success;
}

export function ColorField({
  label,
  value,
  onChange,
  onCommit,
  onErrorChange,
  errorMessage,
  pickerLabel,
  allowEmpty = false,
  testId,
}: ColorFieldProps): ReactElement {
  const id = useId();
  const [text, setText] = useState(value ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(value ?? '');
  }, [value]);

  const validate = (raw: string): string | null => {
    if (raw.trim() === '') {
      return allowEmpty ? null : errorMessage;
    }
    return isValidColor(raw) ? null : errorMessage;
  };

  const change = (raw: string): void => {
    setText(raw);
    const nextError = validate(raw);
    setError(nextError);
    onErrorChange(nextError);
    if (nextError === null) {
      onChange(raw === '' ? undefined : raw);
    }
  };

  const pickerValue =
    value !== undefined && isValidColor(value) ? value : DEFAULT_TABLE_STYLE_TOKENS.body.background;

  return (
    <div className="cs-field">
      <label className="cs-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="cs-style-color">
        <input
          className="cs-input cs-style-color__text"
          id={id}
          value={text}
          placeholder="#RRGGBB"
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? undefined : `${id}-error`}
          data-testid={testId}
          onChange={(event) => {
            change(event.target.value);
          }}
          onBlur={() => {
            if (error === null) {
              onCommit();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
        <input
          className="cs-style-color__picker"
          type="color"
          value={pickerValue}
          aria-label={pickerLabel}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const next = event.target.value;
            setText(next);
            setError(null);
            onErrorChange(null);
            onChange(next);
          }}
          onBlur={() => {
            onCommit();
          }}
        />
      </div>
      {error === null ? null : (
        <p className="cs-field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckboxField({ label, checked, onChange }: CheckboxFieldProps): ReactElement {
  const id = useId();
  return (
    <label className="cs-style-check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span>{label}</span>
    </label>
  );
}
