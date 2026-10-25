/**
 * Chart inspector/list copy (T4.4). All user-visible chart strings go through
 * the message tables; this module only maps persisted enums to message keys.
 */

import type { ChartKind, ChartMapping, ChartOptions, ValidationIssueCode } from '@curve/domain';

import type { MessageKey, Translate } from '../../i18n';

export const CHART_KIND_KEYS: Record<ChartKind, MessageKey> = {
  line: 'chart.kind.line',
  scatter: 'chart.kind.scatter',
  bar: 'chart.kind.bar',
};

export const CHART_LAYOUT_KEYS: Record<ChartMapping['layout'], MessageKey> = {
  wide: 'chart.layout.wide',
  long: 'chart.layout.long',
};

export const CHART_PALETTE_KEYS: Record<ChartOptions['paletteId'], MessageKey> = {
  default: 'chart.palette.default',
  muted: 'chart.palette.muted',
  vivid: 'chart.palette.vivid',
  colorblind: 'chart.palette.colorblind',
};

export const CHART_LEGEND_KEYS: Record<ChartOptions['legend'], MessageKey> = {
  top: 'chart.legend.top',
  right: 'chart.legend.right',
  bottom: 'chart.legend.bottom',
  none: 'chart.legend.none',
};

export const CHART_BACKGROUND_KEYS: Record<ChartOptions['background'], MessageKey> = {
  auto: 'chart.background.auto',
  light: 'chart.background.light',
  dark: 'chart.background.dark',
};

const MAPPING_ISSUE_KEYS: Record<ValidationIssueCode, MessageKey> = {
  E_REQUIRED: 'chart.mapping.issue.required',
  E_TYPE: 'chart.mapping.issue.type',
  E_DUPLICATE_KEY: 'chart.mapping.issue.duplicate',
  E_VALIDATION: 'chart.mapping.issue.role',
  E_ENUM: 'chart.mapping.issue.other',
  E_RANGE: 'chart.mapping.issue.other',
};

/** Localized label for one `validateChartMapping` / `resolveSeries` issue. */
export function mappingIssueLabel(code: ValidationIssueCode, t: Translate): string {
  return t(MAPPING_ISSUE_KEYS[code]);
}

/** The mapping field an issue path points at, e.g. `mapping.yColumnIds[1]`. */
export function mappingPathLabel(path: string): MessageKey {
  if (path.startsWith('mapping.xColumnId')) {
    return 'chart.mapping.path.x';
  }
  if (path.startsWith('mapping.yColumnIds')) {
    return 'chart.mapping.path.yMulti';
  }
  if (path.startsWith('mapping.yColumnId')) {
    return 'chart.mapping.path.y';
  }
  if (path.startsWith('mapping.seriesColumnId')) {
    return 'chart.mapping.path.series';
  }
  return 'chart.mapping.path.other';
}

export function chartKindLabel(kind: ChartKind, t: Translate): string {
  return t(CHART_KIND_KEYS[kind]);
}

export function chartLayoutLabel(layout: ChartMapping['layout'], t: Translate): string {
  return t(CHART_LAYOUT_KEYS[layout]);
}
