import { describe, expect, it } from 'vitest';

import type { ColumnDef } from '@curve/domain';

import { cellToEditorValue, editorValueToRaw, formatLocalDateInput } from './editor-value';

const TEXT: ColumnDef = { id: 'col_text', key: 'text', label: 'Text', type: 'text', role: 'none' };
const NUMBER: ColumnDef = {
  id: 'col_number',
  key: 'number',
  label: 'Number',
  type: 'number',
  role: 'y',
};
const DATE: ColumnDef = { id: 'col_date', key: 'date', label: 'Date', type: 'date', role: 'none' };
const BOOLEAN: ColumnDef = {
  id: 'col_boolean',
  key: 'boolean',
  label: 'Boolean',
  type: 'boolean',
  role: 'none',
};
const ENUM: ColumnDef = {
  id: 'col_enum',
  key: 'enum',
  label: 'Enum',
  type: 'enum',
  role: 'none',
  enumOptions: [
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
  ],
};

describe('cellToEditorValue', () => {
  it('uses the raw stored value for text, number and enum', () => {
    expect(cellToEditorValue('hello', TEXT)).toBe('hello');
    expect(cellToEditorValue(1234.5, NUMBER)).toBe('1234.5');
    expect(cellToEditorValue('active', ENUM)).toBe('active');
    expect(cellToEditorValue(null, TEXT)).toBe('');
    expect(cellToEditorValue(null, NUMBER)).toBe('');
  });

  it('formats a date as the local YYYY-MM-DD input value', () => {
    const localMidnight = new Date(2026, 1, 3, 0, 0, 0, 0).getTime();
    expect(formatLocalDateInput(localMidnight)).toBe('2026-02-03');
    expect(cellToEditorValue(localMidnight, DATE)).toBe('2026-02-03');
    expect(cellToEditorValue(Number.NaN, DATE)).toBe('');
    expect(cellToEditorValue(null, DATE)).toBe('');
  });

  it('keeps the date editor date-only even when the stored value has a time', () => {
    const withTime = new Date(2026, 1, 3, 15, 30, 0, 0).getTime();
    expect(cellToEditorValue(withTime, DATE)).toBe('2026-02-03');
  });

  it('maps booleans to the three-state editor strings', () => {
    expect(cellToEditorValue(true, BOOLEAN)).toBe('true');
    expect(cellToEditorValue(false, BOOLEAN)).toBe('false');
    expect(cellToEditorValue(null, BOOLEAN)).toBe('');
  });
});

describe('editorValueToRaw', () => {
  it('passes text and number strings to coerceCell unchanged', () => {
    expect(editorValueToRaw('  hello ', TEXT)).toBe('  hello ');
    expect(editorValueToRaw('1,234.5', NUMBER)).toBe('1,234.5');
    expect(editorValueToRaw('', TEXT)).toBe('');
    expect(editorValueToRaw('', NUMBER)).toBeNull();
  });

  it('returns the date input string so coerceCell applies local midnight', () => {
    expect(editorValueToRaw('2026-02-03', DATE)).toBe('2026-02-03');
    expect(editorValueToRaw('', DATE)).toBeNull();
  });

  it('maps the boolean tri-state to true/false/null', () => {
    expect(editorValueToRaw('true', BOOLEAN)).toBe(true);
    expect(editorValueToRaw('false', BOOLEAN)).toBe(false);
    expect(editorValueToRaw('', BOOLEAN)).toBeNull();
  });

  it('uses null for an empty enum so required and optional columns behave correctly', () => {
    expect(editorValueToRaw('active', ENUM)).toBe('active');
    expect(editorValueToRaw('', ENUM)).toBeNull();
  });
});
