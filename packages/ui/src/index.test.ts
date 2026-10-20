import { describe, expect, it } from 'vitest';

import * as ui from '@curve/ui';

/**
 * Public surface of the package. Component behaviour is covered by the
 * per-component suites; this keeps the barrel honest (no accidental removals,
 * and the stylesheets are imported through it).
 */
describe('@curve/ui public exports', () => {
  it('exposes the T0.4 component set', () => {
    expect(typeof ui.Button).toBe('function');
    expect(typeof ui.Dialog).toBe('function');
    expect(typeof ui.Input).toBe('function');
    expect(typeof ui.Menu).toBe('function');
    expect(typeof ui.Select).toBe('function');
    expect(typeof ui.Tabs).toBe('function');
    expect(typeof ui.ToastHost).toBe('function');
    expect(typeof ui.useToasts).toBe('function');
  });

  it('exposes the theme contract', () => {
    expect(ui.THEME_ATTRIBUTE).toBe('data-theme');
    expect(ui.THEME_STORAGE_KEY).toBe('curve-studio.theme');
    expect(ui.THEME_MODES).toEqual(['light', 'dark', 'system']);
  });
});
