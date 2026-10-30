import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import iconv from 'iconv-lite';

const e2eDirectory = dirname(fileURLToPath(import.meta.url));

/** Scratch directory for generated import fixtures (under gitignored test-results). */
export const IMPORT_FIXTURE_DIR = join(
  e2eDirectory,
  '..',
  'test-results',
  'e2e-user-data',
  'import-fixtures',
);

export type ImportFixtureName =
  | 'gbk-100k.csv'
  | 'gbk-small.csv'
  | 'rows-150k.csv'
  | 'rows-200001.csv'
  | 'points.json'
  | 'points-invalid.json';

function csvLine(values: readonly (string | number | boolean)[]): string {
  return values
    .map((value) => {
      const text = String(value);
      return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(';');
}

function gbk100k(): string {
  const lines = ['id;name;value;day;active;site'];
  for (let index = 0; index < 100_000; index += 1) {
    if (index === 25_000) {
      lines.push('bad-1;;oops;not-a-date;maybe;site-x');
      continue;
    }
    if (index === 50_000) {
      lines.push('bad-2;Name 50000;12;2026-01-01;true');
      continue;
    }
    if (index === 75_000) {
      lines.push('bad-3;Name 75000;12;2026-01-01;true;site-x;extra');
      continue;
    }
    lines.push(
      csvLine([
        `id-${String(index + 1).padStart(6, '0')}`,
        `Name ${String(index + 1)}`,
        (index % 1000) / 10,
        '2026-01-01',
        index % 2 === 0 ? 'true' : 'false',
        `站点-${String(index % 7)}`,
      ]),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

function utf8Csv(rows: number): string {
  const lines = ['id,value'];
  for (let index = 0; index < rows; index += 1) {
    lines.push(`id-${String(index + 1)},${String(index % 100)}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Writes arbitrary content to a named fixture path (T6.3). The launch fixture
 * pins one import path, so a test can change what the next import reads without
 * relaunching the app.
 */
export function writeImportFixtureFile(name: ImportFixtureName, content: string): string {
  mkdirSync(IMPORT_FIXTURE_DIR, { recursive: true });
  const path = join(IMPORT_FIXTURE_DIR, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

/**
 * Creates one large import fixture on demand, inside the import test that needs
 * it. It deliberately does **not** run in the worker fixture: generating a
 * 100k file in that process left memory/GC pressure that pushed the independent
 * 100k grid first-frame test over its 1s budget.
 */
export function prepareImportFile(name: ImportFixtureName): string {
  mkdirSync(IMPORT_FIXTURE_DIR, { recursive: true });
  const path = join(IMPORT_FIXTURE_DIR, name);

  if (name === 'gbk-100k.csv') {
    writeFileSync(path, iconv.encode(gbk100k(), 'gb18030'));
    return path;
  }
  if (name === 'gbk-small.csv') {
    writeFileSync(path, iconv.encode('id;name\r\n1;你好\r\n2;世界\r\n', 'gb18030'));
    return path;
  }
  if (name === 'points.json') {
    writeFileSync(
      path,
      JSON.stringify([
        { x: 1, y: 2, label: 'a' },
        { x: 2, y: 4, label: 'b' },
      ]),
      'utf8',
    );
    return path;
  }
  if (name === 'points-invalid.json') {
    // Valid JSON and a valid row-array for the builtin parser, but the `x`
    // coordinate is not a finite number, so the plugin importer rejects it. That
    // is the T6.3 isolation case: the builtin preview succeeds, selecting the
    // plugin importer fails, and nothing else breaks.
    writeFileSync(path, JSON.stringify([{ x: 'nope', y: 2 }]), 'utf8');
    return path;
  }
  if (!existsSync(path)) {
    writeFileSync(path, utf8Csv(name === 'rows-150k.csv' ? 150_000 : 200_001), 'utf8');
  }
  return path;
}
