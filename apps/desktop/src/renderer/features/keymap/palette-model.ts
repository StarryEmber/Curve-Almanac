import type { CommandContext, CommandDisabledReason } from './command-context';
import type { AppCommand } from './commands';
import type { MessageKey } from '../../i18n';

/** One palette row: everything the component needs, already resolved for this context. */
export interface PaletteCommandItem {
  id: string;
  labelKey: MessageKey;
  shortcuts: readonly string[];
  /** null when the command can run right now. */
  reason: CommandDisabledReason | null;
  /** 0 = most recent; null when never used. */
  recentRank: number | null;
}

/**
 * Resolves `isEnabled` once per command and hides palette-internal entries.
 *
 * Disabled commands stay in the list so the user can see *why* something cannot
 * run instead of guessing why a command disappeared.
 */
export function buildPaletteItems(
  commands: readonly AppCommand[],
  context: CommandContext,
  recentIds: readonly string[],
): PaletteCommandItem[] {
  const rankById = new Map(recentIds.map((id, index) => [id, index]));
  const items: PaletteCommandItem[] = [];

  for (const command of commands) {
    if (!command.visibleInPalette) {
      continue;
    }
    const availability = command.isEnabled(context);
    items.push({
      id: command.id,
      labelKey: command.labelKey,
      shortcuts: command.shortcuts,
      reason: availability.enabled ? null : availability.reason,
      recentRank: rankById.get(command.id) ?? null,
    });
  }

  return items;
}
