/**
 * Global keymap (T5.4, ADR-049).
 *
 * The registry owns *application* shortcuts only. Local components keep their
 * keyboard contracts: the window listener runs in the bubble phase, skips
 * events that were already consumed, and ignores editable/dialog targets. That
 * is what keeps Ctrl/Cmd+C/V, F2, Enter/Tab/Esc and arrow-key navigation native.
 */

import { isScopeActive, scopesOverlap } from './command-context';
import { matchesShortcut, parseShortcut, shortcutSignature } from './shortcut';

import type {
  CommandAvailability,
  CommandDisabledReason,
  CommandScope,
  CommandContext,
} from './command-context';
import type { ParsedShortcut, ShortcutEvent } from './shortcut';

export type {
  CommandAvailability,
  CommandDisabledReason,
  CommandScope,
  CommandContext,
} from './command-context';

export interface KeymapCommand {
  id: string;
  shortcuts: readonly string[];
  scopes: readonly CommandScope[];
  isEnabled(context: CommandContext): CommandAvailability;
  run(context: CommandContext): void;
}

export interface KeymapEvent extends ShortcutEvent {
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target?: EventTarget | null;
  preventDefault(): void;
}

export type KeymapResult =
  | { status: 'ignored' }
  | { status: 'disabled'; commandId: string; reason: CommandDisabledReason }
  | { status: 'handled'; commandId: string };

export interface ShortcutConflict {
  /** Raw declaration that collided, e.g. `Ctrl/Cmd+K`. */
  shortcut: string;
  /** Normalized identity (Ctrl and Cmd are the same primary modifier). */
  signature: string;
  firstId: string;
  secondId: string;
}

export class KeymapConflictError extends Error {
  readonly conflicts: readonly ShortcutConflict[];

  constructor(conflicts: readonly ShortcutConflict[]) {
    const summary = conflicts
      .map((conflict) => `${conflict.shortcut} (${conflict.firstId} / ${conflict.secondId})`)
      .join(', ');
    super(`Conflicting keyboard shortcuts: ${summary}`);
    this.name = 'KeymapConflictError';
    this.conflicts = conflicts;
  }
}

export class KeymapShortcutError extends Error {
  constructor(commandId: string, value: string) {
    super(`Invalid shortcut "${value}" on command "${commandId}"`);
    this.name = 'KeymapShortcutError';
  }
}

interface ParsedBinding {
  raw: string;
  parsed: ParsedShortcut;
}

function parseCommandShortcuts(command: KeymapCommand): ParsedBinding[] {
  return command.shortcuts.map((raw) => {
    const parsed = parseShortcut(raw);
    if (parsed === null) {
      throw new KeymapShortcutError(command.id, raw);
    }
    return { raw, parsed };
  });
}

/** Returns every shortcut shared by two commands whose scopes could overlap. */
export function findShortcutConflicts(commands: readonly KeymapCommand[]): ShortcutConflict[] {
  const bindings = commands.map((command) => ({
    command,
    shortcuts: parseCommandShortcuts(command),
  }));
  const conflicts: ShortcutConflict[] = [];

  for (let first = 0; first < bindings.length; first += 1) {
    const left = bindings[first];
    if (left === undefined) {
      continue;
    }
    for (let second = first + 1; second < bindings.length; second += 1) {
      const right = bindings[second];
      if (right === undefined || !scopesOverlap(left.command.scopes, right.command.scopes)) {
        continue;
      }
      for (const leftBinding of left.shortcuts) {
        for (const rightBinding of right.shortcuts) {
          if (shortcutSignature(leftBinding.parsed) !== shortcutSignature(rightBinding.parsed)) {
            continue;
          }
          conflicts.push({
            shortcut: leftBinding.raw,
            signature: shortcutSignature(leftBinding.parsed),
            firstId: left.command.id,
            secondId: right.command.id,
          });
        }
      }
    }
  }

  return conflicts;
}

export interface Keymap {
  readonly commands: readonly KeymapCommand[];
  readonly conflicts: readonly ShortcutConflict[];
  handleKeyDown(event: KeymapEvent, context: CommandContext): KeymapResult;
}

/**
 * True for focus targets where the application must not steal modified keys.
 *
 * `[role="dialog"]` has to be checked via `closest` because its children are
 * ordinary buttons; Modal dialogs own Escape/Tab and the grid must keep native
 * clipboard behaviour inside the cell editor.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return (
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]',
    ) !== null
  );
}

/**
 * Builds a validated keymap. A conflict is a programming error: making the app
 * fail at startup is preferable to silently letting registration order decide
 * what a shortcut does.
 */
export function createKeymap(commands: readonly KeymapCommand[]): Keymap {
  const parsed = commands.map((command) => ({
    command,
    shortcuts: parseCommandShortcuts(command),
  }));
  const conflicts = findShortcutConflicts(commands);
  if (conflicts.length > 0) {
    throw new KeymapConflictError(conflicts);
  }

  return {
    commands,
    conflicts,
    handleKeyDown(event: KeymapEvent, context: CommandContext): KeymapResult {
      if (
        event.defaultPrevented === true ||
        event.repeat === true ||
        event.isComposing === true ||
        isEditableTarget(event.target ?? null)
      ) {
        return { status: 'ignored' };
      }

      for (const entry of parsed) {
        if (!entry.command.scopes.some((scope) => isScopeActive(scope, context))) {
          continue;
        }
        const binding = entry.shortcuts.find((candidate) =>
          matchesShortcut(event, candidate.parsed),
        );
        if (binding === undefined) {
          continue;
        }

        const availability = entry.command.isEnabled(context);
        if (!availability.enabled) {
          return {
            status: 'disabled',
            commandId: entry.command.id,
            reason: availability.reason,
          };
        }

        event.preventDefault();
        entry.command.run(context);
        return { status: 'handled', commandId: entry.command.id };
      }

      return { status: 'ignored' };
    },
  };
}
