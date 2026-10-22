import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';
import { prepareImportFile } from './import-fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';
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

const COLUMNS: Column[] = [
  { id: 'col_id', key: 'id', label: 'ID', type: 'text', role: 'none', required: true },
  { id: 'col_name', key: 'name', label: 'Name', type: 'text', role: 'label' },
  { id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' },
  { id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'x' },
  { id: 'col_active', key: 'active', label: 'Active', type: 'boolean', role: 'none' },
  { id: 'col_site', key: 'site', label: 'Site', type: 'text', role: 'series' },
];

async function seedWorkspace(
  page: Page,
  testInfo: TestInfo,
  spec: SeedSpec,
): Promise<SeededWorkspace> {
  const parent = testInfo.outputPath(`import-parent-${spec.tableId}`);
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
      const view = {
        id: seed.viewId,
        kind: 'table' as const,
        refId: seed.tableId,
        title: seed.name,
        tableView,
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
        views: [view],
        layout: { type: 'pane', viewIds: [seed.viewId], activeViewId: seed.viewId },
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const jsonl = `${seed.rows
        .map((values, index) => JSON.stringify({ id: `row_${String(index + 1)}`, v: values }))
        .join('\n')}${seed.rows.length === 0 ? '' : '\n'}`;
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId: seed.tableId,
        jsonl,
      });
      if (!tableWrite.ok) {
        throw new Error(`table write failed: ${tableWrite.error.code}`);
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

async function openWorkspace(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

async function openImportDialog(page: Page, tableName: string): Promise<void> {
  await page.getByRole('button', { name: `导入 ${tableName}` }).click();
  await expect(page.getByRole('dialog', { name: '导入数据' })).toBeVisible();
}

async function clickNext(page: Page): Promise<void> {
  await page.getByTestId('import-next').click();
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function readManifest(path: string): WorkspaceManifest {
  return JSON.parse(read(path)) as WorkspaceManifest;
}

async function setZoom200(electronApp: ElectronApplication, page: Page): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(2);
  });
  await page.waitForFunction(() => window.innerWidth < 800);
}

test.describe('T2.5 import UI', () => {
  test.use({ importFile: 'gbk-100k.csv' });

  test('imports 100k GBK semicolon rows, skips 3 bad rows and exports their CSV', async ({
    page,
    userDataDir,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Import 100k',
      tableId: 'tbl_import_100k',
      viewId: 'viw_import_100k',
      columns: COLUMNS,
      rows: [],
    });
    prepareImportFile('gbk-100k.csv');
    await openWorkspace(page, 'Import 100k');
    await openImportDialog(page, 'Import 100k');

    await expect(page.getByTestId('import-detected-encoding')).toContainText('GB18030');
    await clickNext(page);
    await expect(page.getByTestId('import-step-preview')).toBeVisible();
    await expect(page.getByText(/100000 行数据/)).toBeVisible();
    await expect(page.getByTestId('import-delimiter')).toHaveValue(';');
    await expect(page.getByTestId('import-header')).toBeChecked();
    await expect(page.locator('.cs-import-preview tbody tr')).toHaveCount(20);

    await clickNext(page);
    await expect(page.getByTestId('import-step-mapping')).toBeVisible();
    await expect(page.getByTestId('import-mapping-0')).toHaveValue('existing:col_id');
    await expect(page.getByTestId('import-mapping-4')).toHaveValue('existing:col_active');
    await page.getByTestId('import-validate').click();

    await expect(page.getByTestId('import-step-validation')).toBeVisible();
    await expect(page.getByTestId('import-stat-total')).toContainText('100000');
    await expect(page.getByTestId('import-stat-accepted')).toContainText('99997');
    await expect(page.getByTestId('import-stat-skipped')).toContainText('3');
    await expect(page.getByTestId('import-issues').locator('li')).toHaveCount(5);

    await page.getByTestId('import-export-errors').click();
    const exported = join(userDataDir, 'import-errors.csv');
    await expect
      .poll(() => {
        try {
          return readFileSync(exported, 'utf8').split('\r\n').filter(Boolean).length;
        } catch {
          return 0;
        }
      })
      .toBe(4);
    expect(read(exported).startsWith('\uFEFF')).toBe(true);

    await page.getByTestId('import-skip').check();
    await expect(page.getByTestId('import-next')).toBeEnabled();
    await clickNext(page);
    await expect(page.getByTestId('import-step-commit')).toBeVisible();
    await expect(page.getByTestId('import-commit')).toBeEnabled();

    const started = Date.now();
    await page.getByTestId('import-commit').click();
    await expect(page.getByTestId('import-step-commit')).toHaveCount(0);
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '99998', {
      timeout: 10_000,
    });
    expect(Date.now() - started).toBeLessThan(8_000);
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');

    await expect.poll(() => readManifest(seeded.manifestPath).tables[0]?.rowCount).toBe(99997);
    const imports = readdirSync(join(seeded.root, 'imports'));
    expect(imports.some((name) => name.endsWith('.csv'))).toBe(true);
    expect(imports.some((name) => name.endsWith('.json'))).toBe(true);

    await page.getByRole('button', { name: '关闭工作区' }).click();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('recent-workspace').filter({ hasText: 'Import 100k' }).first().click();
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '99998');
  });
});

