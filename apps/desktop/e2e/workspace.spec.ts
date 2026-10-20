import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';

/**
 * T1.2 — workspace repository and atomic persistence, driven through the
 * built app's `window.api` (there is no workspace UI until T2.1).
 *
 * All directories live under `test-results/`, which is git-ignored and also
 * writable in restricted shells.
 */

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

test.describe('T1.2 workspace persistence', () => {
  test('creates the SPEC §7.1 layout, opens it, records it and closes it', async ({
    page,
  }, testInfo) => {
    const parent = testInfo.outputPath('create-parent');
    mkdirSync(parent, { recursive: true });

    const created = await page.evaluate(
      ({ dir, name }) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.create({ dir, name }),
      { dir: parent, name: 'Demo' },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const root = join(parent, 'Demo.cstudio');
    const canonicalRoot = realpathSync(root);
    expect(created.data.name).toBe('Demo');
    expect(created.data.formatVersion).toBe(1);
    expect(created.data.id).toMatch(/^ws_/);

    expect(existsSync(join(root, 'manifest.json'))).toBe(true);
    for (const directory of ['tables', 'backups', 'imports', '.trash']) {
      expect(existsSync(join(root, directory))).toBe(true);
    }
    expect(existsSync(join(root, '.lock'))).toBe(true);
    expect(readManifest(root)).toEqual(created.data);

    const opened = await page.evaluate(
      (dir) => (globalThis as unknown as { api: CurveApi }).api.workspace.open({ dir }),
      canonicalRoot,
    );
    expect(opened).toEqual({
      ok: true,
      data: { manifest: created.data, warnings: [] },
    });

    const recent = await page.evaluate(() =>
      (globalThis as unknown as { api: CurveApi }).api.workspace.recent(),
    );
    expect(recent.ok).toBe(true);
    if (recent.ok) {
      expect(recent.data.some((entry) => entry.name === 'Demo')).toBe(true);
      expect(
        recent.data.some((entry) => entry.path.toLowerCase() === canonicalRoot.toLowerCase()),
      ).toBe(true);
    }

    const closed = await page.evaluate(
      (workspaceId) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.close({ workspaceId }),
      created.data.id,
    );
    expect(closed).toEqual({ ok: true, data: { ok: true } });
    expect(existsSync(join(root, '.lock'))).toBe(false);

    rmSync(parent, { recursive: true, force: true });
  });

  test('rejects a corrupt manifest without overwriting it', async ({ page }, testInfo) => {
    const parent = testInfo.outputPath('corrupt-parent');
    mkdirSync(parent, { recursive: true });

    const created = await page.evaluate(
      ({ dir, name }) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.create({ dir, name }),
      { dir: parent, name: 'Corrupt' },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const root = join(parent, 'Corrupt.cstudio');
    await page.evaluate(
      (workspaceId) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.close({ workspaceId }),
      created.data.id,
    );

    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, '{"formatVersion":1,"tables":[');
    const before = readFileSync(manifestPath);

    const opened = await page.evaluate(
      (dir) => (globalThis as unknown as { api: CurveApi }).api.workspace.open({ dir }),
      realpathSync(root),
    );
    expect(opened).toMatchObject({ ok: false, error: { code: 'E_WS_INVALID_MANIFEST' } });
    expect(readFileSync(manifestPath)).toEqual(before);
    expect(existsSync(join(root, '.lock'))).toBe(false);

    rmSync(parent, { recursive: true, force: true });
  });

  test('rejects a future formatVersion and preserves the file', async ({ page }, testInfo) => {
    const parent = testInfo.outputPath('future-parent');
    mkdirSync(parent, { recursive: true });

    const created = await page.evaluate(
      ({ dir, name }) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.create({ dir, name }),
      { dir: parent, name: 'Future' },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const root = join(parent, 'Future.cstudio');
    await page.evaluate(
      (workspaceId) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.close({ workspaceId }),
      created.data.id,
    );

    const manifestPath = join(root, 'manifest.json');
    const manifest = readManifest(root);
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, formatVersion: 2 }));
    const before = readFileSync(manifestPath);

    const opened = await page.evaluate(
      (dir) => (globalThis as unknown as { api: CurveApi }).api.workspace.open({ dir }),
      realpathSync(root),
    );
    expect(opened).toMatchObject({ ok: false, error: { code: 'E_WS_VERSION_UNSUPPORTED' } });
    expect(readFileSync(manifestPath)).toEqual(before);

    rmSync(parent, { recursive: true, force: true });
  });

  test('writes a manifest through manifest:write', async ({ page }, testInfo) => {
    const parent = testInfo.outputPath('manifest-parent');
    mkdirSync(parent, { recursive: true });

    const created = await page.evaluate(
      ({ dir, name }) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.create({ dir, name }),
      { dir: parent, name: 'Manifest' },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const root = join(parent, 'Manifest.cstudio');
    const renamed: WorkspaceManifest = { ...created.data, name: 'Renamed' };

    const written = await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.manifest.write(request),
      { workspaceId: created.data.id, manifest: renamed },
    );
    expect(written).toEqual({ ok: true, data: { ok: true } });
    expect(readManifest(root).name).toBe('Renamed');

    const closed = await page.evaluate(
      (workspaceId) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.close({ workspaceId }),
      created.data.id,
    );
    expect(closed).toEqual({ ok: true, data: { ok: true } });

    rmSync(parent, { recursive: true, force: true });
  });
});
