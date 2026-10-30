import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Packaging contract for T6.4 (ADR-055 / TESTPLAN §7).
 *
 * These are static invariants of the release configuration: the binary smoke
 * (`pnpm package:smoke`) proves the artifacts work, this file proves nobody
 * silently flips the installer to per-machine, drops the icon/license, ships
 * source files, or changes the app identity.
 *
 * `src/shared/brand.test.ts` owns the single APP_NAME source; this project only
 * reads the package/installer files from disk, so the display name is asserted
 * as a literal here (a rename must update this contract too).
 */

const PRODUCT_NAME = 'Curve Almanac';

const desktopDirectory = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = join(desktopDirectory, '..', '..');
const configText = readFileSync(join(desktopDirectory, 'electron-builder.yml'), 'utf8');
const desktopPackage = JSON.parse(readFileSync(join(desktopDirectory, 'package.json'), 'utf8')) as {
  version: string;
  productName: string;
  description: string;
  main: string;
  scripts: Record<string, string>;
  license?: string;
  dependencies?: Record<string, string>;
};
const rootPackage = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
  version: string;
  scripts: Record<string, string>;
};

/** Returns the indented content of a top-level YAML block. */
function topLevelBlock(name: string): string {
  const lines = configText.split('\n');
  const start = lines.findIndex((line) => line === `${name}:`);
  if (start === -1) {
    return '';
  }
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.length > 0 && !line.startsWith(' ')) {
      break;
    }
    body.push(line);
  }
  return body.join('\n');
}

describe('T6.4 packaging configuration', () => {
  it('keeps the release identity and output layout', () => {
    expect(configText).toMatch(/^appId: com\.curvealmanac\.app$/m);
    expect(configText).toMatch(/^productName: Curve Almanac$/m);
    expect(topLevelBlock('directories')).toContain('output: ../../release');
    expect(topLevelBlock('directories')).toContain('buildResources: build');
    expect(configText).toMatch(/^asar: true$/m);
    // ADR-016: v1 has no update/publish channel; a build must never upload.
    expect(configText).toMatch(/^publish: null$/m);
    expect(configText).toMatch(/^npmRebuild: false$/m);
  });

  it('targets NSIS + portable for x64 and installs per user without elevation', () => {
    const win = topLevelBlock('win');
    expect(win).toContain('icon: build/icon.ico');
    expect(win).toContain('- target: nsis');
    expect(win).toContain('- target: portable');
    expect(win).toContain('- x64');
    expect(win).toContain('requestedExecutionLevel: asInvoker');

    const nsis = topLevelBlock('nsis');
    expect(nsis).toMatch(/oneClick: false/);
    expect(nsis).toMatch(/perMachine: false/);
    expect(nsis).toMatch(/allowElevation: false/);
    expect(nsis).toMatch(/deleteAppDataOnUninstall: false/);
    expect(nsis).toMatch(/createStartMenuShortcut: true/);
    expect(nsis).toMatch(/createDesktopShortcut: true/);
  });

  it('packs only the build output and production modules', () => {
    const files = topLevelBlock('files');
    expect(files).toContain('out/**/*');
    expect(files).toContain('package.json');
    expect(files).not.toMatch(/(^|\s)- .*\bsrc\b/);
    expect(files).not.toMatch(/(^|\s)- .*\b(e2e|test|tests|fixtures|docs)\b/);

    expect(desktopPackage.main).toBe('./out/main/index.cjs');
    expect(desktopPackage.productName).toBe(PRODUCT_NAME);
    expect(desktopPackage.version).toMatch(/^\d+\.\d+\.\d+$/);
    // The release checklist compares the installer/app version with package.json.
    expect(rootPackage.version).toBe(desktopPackage.version);
    expect(desktopPackage.license).toBe('MIT');
    expect(desktopPackage.description).not.toContain('Electron main');
  });

  it('ships an ICO/PNG icon and the MIT license the installer can show', () => {
    const icoPath = join(desktopDirectory, 'build', 'icon.ico');
    const pngPath = join(desktopDirectory, 'build', 'icon.png');
    const licensePath = join(desktopDirectory, 'build', 'license.txt');
    expect(existsSync(icoPath)).toBe(true);
    expect(existsSync(pngPath)).toBe(true);
    expect(existsSync(licensePath)).toBe(true);

    const ico = readFileSync(icoPath);
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // ICO type
    const count = ico.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(6);
    const sizes: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const offset = 6 + index * 16;
      const width = ico[offset] === 0 ? 256 : (ico[offset] ?? 0);
      sizes.push(width);
    }
    expect(sizes).toContain(16);
    expect(sizes).toContain(32);
    expect(sizes).toContain(256);

    const png = readFileSync(pngPath);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);

    const license = readFileSync(licensePath, 'utf8');
    expect(license).toContain(PRODUCT_NAME);
    expect(license).toContain('MIT License');
    expect(license).toContain('Permission is hereby granted');
  });

  it('wires the package scripts so packaging always builds first', () => {
    expect(desktopPackage.scripts['package']).toContain(
      'electron-builder --config electron-builder.yml',
    );
    expect(rootPackage.scripts['package']).toContain('pnpm build');
    expect(rootPackage.scripts['package']).toContain('--filter @curve/desktop package');
    expect(rootPackage.scripts['package:smoke']).toContain('scripts/package-smoke.ts');
  });

  it('ships electron-log for the T6.6 file log and lets its src/ into the asar', () => {
    expect(desktopPackage.dependencies?.['electron-log']).toMatch(/^\^5\./u);
    const smoke = readFileSync(join(repositoryRoot, 'scripts', 'package-smoke.ts'), 'utf8');
    expect(smoke).toContain('node_modules/electron-log/src/index.js');
    // electron-log publishes source files only; the dev-file scan must exempt
    // production node_modules while still rejecting the app's own src/e2e/test.
    expect(smoke).toContain("!file.path.startsWith('node_modules/')");
  });
});