test.describe('T2.5 encoding override', () => {
  test.use({ importFile: 'gbk-small.csv' });

  test('warns on manual UTF-8 then decodes with GB18030', async ({ page }, testInfo) => {
    await seedWorkspace(page, testInfo, {
      name: 'Import GBK',
      tableId: 'tbl_import_gbk',
      viewId: 'viw_import_gbk',
      columns: COLUMNS.slice(0, 2),
      rows: [],
    });
    prepareImportFile('gbk-small.csv');
    await openWorkspace(page, 'Import GBK');
    await openImportDialog(page, 'Import GBK');

    await expect(page.getByTestId('import-detected-encoding')).toContainText('GB18030');
    await page.getByTestId('import-encoding').selectOption('utf-8');
    await expect(page.getByTestId('import-encoding-warning')).toBeVisible();
    await page.getByTestId('import-encoding').selectOption('gb18030');
    await expect(page.getByTestId('import-encoding-warning')).toHaveCount(0);
    await clickNext(page);
    await expect(page.locator('.cs-import-preview tbody')).toContainText('你好');
    await page.getByTestId('import-cancel').click();
    await expect(page.getByRole('dialog', { name: '导入数据' })).toHaveCount(0);
  });
});

test.describe('T2.5 cancel and limits', () => {
  test.use({ importFile: 'rows-150k.csv' });

  test('cancels a 150k import without touching memory or disk', async ({ page }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Import Cancel',
      tableId: 'tbl_import_cancel',
      viewId: 'viw_import_cancel',
      columns: COLUMNS.slice(0, 2),
      rows: [['old', 'Old']],
    });
    prepareImportFile('rows-150k.csv');
    await openWorkspace(page, 'Import Cancel');
    const beforeTable = read(seeded.jsonlPath);
    const beforeManifest = read(seeded.manifestPath);
    await openImportDialog(page, 'Import Cancel');
    await clickNext(page);
    await clickNext(page);
    await page.getByTestId('import-validate').click();
    await expect(page.getByTestId('import-step-validation')).toBeVisible();
    await clickNext(page);
    await expect(page.getByTestId('import-step-commit')).toBeVisible();
    await expect(page.getByTestId('import-large-confirm')).toBeVisible();
    await expect(page.getByTestId('import-commit')).toBeDisabled();
    await page.getByTestId('import-large-confirm').check();
    await expect(page.getByTestId('import-commit')).toBeEnabled();
    await page.getByTestId('import-cancel').click();
    await expect(page.getByRole('dialog', { name: '导入数据' })).toHaveCount(0);
    expect(read(seeded.jsonlPath)).toBe(beforeTable);
    expect(read(seeded.manifestPath)).toBe(beforeManifest);
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '2');
  });
});

