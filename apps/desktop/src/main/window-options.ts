/**
 * BrowserWindow construction for the single app window.
 *
 * Every security-relevant `webPreferences` flag is set explicitly here (never
 * inherited from defaults) so a regression is visible in review and in the
 * unit test next to this file. SPEC §15.3 is the contract.
 */

import { APP_NAME } from '../shared/brand';

import { MIN_WINDOW_SIZE } from './window-state';

import type { Bounds } from './window-state';
import type { BrowserWindowConstructorOptions } from 'electron';

export interface WindowOptionsInput {
  /** Absolute path to the CJS preload bundle. */
  preloadPath: string;
  /** True only when running through `electron-vite dev` (renderer dev server). */
  isDev: boolean;
  bounds: Bounds;
}

export const WINDOW_TITLE = APP_NAME;

export function buildWindowOptions(input: WindowOptionsInput): BrowserWindowConstructorOptions {
  return {
    title: WINDOW_TITLE,
    x: input.bounds.x,
    y: input.bounds.y,
    width: input.bounds.width,
    height: input.bounds.height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: input.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: input.isDev,
      webviewTag: false,
      experimentalFeatures: false,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: false,
    },
  };
}
