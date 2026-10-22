/**
 * Generates the large GBK import fixture (TESTPLAN §4).
 *
 * Usage:
 *   pnpm exec tsx scripts/gen-100k.ts [--if-missing] [--out <path>]
 *
 * The file is deterministic, GBK-encoded, semicolon-delimited and contains
 * exactly three bad data rows. It is gitignored; the committed small fixtures
 * live under `fixtures/csv/`.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import iconv from 'iconv-lite';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultPath = resolve(repositoryRoot, 'fixtures/csv/gbk-100k.csv');

function csvField(value: string): string {
  return /[",;\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildGbkCsv(rows = 100_000): string {
  const lines = ['id;name;value;day;active;site'];
  for (let index = 0; index < rows; index += 1) {
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
      [
        `id-${String(index + 1).padStart(6, '0')}`,
        `Name ${String(index + 1)}`,
        String((index % 1000) / 10),
        '2026-01-01',
        index % 2 === 0 ? 'true' : 'false',
        `站点-${String(index % 7)}`,
      ]
        .map(csvField)
        .join(';'),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

function main(argv: readonly string[]): number {
  const ifMissing = argv.includes('--if-missing');
  const outIndex = argv.indexOf('--out');
  const out =
    outIndex >= 0 && argv[outIndex + 1] !== undefined
      ? resolve(argv[outIndex + 1] ?? defaultPath)
      : defaultPath;

  if (ifMissing && existsSync(out)) {
    process.stdout.write(`[gen-100k] exists: ${out}\n`);
    return 0;
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, iconv.encode(buildGbkCsv(), 'gb18030'));
  process.stdout.write(`[gen-100k] wrote ${out}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
