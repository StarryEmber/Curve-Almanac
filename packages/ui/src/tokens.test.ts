import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { THEME_ATTRIBUTE } from './theme';

/**
 * Design-token contract (TASKS T0.4 steps 1–2, SPEC §16.3 contrast):
 *
 * - every `--cs-*` a component consumes is defined;
 * - the dark theme overrides every colour token;
 * - no component stylesheet hard-codes a colour;
 * - the text/background token pairs used by the shell meet WCAG AA.
 */

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

const tokensCss = read('./tokens.css');
const uiCss = read('./ui.css');

const ROOT_SELECTOR = /:root\s*\{/;
const DARK_SELECTOR = new RegExp(`:root\\[${THEME_ATTRIBUTE}=['"]?dark['"]?\\]\\s*\\{`);

function extractBlock(css: string, selector: RegExp): string {
  const match = selector.exec(css);
  if (!match || match.index === undefined) {
    throw new Error(`CSS block not found: ${String(selector)}`);
  }
  const open = css.indexOf('{', match.index);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    const char = css[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, index);
      }
    }
  }
  throw new Error(`Unbalanced CSS block: ${String(selector)}`);
}

function declarations(block: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /(--cs-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  for (const match of block.matchAll(pattern)) {
    const name = match[1];
    const value = match[2]?.trim();
    if (name !== undefined && value !== undefined) {
      result.set(name, value);
    }
  }
  return result;
}

const lightTokens = declarations(extractBlock(tokensCss, ROOT_SELECTOR));
const darkTokens = declarations(extractBlock(tokensCss, DARK_SELECTOR));

function tokenTheme(overrides: Map<string, string>): (name: string) => string {
  return (name) => overrides.get(name) ?? lightTokens.get(name) ?? '';
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) {
    throw new Error(`Expected a #rrggbb colour, received: ${color}`);
  }
  const hex = match[1] ?? '';
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('design tokens', () => {
  it('defines the full palette and layout scale', () => {
    expect(lightTokens.size).toBeGreaterThanOrEqual(55);

    for (const expected of [
      '--cs-color-bg-canvas',
      '--cs-color-bg-surface',
      '--cs-color-fg-default',
      '--cs-color-accent-default',
      '--cs-color-danger-default',
      '--cs-space-1',
      '--cs-radius-md',
      '--cs-font-sans',
      '--cs-shadow-1',
      '--cs-size-sidebar',
    ]) {
      expect(lightTokens.has(expected), `missing ${expected}`).toBe(true);
    }

    for (const [name, value] of lightTokens) {
      expect(value.length, `${name} has an empty value`).toBeGreaterThan(0);
    }
  });

  it('overrides every colour token in the dark theme', () => {
    const colourTokens = [...lightTokens.keys()].filter((name) => name.startsWith('--cs-color-'));

    expect(colourTokens.length).toBeGreaterThan(15);
    for (const name of colourTokens) {
      expect(darkTokens.has(name), `${name} is not themed for dark mode`).toBe(true);
    }
    for (const name of ['--cs-shadow-1', '--cs-shadow-2']) {
      expect(darkTokens.has(name), `${name} is not themed for dark mode`).toBe(true);
    }
  });

  it('only overrides tokens that exist in the light theme', () => {
    for (const name of darkTokens.keys()) {
      expect(lightTokens.has(name), `dark theme invents ${name}`).toBe(true);
    }
  });

  it('defines every token the components consume', () => {
    const used = new Set<string>();
    for (const match of uiCss.matchAll(/var\((--cs-[a-z0-9-]+)\)/g)) {
      const name = match[1];
      if (name !== undefined) {
        used.add(name);
      }
    }

    expect(used.size).toBeGreaterThan(20);
    for (const name of used) {
      expect(lightTokens.has(name), `ui.css uses undefined ${name}`).toBe(true);
    }
  });

  it('keeps colour literals out of component styles', () => {
    const literal = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/i;
    expect(literal.test(uiCss.replace(/\/\*[\s\S]*?\*\//g, ''))).toBe(false);
  });
});

describe('token contrast (WCAG 2.1 AA, SPEC §16.3)', () => {
  const textPairs: ReadonlyArray<readonly [string, string]> = [
    ['--cs-color-fg-default', '--cs-color-bg-surface'],
    ['--cs-color-fg-default', '--cs-color-bg-canvas'],
    ['--cs-color-fg-muted', '--cs-color-bg-surface'],
    ['--cs-color-fg-subtle', '--cs-color-bg-surface'],
    ['--cs-color-accent-fg', '--cs-color-accent-default'],
    ['--cs-color-danger-fg', '--cs-color-danger-soft'],
  ];

  const uiPairs: ReadonlyArray<readonly [string, string]> = [
    ['--cs-color-accent-default', '--cs-color-bg-surface'],
    ['--cs-color-focus-ring', '--cs-color-bg-surface'],
  ];

  for (const [foreground, background] of textPairs) {
    it(`keeps body text readable: ${foreground} on ${background}`, () => {
      for (const theme of [lightTokens, darkTokens]) {
        const resolve = tokenTheme(theme);
        expect(contrastRatio(resolve(foreground), resolve(background))).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  for (const [foreground, background] of uiPairs) {
    it(`keeps UI affordances visible: ${foreground} on ${background}`, () => {
      for (const theme of [lightTokens, darkTokens]) {
        const resolve = tokenTheme(theme);
        expect(contrastRatio(resolve(foreground), resolve(background))).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
