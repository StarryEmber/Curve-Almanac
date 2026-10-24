import { describe, expect, it } from 'vitest';

import { DEFAULT_TABLE_STYLE, createStyleExportDocument } from '@curve/domain';
import type { ColumnDef, TableMeta, TableStyle } from '@curve/domain';

import { collectStyleColumnIds, missingStyleColumns, prepareStyleImport } from './style-import';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

const columns: ColumnDef[] = [
  { id: 'col_a', key: 'a', label: 'A', type: 'number', role: 'y' },
  { id: 'col_b', key: 'b', label: 'B', type: 'text', role: 'none' },
];

const table: TableMeta = {
  id: 'tbl_1',
  name: 'Readings',
  file: 'tables/tbl_1.jsonl',
  schemaVersion: 1,
  columns,
  primaryKey: 'col_a',
  rowCount: 0,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

function exportedStyle(): string {
  const style: TableStyle = {
    ...DEFAULT_TABLE_STYLE,
    id: 'sty_source',
    name: 'Report',
    builtin: false,
    columnOverrides: {
      col_a: { label: 'A', width: 120, align: 'right' },
      col_gone: { width: 90 },
    },
    conditionalRules: [
      {
        id: 'rule_1',
        enabled: true,
        label: 'Hot',
        target: { kind: 'row' as const },
        when: {
          kind: 'any' as const,
          children: [
            { kind: 'compare' as const, columnId: 'col_a', op: 'gt' as const, value: 30 },
            {
              kind: 'all' as const,
              children: [
                { kind: 'compare' as const, columnId: 'col_b', op: 'eq' as const, value: 'x' },
                {
                  kind: 'compare' as const,
                  columnId: 'col_gone',
                  op: 'notNull' as const,
                },
              ],
            },
          ],
        },
        style: { background: '#fde2e2', bold: true },
      },
      {
        id: 'rule_2',
        enabled: false,
        target: { kind: 'cell' as const, columnId: 'col_b' },
        when: { kind: 'compare' as const, columnId: 'col_b', op: 'contains' as const, value: 'x' },
        style: { italic: true },
      },
    ],
  };
  return JSON.stringify(
    createStyleExportDocument(style, { now: new Date('2026-10-24T00:00:00.000Z') }),
  );
}

describe('prepareStyleImport', () => {
  it('reassigns style and rule ids and keeps the name when free', () => {
    let sequence = 0;
    const result = prepareStyleImport(exportedStyle(), {
      existingNames: ['Other'],
      uuid: () => `id${String(++sequence)}`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.style.id).toBe('sty_id1');
    expect(result.style.builtin).toBe(false);
    expect(result.name).toBe('Report');
    expect(result.sourceName).toBe('Report');
    expect(result.renamed).toBe(false);
    expect(result.style.conditionalRules.map((entry) => entry.id)).toEqual([
      'rule_id2',
      'rule_id3',
    ]);
    expect(result.style.columnOverrides['col_gone']).toEqual({ width: 90 });
    expect(result.style.conditionalRules[0]?.when).toEqual({
      kind: 'any',
      children: [
        { kind: 'compare', columnId: 'col_a', op: 'gt', value: 30 },
        {
          kind: 'all',
          children: [
            { kind: 'compare', columnId: 'col_b', op: 'eq', value: 'x' },
            { kind: 'compare', columnId: 'col_gone', op: 'notNull' },
          ],
        },
      ],
    });
  });

  it('adds a copy suffix when the imported name is already in use', () => {
    const result = prepareStyleImport(exportedStyle(), {
      existingNames: ['Report', 'Report (2)'],
      uuid: () => 'copy',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name).toBe('Report (3)');
      expect(result.renamed).toBe(true);
      expect(result.style.name).toBe('Report (3)');
    }
  });

  it('turns an exported builtin into a user style', () => {
    const text = JSON.stringify(
      createStyleExportDocument(DEFAULT_TABLE_STYLE, {
        now: new Date('2026-10-24T00:00:00.000Z'),
      }),
    );
    const result = prepareStyleImport(text, {
      existingNames: [],
      uuid: () => 'builtin-copy',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.style.id).toBe('sty_builtin-copy');
      expect(result.style.builtin).toBe(false);
    }
  });

  it('reports structured failures without assigning anything', () => {
    expect(prepareStyleImport('{', { existingNames: [] })).toMatchObject({
      ok: false,
      reason: 'json',
    });
    expect(
      prepareStyleImport(
        JSON.stringify({ kind: 'curve-table-style', version: 9, exportedAt: TIMESTAMP }),
        { existingNames: [] },
      ),
    ).toMatchObject({ ok: false, reason: 'version' });
    expect(
      prepareStyleImport(JSON.stringify({ kind: 'other', version: 1 }), { existingNames: [] }),
    ).toMatchObject({ ok: false, reason: 'document' });
    expect(prepareStyleImport('x'.repeat(2_000_001), { existingNames: [] })).toMatchObject({
      ok: false,
      reason: 'tooLarge',
    });
  });
});

describe('style column references', () => {
  it('collects overrides, rule targets and nested predicate columns once', () => {
    const parsed = prepareStyleImport(exportedStyle(), {
      existingNames: [],
      uuid: () => 'ids',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(collectStyleColumnIds(parsed.style)).toEqual(['col_a', 'col_b', 'col_gone']);
    expect(missingStyleColumns(parsed.style, table)).toEqual(['col_gone']);
  });

  it('returns no missing columns when every reference exists', () => {
    const parsed = prepareStyleImport(exportedStyle(), {
      existingNames: [],
      uuid: () => 'ids',
    });
    if (!parsed.ok) {
      return;
    }
    const narrower = {
      ...parsed.style,
      columnOverrides: { col_a: { width: 100 } },
      conditionalRules: parsed.style.conditionalRules.slice(0, 1),
    };
    expect(missingStyleColumns({ ...narrower, columnOverrides: {} }, table)).toEqual(['col_gone']);
  });
});
