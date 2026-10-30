/**
 * Contribution labels and source attribution (T6.3, SPEC §14.3).
 *
 * Builtin entries keep their localised names (the message tables own the copy);
 * plugin entries show the plugin-provided label plus a source suffix, so a user
 * can tell a plugin option from a builtin one and knows which plugin to disable
 * when something misbehaves (TASKS T6.3 "菜单项/选项加来源标识").
 */

import type { BuiltinColumnType } from '@curve/domain';
import type {
  ChartKindDef,
  ContributionSource,
  FieldTypeDef,
  ImporterDef,
  PluginState,
  RegistryEntry,
} from '@curve/plugin-sdk';

import type { MessageKey, Translate } from '../i18n';

/** Ids of the five builtin field types are their storage types (ADR-054). */
export function isBuiltinFieldTypeId(id: string): id is BuiltinColumnType {
  return id === 'text' || id === 'number' || id === 'date' || id === 'boolean' || id === 'enum';
}

export function builtinFieldTypeKey(type: BuiltinColumnType): MessageKey {
  return `columns.type.${type}` as MessageKey;
}

/** Plugin name for a contribution source; `null` for host-owned entries. */
export function pluginNameOfSource(
  source: ContributionSource,
  plugins: readonly PluginState[],
): string | null {
  if (source.kind === 'builtin') {
    return null;
  }
  return plugins.find((plugin) => plugin.id === source.pluginId)?.name ?? source.pluginId;
}

/** Appends the plugin name to a contribution label; builtin labels pass through. */
export function contributionLabel(
  label: string,
  source: ContributionSource,
  plugins: readonly PluginState[],
  t: Translate,
): string {
  const pluginName = pluginNameOfSource(source, plugins);
  if (pluginName === null) {
    return label;
  }
  return t('plugins.optionSource', { label, plugin: pluginName });
}

/** Localised label plus source suffix for one field type entry. */
export function fieldTypeOptionLabel(
  entry: RegistryEntry<FieldTypeDef>,
  plugins: readonly PluginState[],
  t: Translate,
): string {
  if (entry.source.kind === 'builtin' && isBuiltinFieldTypeId(entry.id)) {
    return t(builtinFieldTypeKey(entry.id));
  }
  return contributionLabel(entry.def.label, entry.source, plugins, t);
}

/** Localised label plus source suffix for one importer entry. */
export function importerOptionLabel(
  entry: RegistryEntry<ImporterDef>,
  plugins: readonly PluginState[],
  t: Translate,
): string {
  return contributionLabel(entry.def.label, entry.source, plugins, t);
}

/** Localised label plus source suffix for one chart kind entry. */
export function chartKindOptionLabel(
  entry: RegistryEntry<ChartKindDef>,
  plugins: readonly PluginState[],
  t: Translate,
): string {
  if (entry.source.kind === 'builtin' && entry.id === entry.def.seriesType) {
    return t(`chart.kind.${entry.def.seriesType}` as MessageKey);
  }
  return contributionLabel(entry.def.label, entry.source, plugins, t);
}

/** Accessible name of the contributing plugin, for logs and toasts. */
export function pluginDisplayName(
  pluginId: string | null,
  plugins: readonly PluginState[],
  t: Translate,
): string {
  if (pluginId === null) {
    return t('plugins.sourceBuiltin');
  }
  return plugins.find((plugin) => plugin.id === pluginId)?.name ?? pluginId;
}
