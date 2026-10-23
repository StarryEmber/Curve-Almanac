import { describe, expect, it } from 'vitest';

import { tableStyleColorSchema, tableStyleSchema } from './schemas';
import {
  BUILTIN_STYLE_IDS,
  DEFAULT_TABLE_STYLE,
  DEFAULT_TABLE_STYLE_ID,
  DEFAULT_TABLE_STYLE_TOKENS,
  createTableStyle,
  forkTableStyle,
  getBuiltinStyle,
  isBuiltinStyleId,
  isResolvableStyleId,
  listBuiltinStyles,
  resolveStyle,
  unresolvedStyleWarning,
} from './table-style';

import type { ConditionalRule, TableStyle } from './types';

function makeRule(id = 'rule_1'): ConditionalRule {
  return {
    id,
    enabled: true,
    target: { kind: 'cell', columnId: 'col_a' },
    when: {
      kind: 'all',
      children: [
        { kind: 'compare', columnId: 'col_a', op: 'gt', value: 30 },
        { kind: 'compare', columnId: 'col_b', op: 'eq', value: 'x' },
      ],
    },
    style: { background: '#fde2e2', bold: true },
  };
}

function makeStyle(): TableStyle {
  return {
    id: 'sty_1',
    name: 'Style',
    builtin: false,
    tokens: {
      ...DEFAULT_TABLE_STYLE_TOKENS,
      header: { ...DEFAULT_TABLE_STYLE_TOKENS.header },
      body: { ...DEFAULT_TABLE_STYLE_TOKENS.body },
      selection: { ...DEFAULT_TABLE_STYLE_TOKENS.selection },
    },
    columnOverrides: {},
    conditionalRules: [],
  };
}

