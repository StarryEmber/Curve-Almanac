import { describe, expect, it } from 'vitest';

import { buildWindowOptions, WINDOW_TITLE } from './window-options';
import { MIN_WINDOW_SIZE } from './window-state';

const BOUNDS = { x: 100, y: 50, width: 1440, height: 900 };
const PRELOAD = 'C:\\apps\\desktop\\out\\preload\\index.cjs';

const buildOptions = (isDev: boolean) =>
  buildWindowOptions({ preloadPath: PRELOAD, isDev, bounds: BOUNDS });

describe('buildWindowOptions', () => {
  it('keeps every non-negotiable security flag enabled', () => {
    const { webPreferences } = buildOptions(false);

    expect(webPreferences).toMatchObject({
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      experimentalFeatures: false,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
    });
  });

  it('enables DevTools only in development', () => {
    expect(buildOptions(true).webPreferences?.devTools).toBe(true);
    expect(buildOptions(false).webPreferences?.devTools).toBe(false);
  });

  it('applies the resolved bounds and minimum size', () => {
    const options = buildOptions(false);

    expect(options).toMatchObject({
      title: WINDOW_TITLE,
      x: BOUNDS.x,
      y: BOUNDS.y,
      width: BOUNDS.width,
      height: BOUNDS.height,
      minWidth: MIN_WINDOW_SIZE.width,
      minHeight: MIN_WINDOW_SIZE.height,
      show: false,
    });
  });

  it('never exposes a module-system entry to the renderer', () => {
    const { webPreferences } = buildOptions(false);

    expect(webPreferences).not.toHaveProperty('nodeIntegrationInWorker', true);
    expect(webPreferences).not.toHaveProperty('nodeIntegrationInSubFrames', true);
    expect(webPreferences?.nodeIntegration).toBe(false);
  });
});
