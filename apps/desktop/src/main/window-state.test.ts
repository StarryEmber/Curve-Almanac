import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  captureWindowState,
  DEFAULT_WINDOW_SIZE,
  loadWindowState,
  MIN_WINDOW_SIZE,
  parseWindowState,
  resolveWindowState,
  saveWindowState,
  WINDOW_STATE_FILE,
} from './window-state';

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 };
const SECONDARY = { x: 1920, y: 0, width: 1920, height: 1040 };

const tempDirs: string[] = [];

function createTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'curve-window-state-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('parseWindowState', () => {
  it('accepts a well-formed state', () => {
    const state = { bounds: { x: 10, y: 20, width: 1200, height: 800 }, maximized: true };

    expect(parseWindowState(JSON.stringify(state))).toEqual(state);
  });

  it('rejects malformed JSON and unexpected shapes', () => {
    expect(parseWindowState('{')).toBeNull();
    expect(parseWindowState('null')).toBeNull();
    expect(parseWindowState('[]')).toBeNull();
    expect(parseWindowState(JSON.stringify({ bounds: PRIMARY }))).toBeNull();
    expect(
      parseWindowState(
        JSON.stringify({ bounds: { x: 0, y: 0, width: 0, height: 800 }, maximized: false }),
      ),
    ).toBeNull();
    expect(
      parseWindowState(
        JSON.stringify({ bounds: { x: '0', y: 0, width: 800, height: 600 }, maximized: false }),
      ),
    ).toBeNull();
  });
});

describe('loadWindowState / saveWindowState', () => {
  it('returns null when the file does not exist or is corrupted', () => {
    const directory = createTempDir();
    const file = join(directory, WINDOW_STATE_FILE);

    expect(loadWindowState(file)).toBeNull();

    writeFileSync(file, 'not json', 'utf8');
    expect(loadWindowState(file)).toBeNull();
  });

  it('round-trips a state through disk without leaving a temp file behind', () => {
    const directory = createTempDir();
    const file = join(directory, 'nested', WINDOW_STATE_FILE);
    const state = { bounds: { x: 100, y: 50, width: 1280, height: 800 }, maximized: false };

    saveWindowState(file, state);

    expect(loadWindowState(file)).toEqual(state);
    expect(loadWindowState(`${file}.tmp`)).toBeNull();
  });
});

describe('resolveWindowState', () => {
  it('centers the default size on the primary display on first run', () => {
    expect(resolveWindowState(null, [PRIMARY])).toEqual({
      bounds: { x: 240, y: 70, width: 1440, height: 900 },
      maximized: false,
    });
  });

  it('fits the default size into a smaller primary display', () => {
    const workArea = { x: 0, y: 0, width: 1280, height: 720 };

    expect(resolveWindowState(null, [workArea])).toEqual({
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      maximized: false,
    });
  });

  it('keeps a saved position that is still on screen', () => {
    const saved = { bounds: { x: 300, y: 200, width: 1100, height: 760 }, maximized: false };

    expect(resolveWindowState(saved, [PRIMARY])).toEqual(saved);
  });

  it('restores a window saved on a secondary display', () => {
    const saved = { bounds: { x: 2000, y: 100, width: 1200, height: 800 }, maximized: true };

    expect(resolveWindowState(saved, [PRIMARY, SECONDARY])).toEqual(saved);
  });

  it('falls back to the default layout when the saved position is off screen', () => {
    const saved = { bounds: { x: 5000, y: 5000, width: 1200, height: 800 }, maximized: true };

    expect(resolveWindowState(saved, [PRIMARY])).toEqual({
      bounds: {
        x: 240,
        y: 70,
        width: DEFAULT_WINDOW_SIZE.width,
        height: DEFAULT_WINDOW_SIZE.height,
      },
      maximized: false,
    });
  });

  it('falls back when less than the minimum overlap is visible', () => {
    const saved = { bounds: { x: 1900, y: 500, width: 1200, height: 800 }, maximized: false };

    expect(resolveWindowState(saved, [PRIMARY]).bounds).toEqual({
      x: 240,
      y: 70,
      width: DEFAULT_WINDOW_SIZE.width,
      height: DEFAULT_WINDOW_SIZE.height,
    });
  });

  it('raises a too-small saved size to the minimum window size', () => {
    const saved = { bounds: { x: 0, y: 0, width: 800, height: 600 }, maximized: false };

    expect(resolveWindowState(saved, [PRIMARY]).bounds).toEqual({
      x: 0,
      y: 0,
      width: MIN_WINDOW_SIZE.width,
      height: MIN_WINDOW_SIZE.height,
    });
  });

  it('shrinks and clamps a saved size larger than the display', () => {
    const saved = { bounds: { x: -100, y: -100, width: 4000, height: 3000 }, maximized: false };

    expect(resolveWindowState(saved, [PRIMARY]).bounds).toEqual({
      x: 0,
      y: 0,
      width: PRIMARY.width,
      height: PRIMARY.height,
    });
  });

  it('falls back to bare defaults when no display is reported', () => {
    const saved = { bounds: { x: 10, y: 10, width: 1200, height: 800 }, maximized: true };

    expect(resolveWindowState(saved, [])).toEqual({
      bounds: { x: 0, y: 0, width: DEFAULT_WINDOW_SIZE.width, height: DEFAULT_WINDOW_SIZE.height },
      maximized: false,
    });
  });
});

describe('captureWindowState', () => {
  const bounds = { x: 10, y: 20, width: 1200, height: 800 };
  const normalBounds = { x: 100, y: 100, width: 1200, height: 800 };

  it('saves the current bounds for a normal window', () => {
    expect(captureWindowState({ maximized: false, bounds, normalBounds })).toEqual({
      bounds,
      maximized: false,
    });
  });

  it('saves the normal bounds for a maximized window so restore works', () => {
    expect(captureWindowState({ maximized: true, bounds, normalBounds })).toEqual({
      bounds: normalBounds,
      maximized: true,
    });
  });
});
