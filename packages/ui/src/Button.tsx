import { cx } from './class-names';

import type { ButtonHTMLAttributes, ReactElement, ReactNode, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square control that only shows an icon; an `aria-label` becomes mandatory. */
  iconOnly?: boolean;
  /** React 19 passes `ref` as a regular prop; no `forwardRef` needed. */
  ref?: Ref<HTMLButtonElement>;
}

type ButtonAttributes = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'>;

/**
 * Icon-only buttons must carry an accessible name at the type level, which is
 * what TESTPLAN §2 ("所有按钮有可访问名称") asks for (TASKS T0.4).
 */
export type ButtonProps = ButtonOwnProps &
  ButtonAttributes &
  (
    | { iconOnly: true; 'aria-label': string; children: ReactNode }
    | { iconOnly?: false; 'aria-label'?: string; children: ReactNode }
  );

export function Button(props: ButtonProps): ReactElement {
  const {
    variant = 'secondary',
    size = 'md',
    iconOnly = false,
    className,
    children,
    type = 'button',
    ref,
    ...rest
  } = props;

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cx(
        'cs-button',
        `cs-button--${variant}`,
        `cs-button--${size}`,
        iconOnly && 'cs-button--icon',
        className,
      )}
    >
      {children}
    </button>
  );
}
