/**
 * Recently used commands for the palette (T5.4, ADR-049).
 *
 * This is a UI preference, not workspace data: it lives in localStorage next to
 * the theme and locale. A missing, corrupted or unavailable store degrades to
 * an empty list instead of blocking the palette.
 */

export const RECENT_COMMANDS_STORAGE_KEY = 'curve-studio.recent-commands';

export const MAX_RECENT_COMMANDS = 8;

export interface RecentCommandReader {
  getItem(key: string): string | null;
}

export interface RecentCommandWriter {
  setItem(key: string, value: string): void;
}

export function parseRecentCommandIds(raw: string | null): string[] {
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const result: string[] = [];
  for (const value of parsed) {
    if (typeof value !== 'string' || value.length === 0 || result.includes(value)) {
      continue;
    }
    result.push(value);
    if (result.length >= MAX_RECENT_COMMANDS) {
      break;
    }
  }
  return result;
}

export function readRecentCommandIds(storage: RecentCommandReader | undefined): string[] {
  if (storage === undefined) {
    return [];
  }
  try {
    return parseRecentCommandIds(storage.getItem(RECENT_COMMANDS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeRecentCommandIds(
  storage: RecentCommandWriter | undefined,
  ids: readonly string[],
): void {
  if (storage === undefined) {
    return;
  }
  try {
    storage.setItem(RECENT_COMMANDS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort preference; the palette still works without persistence.
  }
}

/** Moves a command to the front, removes duplicates and enforces the cap. */
export function updateRecentCommandIds(current: readonly string[], commandId: string): string[] {
  return [commandId, ...current.filter((id) => id !== commandId)].slice(0, MAX_RECENT_COMMANDS);
}
