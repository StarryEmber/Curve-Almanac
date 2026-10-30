import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * T6.3 acceptance ("所有贡献点从注册表读取（grep 无硬编码）"), made reproducible.
 *
 * The four contribution points — field types, importers, chart kinds and
 * commands — must be read from the plugin host registry. This test fails when a
 * feature module reintroduces a local list of builtin contributions or stops
 * importing the registry accessor it needs (ADR-054).
 *
 * Runs in the Node project (`apps/desktop/tsconfig.test.json`) because it reads
 * source files from disk, like `ui-conventions.test.ts`.
 */

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const rendererRoot = join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer');

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      files.push(...walk(absolute));
    } else if (/\.(ts|tsx)$/.test(absolute) && !/\.test\.tsx?$/.test(absolute)) {
      files.push(absolute);
    }
  }
  return files;
}

const sourceFiles = walk(rendererRoot);
const relative = (file: string): string => file.slice(rendererRoot.length + 1).replace(/\\/g, '/');

/** Local lists that used to live in the UI before T6.3. */
const HARD_CODED_LISTS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bCOLUMN_TYPES\b/,
    reason: 'storage types come from the builtin field-type registrations',
  },
  {
    pattern: /\[\s*'line'\s*,\s*'scatter'\s*,\s*'bar'\s*\]/,
    reason: 'chart kinds come from the chartKinds registry',
  },
  {
    pattern: /readonly ChartKind\[\]\s*=\s*\[/,
    reason: 'chart kinds come from the chartKinds registry',
  },
];

const REGISTRY_WIRING: ReadonlyArray<{ file: string; needle: string; point: string }> = [
  { file: 'features/columns/ColumnFormDialog.tsx', needle: 'usePluginSnapshot', point: '字段类型' },
  { file: 'features/import/use-import.tsx', needle: 'usePluginSnapshot', point: '导入器' },
  { file: 'features/charts/NewChartDialog.tsx', needle: 'usePluginSnapshot', point: '图表类型' },
  { file: 'features/charts/ChartInspector.tsx', needle: 'listChartKinds', point: '图表类型' },
  {
    file: 'features/keymap/use-command-keymap.ts',
    needle: 'listPluginCommands',
    point: '命令',
  },
  {
    file: 'features/plugins/PluginManagerDialog.tsx',
    needle: 'usePluginSnapshot',
    point: '插件状态',
  },
];

describe('plugin contribution points', () => {
  it('keeps hard-coded builtin contribution lists out of the renderer', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      // `plugins/builtins.ts` is the single registration point for builtins;
      // every other module must read them back from the registry.
      if (relative(file) === 'plugins/builtins.ts') {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      for (const rule of HARD_CODED_LISTS) {
        if (rule.pattern.test(source)) {
          offenders.push(`${relative(file)}: ${rule.reason}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('reads every contribution point from the plugin host registry', () => {
    for (const wiring of REGISTRY_WIRING) {
      const source = readFileSync(join(rendererRoot, wiring.file), 'utf8');
      expect(source, `${wiring.file} must read ${wiring.point} from the registry`).toContain(
        wiring.needle,
      );
    }
  });

  it('defines the builtin contribution ids in exactly one place', () => {
    const builtinIdLiteral = /'(builtin\.csv|builtin\.json)'/;
    const offenders = sourceFiles
      .filter((file) => !relative(file).startsWith('plugins/builtins'))
      .filter((file) => builtinIdLiteral.test(readFileSync(file, 'utf8')))
      .map(relative);

    expect(offenders).toEqual([]);
  });

  it('keeps the plugin contribution ids out of the renderer (the plugin owns them)', () => {
    const pluginIdLiteral = /'(com\.curvealmanac\.(rating|points|sample))'/;
    const offenders = sourceFiles
      .filter((file) => pluginIdLiteral.test(readFileSync(file, 'utf8')))
      .map(relative);

    expect(offenders).toEqual([]);
  });
});