function parseHex(value: string): [number, number, number] {
  const raw = value.slice(1);
  const expanded =
    raw.length === 3 || raw.length === 4
      ? raw
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : raw;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const [red, green, blue] = parseHex(color);
  return 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue);
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('built-in table styles', () => {
  it('exposes four stable ids and the report-light default', () => {
    expect(BUILTIN_STYLE_IDS).toEqual([
      'builtin.report-light',
      'builtin.compact-light',
      'builtin.dark',
      'builtin.finance',
    ]);
    expect(DEFAULT_TABLE_STYLE_ID).toBe('builtin.report-light');
    expect(listBuiltinStyles()).toHaveLength(4);
    expect(new Set(listBuiltinStyles().map((style) => style.id))).toEqual(
      new Set(BUILTIN_STYLE_IDS),
    );
    expect(DEFAULT_TABLE_STYLE.id).toBe(DEFAULT_TABLE_STYLE_ID);
  });

  it('validates every builtin against the TableStyle schema', () => {
    for (const style of listBuiltinStyles()) {
      const result = tableStyleSchema.safeParse(style);
      expect(result.success, style.id).toBe(true);
      expect(style.builtin).toBe(true);
    }
  });

  it('freezes templates and every nested token object', () => {
    for (const style of listBuiltinStyles()) {
      expect(Object.isFrozen(style), style.id).toBe(true);
      expect(Object.isFrozen(style.tokens), style.id).toBe(true);
      expect(Object.isFrozen(style.tokens.header), style.id).toBe(true);
      expect(Object.isFrozen(style.tokens.body), style.id).toBe(true);
      expect(Object.isFrozen(style.tokens.selection), style.id).toBe(true);
      expect(Object.isFrozen(style.columnOverrides), style.id).toBe(true);
      expect(Object.isFrozen(style.conditionalRules), style.id).toBe(true);
    }
    expect(Object.isFrozen(DEFAULT_TABLE_STYLE_TOKENS)).toBe(true);
  });

  it('keeps the four templates visually distinct', () => {
    const byId = new Map(listBuiltinStyles().map((style) => [style.id, style]));
    const report = byId.get('builtin.report-light');
    const compact = byId.get('builtin.compact-light');
    const dark = byId.get('builtin.dark');
    const finance = byId.get('builtin.finance');

    expect(report?.tokens.density).toBe('normal');
    expect(report?.tokens.cellPaddingY).toBe(7);
    expect(compact?.tokens.density).toBe('compact');
    expect(compact?.tokens.cellPaddingY).toBe(4);
    expect(compact?.tokens.body.grid).toBe('horizontal');
    expect(dark?.tokens.body.background).toBe('#1e1e1e');
    expect(dark?.tokens.body.foreground).toBe('#d4d4d4');
    expect(finance?.tokens.zebra).toBe(true);
    expect(finance?.tokens.fontFamily).toContain('monospace');

    const signatures = new Set(listBuiltinStyles().map((style) => JSON.stringify(style.tokens)));
    expect(signatures.size).toBe(4);
  });

  it('keeps header, body and selection text pairs at WCAG AA contrast', () => {
    for (const style of listBuiltinStyles()) {
      const { header, body, selection } = style.tokens;
      expect(contrastRatio(header.background, header.foreground), style.id).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(body.background, body.foreground), style.id).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(body.alternateBackground, body.foreground),
        style.id,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(selection.background, selection.foreground),
        style.id,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('resolves ids and recognises only the four builtins', () => {
    expect(getBuiltinStyle('builtin.dark')).toBe(listBuiltinStyles()[2]);
    expect(getBuiltinStyle('builtin.missing')).toBeUndefined();
    expect(isBuiltinStyleId('builtin.dark')).toBe(true);
    expect(isBuiltinStyleId('builtin.unknown')).toBe(false);
    expect(isBuiltinStyleId('sty_1')).toBe(false);
  });
});

describe('resolveStyle', () => {
  it('returns builtins and user styles without fallback', () => {
    const builtin = resolveStyle('builtin.dark');
    expect(builtin.style).toBe(getBuiltinStyle('builtin.dark'));
    expect(builtin.fallback).toBe(false);
    expect(builtin.warning).toBeUndefined();

    const user = createTableStyle({ id: 'sty_user', name: 'User' });
    const resolved = resolveStyle('sty_user', [user]);
    expect(resolved.style).toBe(user);
    expect(resolved.fallback).toBe(false);
    expect(resolved.warning).toBeUndefined();
  });

  it('falls back to report-light with a warning for unknown ids', () => {
    for (const id of ['builtin.unknown', 'sty_missing']) {
      const resolved = resolveStyle(id);
      expect(resolved.style).toBe(DEFAULT_TABLE_STYLE);
      expect(resolved.fallback).toBe(true);
      expect(resolved.warning).toBe(unresolvedStyleWarning(id));
    }
  });

  it('ignores persisted builtin copies and reports resolvability', () => {
    const fake = createTableStyle({ id: 'sty_fake', name: 'Fake' });
    fake.builtin = true;
    expect(resolveStyle('sty_fake', [fake]).fallback).toBe(true);
    expect(isResolvableStyleId('builtin.dark', new Set())).toBe(true);
    expect(isResolvableStyleId('builtin.sneaky', new Set(['builtin.sneaky']))).toBe(false);
    expect(isResolvableStyleId('sty_user', new Set(['sty_user']))).toBe(true);
    expect(isResolvableStyleId('sty_missing', new Set())).toBe(false);
  });
});

describe('forkTableStyle', () => {
  it('forks a builtin into a detached user style', () => {
    const source = getBuiltinStyle('builtin.dark');
    expect(source).toBeDefined();
    const fork = forkTableStyle(source!, { uuid: () => 'forked' });

    expect(fork.id).toBe('sty_forked');
    expect(fork.builtin).toBe(false);
    expect(fork.name).toBe('深色 (2)');
    expect(fork.tokens).toEqual(source?.tokens);
    expect(fork.tokens).not.toBe(source?.tokens);
    expect(fork.tokens.header).not.toBe(source?.tokens.header);

    fork.tokens.header.background = '#000000';
    expect(source?.tokens.header.background).toBe('#252526');
  });

  it('deep-copies overrides and nested conditional predicates', () => {
    const source = createTableStyle({
      id: 'sty_source',
      name: 'Source',
      columnOverrides: {
        col_a: { align: 'right', numberFormat: { style: 'currency', digits: 2, currency: 'CNY' } },
      },
      conditionalRules: [makeRule()],
    });
    const fork = forkTableStyle(source, { uuid: () => 'copy', name: 'Copy' });

    expect(fork.name).toBe('Copy');
    expect(fork.columnOverrides).not.toBe(source.columnOverrides);
    expect(fork.columnOverrides['col_a']).not.toBe(source.columnOverrides['col_a']);
    expect(fork.columnOverrides['col_a']?.numberFormat).not.toBe(
      source.columnOverrides['col_a']?.numberFormat,
    );
    expect(fork.conditionalRules[0]?.when).not.toBe(source.conditionalRules[0]?.when);

    fork.columnOverrides['col_a']!.numberFormat!.digits = 4;
    const rule = fork.conditionalRules[0]!;
    if (rule.when.kind === 'all') {
      rule.when.children.push({ kind: 'compare', columnId: 'col_c', op: 'lt', value: 0 });
    }

    expect(source.columnOverrides['col_a']?.numberFormat?.digits).toBe(2);
    expect(source.conditionalRules[0]?.when).toMatchObject({
      kind: 'all',
      children: [{ value: 30 }, { value: 'x' }],
    });
    expect(
      source.conditionalRules[0]?.when.kind === 'all'
        ? source.conditionalRules[0]?.when.children.length
        : 0,
    ).toBe(2);
  });
});

describe('createTableStyle', () => {
  it('creates a user style from the default tokens with an injected id', () => {
    const style = createTableStyle({ name: 'My style', uuid: () => 'new' });

    expect(style.id).toBe('sty_new');
    expect(style.name).toBe('My style');
    expect(style.builtin).toBe(false);
    expect(style.tokens).toEqual(DEFAULT_TABLE_STYLE_TOKENS);
    expect(style.tokens).not.toBe(DEFAULT_TABLE_STYLE_TOKENS);
    expect(style.columnOverrides).toEqual({});
    expect(style.conditionalRules).toEqual([]);

    style.tokens.fontSize = 14;
    expect(DEFAULT_TABLE_STYLE_TOKENS.fontSize).toBe(13);
  });

  it('deep-copies caller-provided tokens, overrides and rules', () => {
    const tokens = {
      ...DEFAULT_TABLE_STYLE_TOKENS,
      header: { ...DEFAULT_TABLE_STYLE_TOKENS.header },
    };
    const rule = makeRule();
    const style = createTableStyle({
      id: 'sty_x',
      name: 'X',
      tokens,
      columnOverrides: { col_a: { align: 'right' } },
      conditionalRules: [rule],
    });

    style.tokens.header.background = '#000000';
    style.columnOverrides['col_a']!.align = 'left';
    style.conditionalRules[0]!.style.bold = false;

    expect(tokens.header.background).not.toBe('#000000');
    expect(rule.style.bold).toBe(true);
  });
});

describe('table style schema', () => {
  it('accepts every supported hex color form', () => {
    for (const color of ['#fff', '#ffff', '#ffffff', '#ffffffff', '#AbCdEf']) {
      expect(tableStyleColorSchema.safeParse(color).success, color).toBe(true);
    }
  });

  it('rejects non-hex colors', () => {
    for (const color of ['red', 'rgb(0,0,0)', '#12', '#12345', '#ggg', '']) {
      expect(tableStyleColorSchema.safeParse(color).success, color).toBe(false);
    }
  });

  it('accepts a valid style and rejects out-of-range values', () => {
    expect(tableStyleSchema.safeParse(makeStyle()).success).toBe(true);

    const fontSize = makeStyle();
    fontSize.tokens.fontSize = 10;
    expect(tableStyleSchema.safeParse(fontSize).success).toBe(false);

    const radius = makeStyle();
    radius.tokens.radius = 13;
    expect(tableStyleSchema.safeParse(radius).success).toBe(false);

    const paddingX = makeStyle();
    paddingX.tokens.cellPaddingX = 3;
    expect(tableStyleSchema.safeParse(paddingX).success).toBe(false);

    const paddingY = makeStyle();
    paddingY.tokens.cellPaddingY = 17;
    expect(tableStyleSchema.safeParse(paddingY).success).toBe(false);

    const width = makeStyle();
    width.columnOverrides['col_a'] = { width: 79 };
    expect(tableStyleSchema.safeParse(width).success).toBe(false);

    const digits = makeStyle();
    digits.columnOverrides['col_a'] = {
      numberFormat: { style: 'decimal', digits: 11 },
    };
    expect(tableStyleSchema.safeParse(digits).success).toBe(false);
  });

  it('rejects invalid colors in tokens and conditional rules', () => {
    const tokenColor = makeStyle();
    tokenColor.tokens.header.background = 'red';
    expect(tableStyleSchema.safeParse(tokenColor).success).toBe(false);

    const ruleColor = makeStyle();
    ruleColor.conditionalRules = [{ ...makeRule(), style: { background: 'tomato' } }];
    expect(tableStyleSchema.safeParse(ruleColor).success).toBe(false);
  });

  it('enforces the 50-rule ceiling', () => {
    const fifty = makeStyle();
    fifty.conditionalRules = Array.from({ length: 50 }, (_, index) => makeRule(`rule_${index}`));
    expect(tableStyleSchema.safeParse(fifty).success).toBe(true);

    const fiftyOne = makeStyle();
    fiftyOne.conditionalRules = Array.from({ length: 51 }, (_, index) => makeRule(`rule_${index}`));
    expect(tableStyleSchema.safeParse(fiftyOne).success).toBe(false);
  });
});
