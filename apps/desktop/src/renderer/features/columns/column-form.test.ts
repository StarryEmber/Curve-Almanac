import { describe, expect, it } from 'vitest';

import type { ColumnDef } from '@curve/domain';

import {
  draftFromColumn,
  isDestructiveColumnChange,
  keyFromLabel,
  newColumnDraft,
  uniqueColumnKey,
} from './column-form';

function column(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: 'col_value',
    key: 'value',
    label: 'Value',
    type: 'number',
    role: 'y',
    precision: 2,
    unit: '°C',
    ...overrides,
  };
}

describe('column form helpers', () => {
  it('copies an existing column into form state', () => {
    const draft = draftFromColumn(
      column({
        required: true,
        enumOptions: [{ value: 'a', label: 'A' }],
        type: 'enum',
      }),
    );

    expect(draft).toEqual({
      label: 'Value',
      key: 'value',
      type: 'enum',
      role: 'y',
      precision: 2,
      unit: '°C',
      required: true,
      enumOptions: [{ value: 'a', label: 'A' }],
      // T6.2: "explicitly no semantic type" so clearing it in the form sticks.
      fieldTypeId: null,
    });
  });

  it('keeps a semantic field type when copying a column', () => {
    expect(draftFromColumn(column({ fieldTypeId: 'com.curvealmanac.rating' })).fieldTypeId).toBe(
      'com.curvealmanac.rating',
    );
    expect(newColumnDraft({ columns: [] }).fieldTypeId).toBeNull();
  });

  it('builds a unique default key for a new column', () => {
    expect(uniqueColumnKey('column', [])).toBe('column');
    expect(uniqueColumnKey('column', ['column'])).toBe('column_2');
    expect(uniqueColumnKey('column', ['column', 'column_2'])).toBe('column_3');

    expect(newColumnDraft({ columns: [column({ key: 'column' })] })).toMatchObject({
      key: 'column_2',
      type: 'text',
      role: 'none',
    });
  });

  it('slugs a label and falls back for non-ASCII labels', () => {
    expect(keyFromLabel('Sensor A', ['sensor_a'])).toBe('sensor_a_2');
    expect(keyFromLabel('  Total (USD) ', [])).toBe('total_usd');
    expect(keyFromLabel('温度', [])).toBe('column');
    expect(keyFromLabel('温度', ['column'])).toBe('column_2');
    expect(keyFromLabel('9 lives', [])).toBe('column_9_lives');
  });

  it('flags type, required and enum-option changes as destructive', () => {
    const current = column({
      type: 'enum',
      enumOptions: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });

    expect(
      isDestructiveColumnChange(current, {
        label: 'Value',
        key: 'value',
        type: 'enum',
        role: 'y',
        enumOptions: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    ).toBe(false);
    expect(
      isDestructiveColumnChange(current, {
        label: 'Value',
        key: 'value',
        type: 'text',
        role: 'y',
      }),
    ).toBe(true);
    expect(
      isDestructiveColumnChange(current, {
        label: 'Value',
        key: 'value',
        type: 'enum',
        role: 'y',
        required: true,
        enumOptions: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    ).toBe(true);
    expect(
      isDestructiveColumnChange(current, {
        label: 'Value',
        key: 'value',
        type: 'enum',
        role: 'y',
        enumOptions: [{ value: 'a', label: 'A' }],
      }),
    ).toBe(true);
    // Label/role/key edits are metadata only.
    expect(
      isDestructiveColumnChange(current, {
        label: 'Renamed',
        key: 'value',
        type: 'enum',
        role: 'label',
        enumOptions: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    ).toBe(false);
  });
});