test.describe('T2.5 JSON replace, backup, archive and undo', () => {
  test.use({ importFile: 'points.json' });

  test('replaces rows, backs up the old file, archives the source and is undoable', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Import Replace',
      tableId: 'tbl_import_replace',
      viewId: 'viw_import_replace',
      columns: [
        COLUMNS[0] as Column,
        { id: 'col_x', key: 'x', label: 'X', type: 'number', role: 'x' },
        { id: 'col_y', key: 'y', label: 'Y', type: 'number', role: 'y' },
        { id: 'col_label', key: 'label', label: 'Label', type: 'text', role: 'label' },
      ],
      rows: [['old', 1, 1, 'old']],
    });
    prepareImportFile('points.json');
    await openWorkspace(page, 'Import Replace');
    await openImportDialog(page, 'Import Replace');
    await clickNext(page);
    await clickNext(page);
    await page.getByTestId('import-validate').click();
    await expect(page.getByTestId('import-next')).toBeEnabled();
    await clickNext(page);

    await page.getByTestId('import-mode-replace').check();
    await expect(page.getByTestId('import-replace-confirm')).toBeVisible();
    await page.getByTestId('import-replace-confirm').check();
    await expect(page.getByTestId('import-commit')).toBeEnabled();
    await page.getByTestId('import-commit').click();
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '3');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');

    const backups = readdirSync(join(seeded.root, 'backups'));
    const tableBackups = backups.filter((name) => name.includes('tbl_import_replace'));
    expect(tableBackups.length).toBeGreaterThan(0);
    const backupContent = tableBackups
      .map((name) => read(join(seeded.root, 'backups', name)))
      .join('\n');
    expect(backupContent).toContain('"old"');
    const imports = readdirSync(join(seeded.root, 'imports'));
    expect(imports.some((name) => name.endsWith('.json'))).toBe(true);
    const sidecar = imports.find((name) => name.endsWith('.json.json'));
    expect(sidecar).toBeDefined();
    if (sidecar !== undefined) {
      expect(JSON.parse(read(join(seeded.root, 'imports', sidecar)))).toMatchObject({
        format: 'json',
        mode: 'replace',
        copied: true,
      });
    }

    await page.keyboard.press('Control+z');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '2');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '3');
  });
});

test.describe('T2.5 200k limit', () => {
  test.use({ importFile: 'rows-200001.csv' });

  test('rejects a final table above 200,000 rows before dispatch', async ({ page }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Import Limit',
      tableId: 'tbl_import_limit',
      viewId: 'viw_import_limit',
      columns: COLUMNS.slice(0, 2),
      rows: [['old', 'Old']],
    });
    prepareImportFile('rows-200001.csv');
    await openWorkspace(page, 'Import Limit');
    const before = read(seeded.jsonlPath);
    await openImportDialog(page, 'Import Limit');
    await clickNext(page);
    await clickNext(page);
    await page.getByTestId('import-validate').click();
    await expect(page.getByRole('alert')).toContainText('200,000');
    await expect(page.getByTestId('import-commit')).toHaveCount(0);
    expect(read(seeded.jsonlPath)).toBe(before);
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '2');
  });
});

test.describe('T2.5 accessibility', () => {
  test.use({ importFile: 'points.json' });

  test('keeps the import controls keyboard reachable at 200% zoom', async ({
    page,
    electronApp,
  }, testInfo) => {
    await seedWorkspace(page, testInfo, {
      name: 'Import Zoom',
      tableId: 'tbl_import_zoom',
      viewId: 'viw_import_zoom',
      columns: COLUMNS.slice(0, 2),
      rows: [],
    });
    prepareImportFile('points.json');
    await openWorkspace(page, 'Import Zoom');
    await setZoom200(electronApp, page);
    await openImportDialog(page, 'Import Zoom');

    await page.getByTestId('import-next').focus();
    await page.keyboard.press('Tab');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '导入数据' })).toHaveCount(0);
  });
});
