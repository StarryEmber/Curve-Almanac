import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const SCAN_ROOTS = ['packages', 'apps', 'plugins', 'scripts'];
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'dist-types',
  'out',
  'coverage',
  'test-results',
  'playwright-report',
  '.vite',
]);
const OWN_PACKAGE = 'packages/chart-echarts/';
const ECHARTS_IMPORT = /from\s+['"]echarts(?:\/[^'"]*)?['"]/u;
const ECHARTS_REQUIRE = /require\(\s*['"]echarts(?:\/[^'"]*)?['"]\s*\)/u;

function collectSources(directory: string, files: string[]): void {
  if (!existsSync(directory)) {
    return;
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) {
        collectSources(fullPath, files);
      }
      continue;
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
}

function workspacePath(path: string): string {
  return relative(repoRoot, path).split(sep).join('/');
}

function hasEchartsDependency(section: unknown): boolean {
  return typeof section === 'object' && section !== null && 'echarts' in section;
}

describe('@curve/chart-echarts boundaries', () => {
  it('is the only workspace module that imports ECharts', () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) {
      collectSources(join(repoRoot, root), files);
    }
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const relativePath = workspacePath(file);
      if (relativePath.startsWith(OWN_PACKAGE)) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      if (ECHARTS_IMPORT.test(text) || ECHARTS_REQUIRE.test(text)) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('declares echarts only in the chart-echarts manifest', () => {
    const manifests: string[] = [];
    for (const group of ['packages', 'apps']) {
      const groupDir = join(repoRoot, group);
      if (!existsSync(groupDir)) {
        continue;
      }
      for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const manifest = join(groupDir, entry.name, 'package.json');
        if (existsSync(manifest)) {
          manifests.push(manifest);
        }
      }
    }
    manifests.push(join(repoRoot, 'package.json'));

    const offenders: string[] = [];
    let ownManifest: Record<string, unknown> | undefined;
    for (const manifestPath of manifests) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      const declared = [
        manifest['dependencies'],
        manifest['devDependencies'],
        manifest['peerDependencies'],
      ].some((section) => hasEchartsDependency(section));
      const relativePath = workspacePath(manifestPath);
      if (!declared) {
        continue;
      }
      if (relativePath === `${OWN_PACKAGE}package.json`) {
        ownManifest = manifest;
      } else {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
    expect(ownManifest).toBeDefined();
    expect(hasEchartsDependency(ownManifest?.['dependencies'])).toBe(true);
  });
});
