import { describe, expect, it } from 'vitest';

import {
  MAX_STYLE_EXPORT_LENGTH,
  STYLE_EXPORT_KIND,
  STYLE_EXPORT_VERSION,
  createStyleExportDocument,
  parseStyleExportDocument,
  serializeStyleExportDocument,
} from './style-export';
import {
  DEFAULT_TABLE_STYLE,
  reassignStyleIdentity,
  resolveStyleName,
  styleCopyName,
} from './table-style';

import type { ConditionalRule, TableStyle } from './types';

function rule(id: string, columnId = 'col_a'): ConditionalRule {
  return {
    id,
    enabled: true,
    label: 'Hot',
    target: { kind: 'cell', columnId },
    when: {
      kind: 'all',
      children: [
        { kind: 'compare', columnId, op: 'gt', value: 30 },
        { kind: 'compare', columnId: 'col_b', op: 'contains', value: 'x' },
      ],
    },
    style: { background: '#fde2e2', bold: true, icon: 'warning' },
  };
}

function userStyle(): TableStyle {
  return {
    ...DEFAULT_TABLE_STYLE,
    id: 'sty_source',
    name: 'Report',
    builtin: false,
    columnOverrides: { col_a: { label: 'A', width: 120, align: 'right' } },
    conditionalRules: [rule('rule_1'), rule('rule_2', 'col_b')],
  };
}

describe('style export document', () => {
  it('wraps a detached snapshot with a deterministic timestamp', () => {
    const source = userStyle();
    const document = createStyleExportDocument(source, {
      now: new Date('2026-10-24T03:04:05.000Z'),
    });

    expect(document.kind).toBe(STYLE_EXPORT_KIND);
    expect(document.version).toBe(STYLE_EXPORT_VERSION);
    expect(document.exportedAt).toBe('2026-10-24T03:04:05.000Z');
    expect(document.style).toEqual(source);
    expect(document.style).not.toBe(source);
    expect(document.style.tokens.header).not.toBe(source.tokens.header);
    expect(document.style.conditionalRules[0]?.when).not.toBe(source.conditionalRules[0]?.when);
  });

  it('round-trips through the stable serializer', () => {
    const document = createStyleExportDocument(userStyle(), {
      now: new Date('2026-10-24T03:04:05.000Z'),
    });
    const text = serializeStyleExportDocument(document);

    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('"kind": "curve-table-style"');
    const parsed = parseStyleExportDocument(text);
    expect(parsed).toEqual({ ok: true, document });
  });

  it('exports builtin styles without mutating the frozen constant', () => {
    const before = JSON.stringify(DEFAULT_TABLE_STYLE);
    const document = createStyleExportDocument(DEFAULT_TABLE_STYLE, {
      now: new Date('2026-10-24T00:00:00.000Z'),
    });

    expect(document.style.id).toBe(DEFAULT_TABLE_STYLE.id);
    expect(document.style.builtin).toBe(true);
    document.style.tokens.header.background = '#000000';
    expect(JSON.stringify(DEFAULT_TABLE_STYLE)).toBe(before);
  });

  it('rejects oversized documents before parsing JSON', () => {
    const parsed = parseStyleExportDocument('x'.repeat(MAX_STYLE_EXPORT_LENGTH + 1));
    expect(parsed).toEqual({ ok: false, reason: 'tooLarge' });
  });

  it('reports JSON syntax errors separately', () => {
    expect(parseStyleExportDocument('{')).toEqual({ ok: false, reason: 'json' });
    expect(parseStyleExportDocument('')).toEqual({ ok: false, reason: 'json' });
  });

  it('reports future versions separately', () => {
    const parsed = parseStyleExportDocument(
      JSON.stringify({ kind: STYLE_EXPORT_KIND, version: 2, exportedAt: '2026-01-01T00:00:00Z' }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toBe('version');
      expect(parsed.detail).toContain('2');
    }
  });

  it('rejects wrong kind, missing fields and invalid styles as documents', () => {
    const base = {
      kind: STYLE_EXPORT_KIND,
      version: STYLE_EXPORT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      style: userStyle(),
    };
    expect(parseStyleExportDocument(JSON.stringify({ ...base, kind: 'other' }))).toMatchObject({
      ok: false,
      reason: 'document',
    });
    expect(
      parseStyleExportDocument(JSON.stringify({ ...base, exportedAt: 'yesterday' })),
    ).toMatchObject({ ok: false, reason: 'document' });
    expect(
      parseStyleExportDocument(
        JSON.stringify({
          ...base,
          style: { ...userStyle(), tokens: { ...userStyle().tokens, fontSize: 99 } },
        }),
      ),
    ).toMatchObject({ ok: false, reason: 'document' });
    expect(parseStyleExportDocument(JSON.stringify({ ...base, extra: true }))).toMatchObject({
      ok: false,
      reason: 'document',
    });
  });
});

describe('style identity reassignment', () => {
  it('assigns a new style id and fresh rule ids while preserving content', () => {
    const source = userStyle();
    let sequence = 0;
    const copy = reassignStyleIdentity(source, {
      name: 'Report (2)',
      uuid: () => `fixed${String(++sequence)}`,
    });

    expect(copy.id).toBe('sty_fixed1');
    expect(copy.name).toBe('Report (2)');
    expect(copy.builtin).toBe(false);
    expect(copy.tokens).toEqual(source.tokens);
    expect(copy.columnOverrides).toEqual(source.columnOverrides);
    expect(copy.conditionalRules.map((entry) => entry.id)).toEqual(['rule_fixed2', 'rule_fixed3']);
    expect(copy.conditionalRules[0]?.when).toEqual(source.conditionalRules[0]?.when);
    expect(copy.conditionalRules[0]?.when).not.toBe(source.conditionalRules[0]?.when);
    expect(source.id).toBe('sty_source');
    expect(source.conditionalRules.map((entry) => entry.id)).toEqual(['rule_1', 'rule_2']);
  });

  it('forks a builtin into a persisted identity', () => {
    const copy = reassignStyleIdentity(DEFAULT_TABLE_STYLE, {
      name: 'Copy',
      uuid: () => 'abc',
    });
    expect(copy.id).toBe('sty_abc');
    expect(copy.builtin).toBe(false);
    expect(copy.name).toBe('Copy');
    expect(DEFAULT_TABLE_STYLE.id).toBe('builtin.report-light');
  });

  it('keeps distinct rule ids when the uuid factory is sequential', () => {
    let sequence = 0;
    const copy = reassignStyleIdentity(userStyle(), { uuid: () => `same${String(++sequence)}` });
    expect(new Set(copy.conditionalRules.map((entry) => entry.id)).size).toBe(2);
  });
});

describe('style names', () => {
  it('always suffixes copy names and skips used numbers', () => {
    expect(styleCopyName('Sensors', [])).toBe('Sensors (2)');
    expect(styleCopyName('Sensors', ['Sensors (2)'])).toBe('Sensors (3)');
    expect(styleCopyName('Sensors (2)', ['Sensors (2)'])).toBe('Sensors (3)');
    expect(styleCopyName('  ', [])).toBe('Style (2)');
  });

  it('keeps the original name when free and suffixes on conflict', () => {
    expect(resolveStyleName('Sensors', ['Other'])).toBe('Sensors');
    expect(resolveStyleName('Sensors', ['Sensors'])).toBe('Sensors (2)');
    expect(resolveStyleName('Sensors', ['Sensors', 'Sensors (2)'])).toBe('Sensors (3)');
    expect(resolveStyleName('   ', [])).toBe('Style');
  });
});
