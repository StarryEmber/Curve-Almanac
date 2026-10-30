/**
 * T6.3 — plugin UI wiring and isolation.
 *
 * Three acceptance points from TASKS T6.3 are exercised through the real app:
 *
 * 1. every contribution selector reads the plugin host registry, so disabling
 *    the sample plugin removes its options from the column dialog and the import
 *    wizard, and re-enabling restores them (no restart);
 * 2. a throwing plugin importer only loses that import attempt: the error names
 *    the plugin, the toast jumps to the plugin log, and the grid keeps working;
 * 3. the plugin manager stays keyboard reachable at 200% zoom.
 *
 * The "no hard-coded contribution lists" gate is `apps/desktop/test/
 * plugin-contributions.test.ts` (source scan), because a grep-like assertion does
 * not need a running Electron.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';
import { prepareImportFile, writeImportFixtureFile } from './import-fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

const SAMPLE_PLUGIN_ID = 'com.curvealmanac.sample';
const RATING_FIELD_TYPE_ID = 'com.curvealmanac.rating';
const POINTS_IMPORTER_ID = 'com.curvealmanac.points';

type Column = WorkspaceManifest['tables'][number]['columns'][number];
type Cell = string | number | boolean | null;

interface SeededWorkspace {
  root: string;
  manifestPath: string;
}

const ID_COLUMN: Column = {
  id: 'col_id',
  key: 'id',
  label: 'ID',
  type: 'text',
  role: 'none',
  required: true,
};

const VALUE_COLUMN: Column = {
  id: 'col_value',
  key: 'value',
  label: 'Value',
  type: 'number',
  role: 'y',
};

async function seedWorkspace(
  page: Page,
  testInfo: TestInfo,
  name: string,
  tableId: string,
  viewId: string,
): Promise<SeededWorkspace> {
  const parent = testInfo.outputPath(`plugin-ui-${tableId}`);
  const rows: Cell[][] = [
    ['a', 1],
    ['b', 2],
  ];
  await page.evaluate(
    async (seed) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir: seed.parent, name: seed.name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      const timestamp = manifest.createdAt;
      const next: WorkspaceManifest = {
        ...manifest,
        updatedAt: timestamp,
        tables: [
          {
            id: seed.tableId,
            name: seed.name,
            file: `tables/${seed.tableId}.jsonl`,
            schemaVersion: 1,
            columns: seed.columns,
            primaryKey: seed.columns[0]?.id ?? 'col_id',
            rowCount: seed.rows.length,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views: [
          {
            id: seed.viewId,
            kind: 'table',
            refId: seed.tableId,
            title: seed.name,
            tableView: {
              tableId: seed.tableId,
              styleId: 'builtin.report-light',
              columnOrder: seed.columns.map((column) => column.id),
              widths: {},
              hiddenColumnIds: [],
              sort: [],
              frozenColumnCount: 1,
            },
          },
        ],
        layout: { type: 'pane', viewIds: [seed.viewId], activeViewId: seed.viewId },
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const jsonl = `${seed.rows
        .map((values, index) => JSON.stringify({ id: `row_${String(index + 1)}`, v: values }))
        .join('\n')}\n`;
      const tableWritten = await api.table.write({
        workspaceId: manifest.id,
        tableId: seed.tableId,
        jsonl,
      });
      if (!tableWritten.ok) {
        throw new Error(`table write failed: ${tableWritten.error.code}`);
      }
      const closed = await api.workspace.close({ workspaceId: manifest.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
    },
    { parent, name, tableId, viewId, columns: [ID_COLUMN, VALUE_COLUMN], rows },
  );

  const root = join(parent, `${name}.cstudio`);
  return { root, manifestPath: join(root, 'manifest.json') };
}

async function openWorkspace(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

async function setZoom200(electronApp: ElectronApplication, page: Page): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(2);
  });
  await page.waitForFunction(() => window.innerWidth < 800);
}

function readManifest(path: string): WorkspaceManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as WorkspaceManifest;
}

test.describe('T6.3 registry-driven selectors', () => {
  test('disabling the sample plugin removes its options and re-enabling restores them', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(
      page,
      testInfo,
      'Plugin UI',
      'tbl_plugin_ui',
      'viw_plugin_ui',
    );
    await openWorkspace(page, 'Plugin UI');

    // The plugin manager lists the compiled-in plugin with its contributions.
    await page.getByTestId('open-plugins').click();
    const manager = page.getByRole('dialog', { name: '插件' });
    await expect(manager).toBeVisible();
    const row = page.getByTestId(`plugin-row-${SAMPLE_PLUGIN_ID}`);
    await expect(row).toHaveAttribute('data-plugin-status', 'active');
    await expect(row).toContainText('Sample: Rating & Points');
    await expect(row).toContainText('字段类型 1');

    await page.getByTestId(`plugin-toggle-${SAMPLE_PLUGIN_ID}`).click();
    await expect(row).toHaveAttribute('data-plugin-status', 'inactive');
    await expect(row).toContainText('字段类型 0');
    await expect(row).toContainText('导入器 0');
    await page.screenshot({ path: testInfo.outputPath('t6.3-disabled.png') });
    // `关闭工作区` in the title bar also matches the substring "关闭"; scope to
    // the dialog and take its footer button.
    await manager.getByRole('button', { name: '关闭', exact: true }).last().click();
    await expect(manager).toHaveCount(0);

    // Column dialog: the semantic-type selector is empty (no plugin field types)
    // while the storage types still come from the builtin registrations.
    await page.getByTestId('column-add').click();
    const form = page.getByRole('dialog', { name: '新增列' });
    await expect(form.getByLabel('存储类型').locator('option')).toHaveCount(5);
    await form.getByLabel('存储类型').selectOption('number');
    await expect(form.getByTestId('column-form-field-type')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(form).toHaveCount(0);

    // Import wizard: only the builtin CSV/TSV and JSON contributions remain.
    prepareImportFile('points.json');
    await page.getByRole('button', { name: '导入 Plugin UI' }).click();
    const wizard = page.getByRole('dialog', { name: '导入数据' });
    await expect(wizard).toBeVisible();
    const importer = page.getByTestId('import-importer');
    await expect(importer.locator('option')).toHaveCount(3);
    await expect(importer.locator(`option[value="builtin.csv"]`)).toHaveText('CSV / TSV');
    await expect(importer.locator(`option[value="${POINTS_IMPORTER_ID}"]`)).toHaveCount(0);
    await page.getByTestId('import-cancel').click();
    await expect(wizard).toHaveCount(0);

    // Re-enable: the registry notification refreshes the open selectors.
    await page.getByTestId('open-plugins').click();
    await page.getByTestId(`plugin-toggle-${SAMPLE_PLUGIN_ID}`).click();
    await expect(page.getByTestId(`plugin-row-${SAMPLE_PLUGIN_ID}`)).toHaveAttribute(
      'data-plugin-status',
      'active',
    );
    await page.getByRole('button', { name: '关闭', exact: true }).last().click();

    await page.getByTestId('column-add').click();
    const reopened = page.getByRole('dialog', { name: '新增列' });
    await reopened.getByLabel('存储类型').selectOption('number');
    await expect(
      reopened
        .getByTestId('column-form-field-type')
        .locator(`option[value="${RATING_FIELD_TYPE_ID}"]`),
    ).toHaveCount(1);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: '导入 Plugin UI' }).click();
    await expect(
      page.getByTestId('import-importer').locator(`option[value="${POINTS_IMPORTER_ID}"]`),
    ).toHaveText('Points JSON（插件：Sample: Rating & Points）');
    await page.screenshot({ path: testInfo.outputPath('t6.3-registry.png') });
    await page.getByTestId('import-cancel').click();

    // Disabling a plugin never touches the document or the manifest.
    expect(readManifest(seeded.manifestPath).tables).toHaveLength(1);
    await expect(page.getByTestId('grid-cell-0-1')).toHaveText('1');
  });
});

test.describe('T6.3 plugin error isolation', () => {
  test.use({ importFile: 'points-invalid.json' });

  test('a throwing plugin importer only fails that import and names the plugin', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(
      page,
      testInfo,
      'Plugin Throw',
      'tbl_plugin_throw',
      'viw_plugin_throw',
    );
    prepareImportFile('points-invalid.json');
    await openWorkspace(page, 'Plugin Throw');

    await page.getByRole('button', { name: '导入 Plugin Throw' }).click();
    await expect(page.getByRole('dialog', { name: '导入数据' })).toBeVisible();
    await page.getByTestId('import-importer').selectOption(POINTS_IMPORTER_ID);
    await expect(page.getByTestId('import-error')).toContainText('文件格式不受支持');

    // The toast names the plugin and offers the log jump. (Scope by toast class:
    // the inline import error also names the selected plugin importer.)
    const toast = page.locator('.cs-toast').filter({ hasText: 'Sample: Rating & Points' });
    await expect(toast).toContainText('插件');
    await page.screenshot({ path: testInfo.outputPath('t6.3-error-toast.png') });
    await toast.getByRole('button', { name: '查看插件日志' }).click();

    const manager = page.getByRole('dialog', { name: '插件' });
    await expect(manager).toBeVisible();
    await expect(page.getByTestId('plugin-log-entry').last()).toContainText(
      'Sample: Rating & Points',
    );
    await manager.getByRole('button', { name: '关闭', exact: true }).last().click();
    await expect(manager).toHaveCount(0);

    // The plugin failure does not trap the file: the registry list is still
    // available, and switching back to the builtin parser recovers it.
    await page.getByTestId('import-importer').selectOption('');
    await expect(page.getByTestId('import-error')).toHaveCount(0);
    await expect(page.getByTestId('import-step-file')).toBeVisible();

    // Only the import attempt failed: the grid still edits, and a valid file
    // imports through the same plugin afterwards.
    await page.getByTestId('import-cancel').click();
    await expect(page.getByRole('dialog', { name: '导入数据' })).toHaveCount(0);

    await page.getByTestId('grid-cell-0-1').click();
    // Closing the wizard restores focus to the import button; move it back into
    // the grid before the F2 shortcut (same reason as the M5 multi-pane helper).
    await page.getByTestId('grid-cell-0-1').focus();
    await page.keyboard.press('F2');
    await expect(page.getByTestId('cell-editor')).toBeVisible();
    await page.getByTestId('cell-editor').fill('7');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('grid-cell-0-1')).toHaveText('7');
    await expect
      .poll(() => {
        const text = readFileSync(join(seeded.root, 'tables', 'tbl_plugin_throw.jsonl'), 'utf8');
        return text.trim().split('\n').length;
      })
      .toBe(2);

    writeImportFixtureFile(
      'points-invalid.json',
      JSON.stringify([
        { x: 1, y: 2, label: 'a' },
        { x: 2, y: 4, label: 'b' },
      ]),
    );
    await page.getByRole('button', { name: '导入 Plugin Throw' }).click();
    await page.getByTestId('import-importer').selectOption(POINTS_IMPORTER_ID);
    await page.getByTestId('import-next').click();
    await expect(page.getByTestId('import-step-preview')).toContainText('共 2 行数据');
  });
});

test.describe('T6.3 plugin manager accessibility', () => {
  test('stays keyboard reachable and inside the viewport at 200% zoom', async ({
    page,
    electronApp,
  }, testInfo) => {
    await seedWorkspace(page, testInfo, 'Plugin Zoom', 'tbl_plugin_zoom', 'viw_plugin_zoom');
    await openWorkspace(page, 'Plugin Zoom');
    await setZoom200(electronApp, page);

    await page.getByTestId('open-plugins').focus();
    await page.keyboard.press('Enter');
    const manager = page.getByRole('dialog', { name: '插件' });
    await expect(manager).toBeVisible();

    await page.getByTestId(`plugin-toggle-${SAMPLE_PLUGIN_ID}`).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(`plugin-row-${SAMPLE_PLUGIN_ID}`)).toHaveAttribute(
      'data-plugin-status',
      'inactive',
    );
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(`plugin-row-${SAMPLE_PLUGIN_ID}`)).toHaveAttribute(
      'data-plugin-status',
      'active',
    );

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));

    await page.keyboard.press('Escape');
    await expect(manager).toHaveCount(0);
  });
});
