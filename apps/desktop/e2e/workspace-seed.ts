/**
 * Shared fixtures for the T5.3 autosave/recovery specs.
 *
 * A workspace is created through the real IPC bridge (create → manifest →
 * JSONL → manifest again → close) so the manifest backup written by the second
 * `manifest:write` exists for the recovery tests. The table is intentionally
 * tiny: these specs exercise saving/restoring, not the grid.
 */

import { join } from 'node:path';

import { expect } from '@playwright/test';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

export const SIMPLE_TABLE_ID = 'tbl_simple';
export const SIMPLE_VIEW_ID = 'viw_simple';
export const SIMPLE_ROWS = [
  ['alpha', 1],
  ['beta', 2],
  ['gamma', 3],
] as const;

export interface SimpleSeed {
  /** Workspace root (`<dir>/<name>.cstudio`). */
  root: string;
  /** Absolute path of the table JSONL. */
  jsonlPath: string;
  /** Absolute path of `manifest.json`. */
  manifestPath: string;
}

export async function seedSimpleWorkspace(
  page: Page,
  dir: string,
  name: string,
): Promise<SimpleSeed> {
  await page.evaluate(
    async ({ dir: parent, name: workspaceName, tableId, viewId, rows }) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir: parent, name: workspaceName });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const base = created.data;
      const timestamp = base.createdAt;
      const columns: WorkspaceManifest['tables'][number]['columns'] = [
        {
          id: 'col_id',
          key: 'id',
          label: 'ID',
          type: 'text',
          role: 'none',
          required: true,
        },
        { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
      ];
      const manifest: WorkspaceManifest = {
        ...base,
        updatedAt: timestamp,
        tables: [
          {
            id: tableId,
            name: 'Autosave',
            file: `tables/${tableId}.jsonl`,
            schemaVersion: 1,
            columns,
            primaryKey: 'col_id',
            rowCount: rows.length,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views: [
          {
            id: viewId,
            kind: 'table',
            refId: tableId,
            title: 'Autosave',
            tableView: {
              tableId,
              styleId: 'builtin.report-light',
              columnOrder: ['col_id', 'col_value'],
              widths: {},
              hiddenColumnIds: [],
              sort: [],
              frozenColumnCount: 0,
            },
          },
        ],
        layout: { type: 'pane', viewIds: [viewId], activeViewId: viewId },
      };

      const written = await api.manifest.write({ workspaceId: base.id, manifest });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const jsonl = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
      const tableWritten = await api.table.write({
        workspaceId: base.id,
        tableId,
        jsonl,
      });
      if (!tableWritten.ok) {
        throw new Error(`table write failed: ${tableWritten.error.code}`);
      }
      // Second write: backs up the full manifest (with the table) so recovery
      // can rebuild a manifest that still references every table.
      const backedUp = await api.manifest.write({ workspaceId: base.id, manifest });
      if (!backedUp.ok) {
        throw new Error(`backup manifest write failed: ${backedUp.error.code}`);
      }
      const closed = await api.workspace.close({ workspaceId: base.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
    },
    {
      dir,
      name,
      tableId: SIMPLE_TABLE_ID,
      viewId: SIMPLE_VIEW_ID,
      rows: SIMPLE_ROWS.map((row, index) => ({ id: `row_${String(index + 1)}`, v: row })),
    },
  );

  const root = join(dir, `${name}.cstudio`);
  return {
    root,
    jsonlPath: join(root, 'tables', `${SIMPLE_TABLE_ID}.jsonl`),
    manifestPath: join(root, 'manifest.json'),
  };
}

/** Reloads to the welcome page and opens a recent workspace by name. */
export async function openRecentWorkspace(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
}

export async function expectWorkspaceOpen(page: Page): Promise<void> {
  await expect(page.getByTestId('workspace-view')).toBeVisible();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

export async function editCell(
  page: Page,
  row: number,
  column: number,
  value: string,
): Promise<void> {
  const cell = page.getByTestId(`grid-cell-${row}-${column}`);
  const editor = page.getByTestId('cell-editor');
  await cell.click();
  await page.bringToFront().catch(() => undefined);
  await page.keyboard.press('F2');
  if (!(await editor.isVisible().catch(() => false))) {
    // CI Windows runners can start the Electron window without OS keyboard
    // focus. Double-click opens the same editor through the mouse path.
    await cell.dblclick();
  }
  await expect(editor).toBeVisible();
  await editor.fill(value);
  await page.keyboard.press('Enter');
}

/**
 * Zooms to 200%, or to the highest factor that still leaves ~720 CSS px of
 * layout on small CI screens (1024x768 uses 1.42x instead of a 512px viewport
 * where the grid is not visible). Developer machines still get exactly 2x.
 */
export async function zoomToNarrowLayout(
  electronApp: ElectronApplication,
  page: Page,
): Promise<void> {
  const factor = await page.evaluate(() => Math.min(2, Math.max(1.25, window.innerWidth / 720)));
  await electronApp.evaluate(({ BrowserWindow }, zoom) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(zoom);
  }, factor);
  await page.waitForFunction(() => window.innerWidth < 800);
}

export async function capture(
  target: Page | ElectronApplication,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(name);
  if ('screenshot' in target) {
    await target.screenshot({ path });
  } else {
    const window = await target.firstWindow();
    await window.screenshot({ path });
  }
  await testInfo.attach(name.replace(/\.png$/u, ''), { path, contentType: 'image/png' });
}

/** Resolves when the Electron process exits (graceful quit or force kill). */
export function waitForExit(electronApp: ElectronApplication): Promise<void> {
  const child = electronApp.process();
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.once('exit', () => {
      resolve();
    });
  });
}
