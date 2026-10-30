import type { CommandContext, CommandDisabledReason } from './command-context';
import type { AppCommand } from './commands';
import type { MessageKey } from '../../i18n';

/** One palette row: everything the component needs, already resolved for this context. */
export interface PaletteCommandItem {
  id: string;
  /** Builtin app command: label resolved from the message table at render time. */
  labelKey?: MessageKey;
  /** Plugin command: the plugin-provided label (plugin copy is not localised). */
  label?: string;
  /** Plugin command: already-localised `(plugin: name)` source suffix. */
  sourceLabel?: string;
  shortcuts: readonly string[];
  /** null when the command can run right now. */
  reason: CommandDisabledReason | null;
  /** 0 = most recent; null when never used. */
  recentRank: number | null;
  /** `true` for plugin contributions, so the palette can badge the source. */
  fromPlugin: boolean;
}

/** A plugin command contribution, resolved by the caller (T6.3). */
export interface PalettePluginCommand {
  readonly id: string;
  readonly label: string;
  readonly sourceLabel: string;
}

/**
 * Resolves `isEnabled` once per command and hides palette-internal entries.
 *
 * Disabled commands stay in the list so the user can see *why* something cannot
 * run instead of guessing why a command disappeared. Plugin commands follow the
 * builtin entries; they have no shortcut or availability rule in v1, and their
 * label is the plugin-provided string (with a source suffix, T6.3).
 */
export function buildPaletteItems(
  commands: readonly AppCommand[],
  context: CommandContext,
  recentIds: readonly string[],
  pluginCommands: readonly PalettePluginCommand[] = [],
): PaletteCommandItem[] {
  const rankById = new Map(recentIds.map((id, index) => [id, index]));
  const items: PaletteCommandItem[] = [];
  const known = new Set<string>();

  for (const command of commands) {
    if (!command.visibleInPalette) {
      continue;
    }
    known.add(command.id);
    const availability = command.isEnabled(context);
    items.push({
      id: command.id,
      labelKey: command.labelKey,
      shortcuts: command.shortcuts,
      reason: availability.enabled ? null : availability.reason,
      recentRank: rankById.get(command.id) ?? null,
      fromPlugin: false,
    });
  }

  for (const command of pluginCommands) {
    if (known.has(command.id)) {
      // A plugin cannot shadow a builtin command id; the builtin wins.
      continue;
    }
    known.add(command.id);
    items.push({
      id: command.id,
      label: command.label,
      sourceLabel: command.sourceLabel,
      shortcuts: [],
      reason: null,
      recentRank: rankById.get(command.id) ?? null,
      fromPlugin: true,
    });
  }

  return items;
}
