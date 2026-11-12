#!/usr/bin/env node
// 检查 Markdown 相对链接/图片是否存在；无依赖。
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const SKIP = new Set([
  '.git',
  'node_modules',
  'out',
  'dist',
  'coverage',
  'test-results',
  'release',
]);
const bad = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) await walk(path);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) check(path);
  }
}

function check(file) {
  const text = readFileSync(file, 'utf8');
  const re = /\]\(([^)\s]+)\)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    let target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    target = target.split('#')[0];
    if (!target) continue;
    if (!existsSync(resolve(dirname(file), decodeURI(target)))) {
      bad.push(`${relative(ROOT, file)} -> ${target}`);
    }
  }
}

await walk(ROOT);
if (bad.length) {
  console.error(`坏链接 ${bad.length} 个：`);
  for (const item of bad) console.error('  ' + item);
  process.exit(1);
}
console.log('相对链接检查通过');
