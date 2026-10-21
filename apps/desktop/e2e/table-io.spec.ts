import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { desktopAppDir, test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';

/**
 * T1.3 — table data over IPC, driven through the built app's `window.api`
 * (there is no table UI until T2.1).
 *
 * Covers the three acceptance paths that need the real filesystem: an empty
 * table is a zero-byte file, JSONL round-trips byte for byte, and `table:trash`
 * only moves the file (the manifest is the caller's job).
 */

const TABLE_ID = 'tbl_1';

function tableMeta(rowCount: number): WorkspaceManifest['tables'][number] {
  return {
    id: TABLE_ID,
    name: 'Measurements',
    file: `tables/${TABLE_ID}.jsonl`,
    schemaVersion: 1,
    columns: [
      { id: 'col_id', key: 'id', label: 'id', type: 'text', role: 'label', required: true },
      { id: 'col_at', key: 'at', label: 'at', type: 'date', role: 'x' },
      { id: 'col_value', key: 'value', label: 'value', type: 'number', role: 'y' },
    ],
    primaryKey: 'col_id',
    rowCount,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  };
}

test.describe('T1.3 table data', () => {
  test('writes, reads and trashes a table file without touching the manifest', async ({
    page,
  }, testInfo) => {
    const parent = testInfo.outputPath('table-parent');
    mkdirSync(parent, { recursive: true });

    const created = await page.evaluate(
      ({ dir, name }) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.create({ dir, name }),
      { dir: parent, name: 'Tables' },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const root = join(parent, 'Tables.cstudio');
    const workspaceId = created.data.id;

    const manifest: WorkspaceManifest = { ...created.data, tables: [tableMeta(0)] };
    await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.manifest.write(request),
      { workspaceId, manifest },
    );

    // A table the manifest describes as empty has no file yet: reading it is an
    // empty table, not an error (ADR-022).
    const empty = await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.table.read(request),
      { workspaceId, tableId: TABLE_ID },
    );
    expect(empty).toEqual({ ok: true, data: { jsonl: '', bytes: 0 } });

    const jsonl =
      '{"id":"row_001","v":["a",1735689600000,21.5]}\n' +
      '{"id":"row_002","v":["b",1735689660000,23.1]}\n' +
      '{"id":"row_003","v":["c",1735689720000,null]}\n';
    const expectedBytes = Buffer.byteLength(jsonl, 'utf8');

    const written = await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.table.write(request),
      { workspaceId, tableId: TABLE_ID, jsonl },
    );
    expect(written).toEqual({ ok: true, data: { bytes: expectedBytes } });

    const tablePath = join(root, 'tables', `${TABLE_ID}.jsonl`);
    expect(existsSync(tablePath)).toBe(true);
    expect(readFileSync(tablePath, 'utf8')).toBe(jsonl);

    const read = await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.table.read(request),
      { workspaceId, tableId: TABLE_ID },
    );
    expect(read).toEqual({ ok: true, data: { jsonl, bytes: expectedBytes } });

    // SPEC §7.5: reopening repairs the rowCount hint from the file on disk.
    await page.evaluate(
      (id) => (globalThis as unknown as { api: CurveApi }).api.workspace.close({ workspaceId: id }),
      workspaceId,
    );
    const reopened = await page.evaluate(
      (dir) => (globalThis as unknown as { api: CurveApi }).api.workspace.open({ dir }),
      realpathSync(root),
    );
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) {
      return;
    }
    expect(reopened.data.manifest.tables[0]?.rowCount).toBe(3);
    expect(reopened.data.warnings.join('\n')).toContain('row count');

    const trashBefore = readdirSync(join(root, '.trash'));

    const trashed = await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.table.trash(request),
      { workspaceId, tableId: TABLE_ID },
    );
    expect(trashed).toEqual({ ok: true, data: { ok: true } });
    expect(existsSync(tablePath)).toBe(false);

    const trashAfter = readdirSync(join(root, '.trash'));
    expect(trashAfter.length).toBe(trashBefore.length + 1);
    expect(trashAfter.some((name) => name.startsWith(`${TABLE_ID}.`))).toBe(true);

    // The manifest still lists the table: trashing moves the file only. With a
    // non-zero hint the missing file is data loss, not an empty table.
    expect(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).tables).toHaveLength(1);
    const afterTrash = await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.table.read(request),
      { workspaceId, tableId: TABLE_ID },
    );
    expect(afterTrash).toMatchObject({ ok: false, error: { code: 'E_TABLE_NOT_FOUND' } });

    await page.evaluate(
      (id) => (globalThis as unknown as { api: CurveApi }).api.workspace.close({ workspaceId: id }),
      workspaceId,
    );
    rmSync(parent, { recursive: true, force: true });
  });

  test('rejects path-shaped ids and unknown tables at the IPC boundary', async ({
    page,
  }, testInfo) => {
    const parent = testInfo.outputPath('table-guard-parent');
    mkdirSync(parent, { recursive: true });

    const created = await page.evaluate(
      ({ dir, name }) =>
        (globalThis as unknown as { api: CurveApi }).api.workspace.create({ dir, name }),
      { dir: parent, name: 'Guards' },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const workspaceId = created.data.id;

    const escape = await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.table.read(request),
      { workspaceId, tableId: '../escape' },
    );
    expect(escape).toMatchObject({ ok: false, error: { code: 'E_IPC_INVALID_PAYLOAD' } });

    const unknown = await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.table.read(request),
      { workspaceId, tableId: 'tbl_missing' },
    );
    expect(unknown).toMatchObject({ ok: false, error: { code: 'E_TABLE_NOT_FOUND' } });

    const notOpen = await page.evaluate(
      (request) => (globalThis as unknown as { api: CurveApi }).api.table.read(request),
      { workspaceId: 'ws_unknown', tableId: TABLE_ID },
    );
    expect(notOpen).toMatchObject({ ok: false, error: { code: 'E_WS_NOT_FOUND' } });

    await page.evaluate(
      (id) => (globalThis as unknown as { api: CurveApi }).api.workspace.close({ workspaceId: id }),
      workspaceId,
    );
    rmSync(parent, { recursive: true, force: true });
  });

  test('loads the table worker under the production CSP', async ({ page }) => {
    const assetsDirectory = join(desktopAppDir, 'out', 'renderer', 'assets');
    const workerFile = readdirSync(assetsDirectory).find((name) =>
      /^table\.worker-.*\.js$/.test(name),
    );
    expect(workerFile).toBeDefined();
    if (workerFile === undefined) {
      return;
    }

    const table = tableMeta(1);
    const jsonl = '{"id":"row_001","v":["a",1735689600000,21.5]}\n';

    const outcome = await page.evaluate(
      async ({ file, tableMeta: meta, jsonl: encoded }) => {
        // Same origin as the app; CSP has no `worker-src`, so it falls back to
        // `default-src 'self'` (SPEC §15.3).
        const url = new URL(`./assets/${file}`, location.href).href;
        let worker: Worker;
        try {
          worker = new Worker(url, { type: 'module' });
        } catch (error) {
          return { ok: false as const, stage: 'construct', message: String(error) };
        }
        try {
          const response = await new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('worker timeout')), 15_000);
            worker.onmessage = (event: MessageEvent<unknown>) => {
              clearTimeout(timer);
              resolve(event.data);
            };
            worker.onerror = (event: ErrorEvent) => {
              clearTimeout(timer);
              reject(new Error(event.message === '' ? 'worker error' : event.message));
            };
            worker.postMessage({ id: 1, type: 'decode', payload: { jsonl: encoded, table: meta } });
          });
          return { ok: true as const, response };
        } catch (error) {
          return { ok: false as const, stage: 'message', message: String(error) };
        } finally {
          worker.terminate();
        }
      },
      { file: workerFile, tableMeta: table, jsonl },
    );

    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok) {
      expect(outcome.response).toMatchObject({
        id: 1,
        ok: true,
        type: 'decode',
        result: {
          rows: [{ id: 'row_001', values: ['a', 1_735_689_600_000, 21.5] }],
          issues: [],
        },
      });
    }
  });
});
