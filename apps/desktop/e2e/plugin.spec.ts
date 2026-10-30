/**
 * T6.2 — the sample plugin (`plugins/plugin-sample`).
 *
 * Two contribution points are exercised through the real UI: the `rating`
 * semantic field type in the column dialog and the `Points JSON` importer in the
 * import wizard. The plugin itself is tested independently
 * (`pnpm exec vitest run plugins/plugin-sample`); these specs verify the wiring,
 * persistence and the main-process field-type resolution on reload.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';
import { prepareImportFile } from './import-fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

const RATING_FIELD_TYPE_ID = 'com.curvealmanac.rating';
const POINTS_IMPORTER_ID = 'com.curvealmanac.points';

type Column = WorkspaceManifest['tables'][number]['columns'][number];
type TableView = NonNullable<WorkspaceManifest['views'][number]['tableView']>;
type Cell = string | number | boolean | null;

interface SeedSpec {
  name: string;
  tableId: string;
  viewId: string;
  columns: Column[];
  rows: Cell[][];
}

interface SeededWorkspace {
  root: string;
  jsonlPath: string;
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

async function seedWorkspace(
  page: Page,
  testInfo: TestInfo,
  spec: SeedSpec,
): Promise<SeededWorkspace> {
  const parent = testInfo.outputPath(`plugin-parent-${spec.tableId}`);
  await page.evaluate(
    async (seed) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir: seed.parent, name: seed.name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      const timestamp = manifest.createdAt;
      const tableView: TableView = {
        tableId: seed.tableId,
        styleId: 'builtin.report-light',
        columnOrder: seed.columns.map((column) => column.id),
        widths: {},
        hiddenColumnIds: [],
        sort: [],
        frozenColumnCount: 1,
      };
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
            tableView,
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
        .join('\n')}${seed.rows.length === 0 ? '' : '\n'}`;
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
    {
      parent,
      name: spec.name,
      tableId: spec.tableId,
      viewId: spec.viewId,
      columns: spec.columns,
      rows: spec.rows,
    },
  );

  const root = join(parent, `${spec.name}.cstudio`);
  return {
    root,
    jsonlPath: join(root, 'tables', `${spec.tableId}.jsonl`),
    manifestPath: join(root, 'manifest.json'),
  };
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(read(join(root, 'manifest.json'))) as WorkspaceManifest;
}

function readValues(seeded: SeededWorkspace): Cell[][] {
  const text = read(seeded.jsonlPath).trim();
  if (text.length === 0) {
    return [];
  }
  return text.split('\n').map((line) => (JSON.parse(line) as { v: Cell[] }).v);
}

async function openWorkspace(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

async function clickNext(page: Page): Promise<void> {
  await page.getByTestId('import-next').click();
}

async function setZoom200(electronApp: ElectronApplication, page: Page): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(2);
  });
  await page.waitForFunction(() => window.innerWidth < 800);
}

test.describe('T6.2 rating field type', () => {
  test('adds a rating column, formats stars, rejects 0/6 and reloads cleanly', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Plugin Rating',
      tableId: 'tbl_plugin_rating',
      viewId: 'viw_plugin_rating',
      columns: [
        ID_COLUMN,
        { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
      ],
      rows: [
        ['a', 1],
        ['b', 2],
      ],
    });
    await openWorkspace(page, 'Plugin Rating');

    // The column dialog only offers field types whose storage type matches.
    await page.getByTestId('column-add').click();
    const form = page.getByRole('dialog', { name: '新增列' });
    await form.getByLabel('显示名称').fill('Rating');
    await expect(form.getByTestId('column-form-field-type')).toHaveCount(0);
    await form.getByLabel('存储类型').selectOption('number');
    const fieldType = form.getByTestId('column-form-field-type');
    await expect(fieldType).toBeVisible();
    await expect(fieldType.locator(`option[value="${RATING_FIELD_TYPE_ID}"]`)).toHaveText('Rating');
    await fieldType.selectOption(RATING_FIELD_TYPE_ID);
    await form.getByRole('button', { name: '添加列' }).click();

    await expect(page.getByRole('grid')).toHaveAttribute('aria-colcount', '3');
    await expect
      .poll(() => readManifest(seeded.root).tables[0]?.columns[2]?.fieldTypeId)
      .toBe(RATING_FIELD_TYPE_ID);
    await expect.poll(() => readManifest(seeded.root).tables[0]?.columns[2]?.type).toBe('number');

    // A valid rating is stored as a plain number and rendered as stars.
    await page.getByTestId('grid-cell-0-2').click();
    await page.keyboard.press('F2');
    await page.getByTestId('cell-editor').fill('3');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('grid-cell-0-2')).toHaveText('★★★');
    await expect.poll(() => readValues(seeded)[0]).toEqual(['a', 1, 3]);

    // The plugin validate rejects 0 and 6 with the localised range error.
    for (const rejected of ['6', '0']) {
      await page.getByTestId('grid-cell-1-2').click();
      await page.keyboard.press('F2');
      await expect(page.getByTestId('cell-editor')).toBeVisible();
      await page.getByTestId('cell-editor').fill(rejected);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('edit-status')).toContainText('超出允许范围');
      await expect(page.getByTestId('cell-editor')).toHaveAttribute('aria-invalid', 'true');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('cell-editor')).toHaveCount(0);
    }
    expect(readValues(seeded)[1]).toEqual(['b', 2, null]);

    // Reload: the main process resolves the field type, so no "cannot verify"
    // warning appears and the grid keeps the semantic formatting.
    await openWorkspace(page, 'Plugin Rating');
    await expect(page.getByTestId('grid-cell-0-2')).toHaveText('★★★');
    await expect(page.getByTestId('grid-cell-1-2')).not.toContainText('★');
    await expect(page.locator('.cs-warnings')).toHaveCount(0);
    await expect
      .poll(() => readManifest(seeded.root).tables[0]?.columns[2]?.fieldTypeId)
      .toBe(RATING_FIELD_TYPE_ID);
    const ratingColumnId = readManifest(seeded.root).tables[0]?.columns[2]?.id ?? '';
    await expect(page.getByTestId(`column-row-${ratingColumnId}`)).toHaveAttribute(
      'data-field-type',
      RATING_FIELD_TYPE_ID,
    );
    await page.screenshot({ path: testInfo.outputPath('t6.2-rating.png') });
  });

  test('keeps the rating controls keyboard reachable at 200% zoom', async ({
    page,
    electronApp,
  }, testInfo) => {
    await seedWorkspace(page, testInfo, {
      name: 'Plugin Zoom',
      tableId: 'tbl_plugin_zoom',
      viewId: 'viw_plugin_zoom',
      columns: [ID_COLUMN],
      rows: [],
    });
    await openWorkspace(page, 'Plugin Zoom');
    await setZoom200(electronApp, page);

    await page.getByTestId('column-add').focus();
    await page.keyboard.press('Enter');
    const form = page.getByRole('dialog', { name: '新增列' });
    await expect(form).toBeVisible();

    await form.getByLabel('显示名称').fill('Stars');
    await form.getByLabel('存储类型').focus();
    await page.keyboard.press('ArrowDown');
    await expect(form.getByLabel('存储类型')).toHaveValue('number');
    const fieldType = form.getByTestId('column-form-field-type');
    await expect(fieldType).toBeVisible();
    await fieldType.focus();
    await page.keyboard.press('ArrowDown');
    await expect(fieldType).toHaveValue(RATING_FIELD_TYPE_ID);
    await page.keyboard.press('Tab');
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth + 1));
    await page.keyboard.press('Escape');
    await expect(form).toHaveCount(0);
  });
});

test.describe('T6.2 points importer', () => {
  test.use({ importFile: 'points.json' });

  test('lists the sample importer and imports points through it', async ({ page }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Plugin Import',
      tableId: 'tbl_plugin_import',
      viewId: 'viw_plugin_import',
      columns: [
        {
          id: 'col_label',
          key: 'label',
          label: 'Label',
          type: 'text',
          role: 'none',
          required: true,
        },
        { id: 'col_x', key: 'x', label: 'X', type: 'number', role: 'x' },
        { id: 'col_y', key: 'y', label: 'Y', type: 'number', role: 'y' },
      ],
      rows: [],
    });
    prepareImportFile('points.json');
    await openWorkspace(page, 'Plugin Import');
    await page.getByRole('button', { name: '导入 Plugin Import' }).click();
    await expect(page.getByRole('dialog', { name: '导入数据' })).toBeVisible();

    // The builtin JSON parser runs first; selecting the plugin importer replaces
    // its preview with the plugin dataset (decoded and parsed in the renderer).
    const importer = page.getByTestId('import-importer');
    await expect(importer.locator('option', { hasText: 'Points JSON' })).toHaveCount(1);
    await importer.selectOption(POINTS_IMPORTER_ID);
    await expect(page.getByTestId('import-step-file')).toContainText('Points JSON');
    await expect(page.getByTestId('import-encoding')).toBeDisabled();

    await clickNext(page);
    await expect(page.getByTestId('import-step-preview')).toBeVisible();
    await expect(page.getByTestId('import-step-preview')).toContainText('共 2 行数据');
    await expect(page.locator('.cs-import-preview thead th')).toHaveText(['x', 'y', 'label']);
    await page.screenshot({ path: testInfo.outputPath('t6.2-importer.png') });

    await clickNext(page);
    await expect(page.getByTestId('import-mapping-0')).toHaveValue('existing:col_x');
    await expect(page.getByTestId('import-mapping-2')).toHaveValue('existing:col_label');
    await page.getByTestId('import-validate').click();
    await expect(page.getByTestId('import-stat-total')).toContainText('2');
    await expect(page.getByTestId('import-stat-accepted')).toContainText('2');

    await clickNext(page);
    await page.getByTestId('import-commit').click();

    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '3');
    await expect
      .poll(() => readValues(seeded))
      .toEqual([
        ['a', 1, 2],
        ['b', 2, 4],
      ]);
    await expect(page.getByTestId('grid-cell-0-0')).toHaveText('a');
    await expect(page.getByTestId('grid-cell-1-2')).toHaveText('4');
  });
});
