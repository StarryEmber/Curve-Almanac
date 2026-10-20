/**
 * Window geometry persistence (T0.2).
 *
 * The state file lives in `app.getPath('userData')`, never in the workspace.
 * Restoring is deliberately conservative: if the saved position no longer
 * overlaps a connected display the window falls back to the default size,
 * centered on the primary display.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  bounds: Bounds;
  maximized: boolean;
}

export const WINDOW_STATE_FILE = 'window-state.json';

export const DEFAULT_WINDOW_SIZE = { width: 1440, height: 900 } as const;

export const MIN_WINDOW_SIZE = { width: 1024, height: 700 } as const;

/** Minimum overlap (px) on both axes before saved coordinates are trusted. */
export const MIN_VISIBLE_OVERLAP = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBounds(value: unknown): value is Bounds {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    isFiniteNumber(value['width']) &&
    isFiniteNumber(value['height']) &&
    value['width'] > 0 &&
    value['height'] > 0
  );
}

export function isWindowState(value: unknown): value is WindowState {
  return isRecord(value) && typeof value['maximized'] === 'boolean' && isBounds(value['bounds']);
}

/** Parses a state file body; malformed JSON or shapes yield `null`. */
export function parseWindowState(raw: string): WindowState | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isWindowState(value) ? value : null;
}

export function loadWindowState(filePath: string): WindowState | null {
  try {
    return parseWindowState(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Persists the state atomically. Failure must never block app shutdown. */
export function saveWindowState(filePath: string, state: WindowState): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(state)}\n`, 'utf8');
    renameSync(temporaryPath, filePath);
  } catch {
    // Best effort: window geometry is not worth failing a quit over.
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function centeredBounds(workArea: Bounds, size: { width: number; height: number }): Bounds {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}

function findVisibleWorkArea(bounds: Bounds, workAreas: readonly Bounds[]): Bounds | null {
  let best: Bounds | null = null;
  let bestOverlap = 0;

  for (const workArea of workAreas) {
    const overlapWidth =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const overlapHeight =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);
    if (overlapWidth < MIN_VISIBLE_OVERLAP || overlapHeight < MIN_VISIBLE_OVERLAP) {
      continue;
    }
    const overlap = overlapWidth * overlapHeight;
    if (overlap > bestOverlap) {
      best = workArea;
      bestOverlap = overlap;
    }
  }

  return best;
}

/**
 * Resolves the bounds to create the window with.
 *
 * @param saved state read from disk, or `null` on first run / corrupted state.
 * @param workAreas display work areas from `screen.getAllDisplays()`, primary first.
 */
export function resolveWindowState(
  saved: WindowState | null,
  workAreas: readonly Bounds[],
): WindowState {
  const primary = workAreas[0];
  if (!primary) {
    return { bounds: { x: 0, y: 0, ...DEFAULT_WINDOW_SIZE }, maximized: false };
  }

  if (!saved) {
    return { bounds: centeredBounds(primary, DEFAULT_WINDOW_SIZE), maximized: false };
  }

  const workArea = findVisibleWorkArea(saved.bounds, workAreas);
  if (!workArea) {
    return { bounds: centeredBounds(primary, DEFAULT_WINDOW_SIZE), maximized: false };
  }

  const width = clamp(
    saved.bounds.width,
    Math.min(MIN_WINDOW_SIZE.width, workArea.width),
    workArea.width,
  );
  const height = clamp(
    saved.bounds.height,
    Math.min(MIN_WINDOW_SIZE.height, workArea.height),
    workArea.height,
  );
  return {
    bounds: {
      x: clamp(saved.bounds.x, workArea.x, workArea.x + workArea.width - width),
      y: clamp(saved.bounds.y, workArea.y, workArea.y + workArea.height - height),
      width,
      height,
    },
    maximized: saved.maximized,
  };
}

export interface CaptureWindowStateInput {
  maximized: boolean;
  bounds: Bounds;
  normalBounds: Bounds;
}

/** Captures restore-ready bounds: a maximized window keeps its normal bounds. */
export function captureWindowState(input: CaptureWindowStateInput): WindowState {
  return {
    bounds: input.maximized ? input.normalBounds : input.bounds,
    maximized: input.maximized,
  };
}
