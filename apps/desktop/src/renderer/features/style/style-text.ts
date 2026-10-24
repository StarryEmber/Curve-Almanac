/** Localisation helpers for table styles (T3.4). */

import { isBuiltinStyleId } from '@curve/domain';
import type { BuiltinStyleId, Density, GridMode, TableStyle } from '@curve/domain';

import type { MessageKey, Translate } from '../../i18n';

const BUILTIN_NAME_KEYS: Record<BuiltinStyleId, MessageKey> = {
  'builtin.report-light': 'style.builtin.report-light',
  'builtin.compact-light': 'style.builtin.compact-light',
  'builtin.dark': 'style.builtin.dark',
  'builtin.finance': 'style.builtin.finance',
};

/** Builtin names are localised by stable id; user styles keep their own name. */
export function styleDisplayName(style: TableStyle, t: Translate): string {
  return isBuiltinStyleId(style.id) ? t(BUILTIN_NAME_KEYS[style.id]) : style.name;
}

export function densityLabel(density: Density, t: Translate): string {
  return t(`style.density.${density}`);
}

export function gridLabel(grid: GridMode, t: Translate): string {
  return t(`style.grid.${grid}`);
}
