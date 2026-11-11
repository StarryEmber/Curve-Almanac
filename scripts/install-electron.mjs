#!/usr/bin/env node
/**
 * Electron 44 does not download its runtime from a package-level `postinstall`
 * script any more: the npm package ships `bin.install-electron` and leaves
 * `node_modules/electron/dist` empty until someone runs `install.js`. Without
 * that binary `pnpm dev`, `pnpm e2e` and `pnpm package` all fail, and a clean
 * clone or a CI runner has no reason to run the script by hand.
 *
 * This repository-level `postinstall` restores the conventional behaviour:
 * make sure the runtime matching the installed `electron` version exists, and
 * skip the download when it already does. `ELECTRON_MIRROR` /
 * `ELECTRON_CUSTOM_DIR` are honoured (see `docs/DEVELOPER.md`).
 *
 * It runs with inherited stdio and no pipes so it also works in restricted
 * shells that forbid piped child processes.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electronDirectory = join(repositoryRoot, 'apps', 'desktop', 'node_modules', 'electron');

if (!existsSync(electronDirectory)) {
  console.log('[install-electron] electron is not installed; nothing to do.');
  process.exit(0);
}

const pathFile = join(electronDirectory, 'path.txt');
const executableName = existsSync(pathFile) ? readFileSync(pathFile, 'utf8').trim() : '';
const executable = executableName ? join(electronDirectory, 'dist', executableName) : '';

if (executable !== '' && existsSync(executable)) {
  console.log(`[install-electron] runtime already present (${executableName}); skipping.`);
  process.exit(0);
}

const installer = join(electronDirectory, 'install.js');
if (!existsSync(installer)) {
  console.warn('[install-electron] electron has no install.js; skipping runtime download.');
  process.exit(0);
}

console.log('[install-electron] downloading the Electron runtime (first install only)…');
const environment = { ...process.env };
// DSH sets ELECTRON_RUN_AS_NODE globally; the installer is plain Node and the
// variable would only confuse anything that shells out to the binary.
delete environment['ELECTRON_RUN_AS_NODE'];

const result = spawnSync(process.execPath, [installer], {
  cwd: electronDirectory,
  env: environment,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[install-electron] failed to start the installer: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    '[install-electron] the Electron runtime could not be downloaded. ' +
      'Retry with ELECTRON_MIRROR set (docs/DEVELOPER.md), or run ' +
      `"node ${installer}" manually.`,
  );
  process.exit(1);
}

console.log('[install-electron] done.');
