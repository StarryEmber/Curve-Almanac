/**
 * The single table styling surface (T3.2, SPEC §10.2).
 *
 * It is a `<section>` rather than a wrapper so the grid keeps its accessible
 * `role="grid"`/layout without an extra box. Every visual table decision reaches
 * CSS through `--cs-table-*` variables; children never receive inline colours.
 */

import type { TableStyle } from '@curve/domain';

import { cx } from './class-names';
import { styleToCssVars } from './table-style';

import type { ComponentPropsWithoutRef, CSSProperties, ReactElement } from 'react';

export interface TableStyleProviderProps extends Omit<
  ComponentPropsWithoutRef<'section'>,
  'style'
> {
  tableStyle: TableStyle;
  style?: CSSProperties;
}

export function TableStyleProvider({
  tableStyle,
  className,
  style,
  ...rest
}: TableStyleProviderProps): ReactElement {
  return (
    <section
      {...rest}
      className={cx('cs-table-style', className)}
      data-table-style={tableStyle.id}
      style={{ ...(styleToCssVars(tableStyle) as CSSProperties), ...style }}
    />
  );
}
