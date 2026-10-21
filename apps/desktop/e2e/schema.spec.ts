import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

/**
 * T2.3 — column management, structural changes and runtime row migration.
 *
 * Every scenario seeds a real workspace through `window.api`, reloads the
 * renderer and then drives the Inspector column panel. Disk assertions use
 * `expect.poll` because the table/manifest writes are asynchronous.
 */

type Column = WorkspaceManifest['tables'][number]['columns'][number];
type TableView = NonNullable<WorkspaceManifest['views'][number]['tableView']>;
type ChartMapping = WorkspaceManifest['charts'][number]['mapping'];
type Cell = string | number | boolean | null;

interface SeedSpec {
  name: string;
  tableId: string;
  viewId: string;
  tableName: string;
  columns: Column[];
  primaryKey: string;
  rows: Cell[][];
  tableView?: Partial<TableView>;
  chart?: {
    id: string;
    viewId: string;
    title: string;
    mapping: ChartMapping;
  };
}

interface SeededWorkspace {
  root: string;
  tableId: string;
  viewId: string;
}

async function seedWorkspace(
  page: Page,
  testInfo: TestInfo,
  spec: SeedSpec,
): Promise<SeededWorkspace> {
  const parent = testInfo.outputPath(`schema-parent-${spec.tableId}`);
  const result = await page.evaluate(
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
        columnOrder: seed.tableView?.columnOrder ?? seed.columns.map((column) => column.id),
        widths: seed.tableView?.widths ?? {},
        hiddenColumnIds: seed.tableView?.hiddenColumnIds ?? [],
        sort: seed.tableView?.sort ?? [],
        ...(seed.tableView?.filter === undefined ? {} : { filter: seed.tableView.filter }),
        frozenColumnCount: seed.tableView?.frozenColumnCount ?? 1,
      };
      const views: WorkspaceManifest['views'] = [
        {
          id: seed.viewId,
          kind: 'table',
          refId: seed.tableId,
          title: seed.tableName,
          tableView,
        },
      ];
      const charts: WorkspaceManifest['charts'] = [];
      if (seed.chart !== undefined) {
        views.push({
          id: seed.chart.viewId,
          kind: 'chart',
          refId: seed.chart.id,
          title: seed.chart.title,
        });
        charts.push({
          id: seed.chart.id,
          title: seed.chart.title,
          kind: 'line',
          tableId: seed.tableId,
          mapping: seed.chart.mapping,
          sort: [],
          options: {
            smooth: false,
            showSymbol: true,
            lineWidth: 2,
            paletteId: 'default',
            background: 'auto',
            showGrid: true,
            legend: 'top',
            yStartAtZero: false,
            numberDigits: 1,
            sampling: { enabled: true, threshold: 2000, target: 1000 },
          },
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      const next: WorkspaceManifest = {
        ...manifest,
        updatedAt: timestamp,
        tables: [
          {
            id: seed.tableId,
            name: seed.tableName,
            file: `tables/${seed.tableId}.jsonl`,
            schemaVersion: 1,
            columns: seed.columns,
            primaryKey: seed.primaryKey,
            rowCount: seed.rows.length,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        charts,
        views,
        layout: {
          type: 'pane',
          viewIds: views.map((view) => view.id),
          activeViewId: seed.viewId,
        },
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      if (seed.rows.length > 0) {
        const jsonl = `${seed.rows
          .map((values, index) => JSON.stringify({ id: `row_${String(index + 1)}`, v: values }))
          .join('\n')}\n`;
        const tableWrite = await api.table.write({
          workspaceId: manifest.id,
          tableId: seed.tableId,
          jsonl,
        });
        if (!tableWrite.ok) {
          throw new Error(`table write failed: ${tableWrite.error.code}`);
        }
      }
      const closed = await api.workspace.close({ workspaceId: manifest.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
      return { workspaceId: manifest.id };
    },
    { ...spec, parent },
  );
  void result;

  const root = join(parent, `${spec.name}.cstudio`);
  if (spec.rows.length > 0) {
    const jsonlPath = join(root, 'tables', `${spec.tableId}.jsonl`);
    expect(readFileSync(jsonlPath, 'utf8').trim().split('\n')).toHaveLength(spec.rows.length);
  }
  return { root, tableId: spec.tableId, viewId: spec.viewId };
}

async function openSeededWorkspace(page: Page, name: string, expectGrid = true): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('workspace-view')).toBeVisible();
  if (expectGrid) {
    await expect(page.getByTestId('data-grid')).toBeVisible();
  }
}

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

function readJsonl(root: string, tableId: string): string {
  return readFileSync(join(root, 'tables', `${tableId}.jsonl`), 'utf8');
}

async function setZoom200(electronApp: ElectronApplication, page: Page): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(2);
  });
  await page.waitForFunction(() => window.innerWidth < 800);
}

const ID_COLUMN: Column = {
  id: 'col_id',
  key: 'id',
  label: 'ID',
  type: 'text',
  role: 'none',
  required: true,
};

function column(overrides: Partial<Column> & Pick<Column, 'id' | 'key' | 'label'>): Column {
  return { type: 'text', role: 'none', ...overrides };
}

test.describe('T2.3 column management', () => {
  test('adds a column, fills null into existing rows and persists it', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Schema Add',
      tableId: 'tbl_schema_add',
      viewId: 'viw_schema_add',
      tableName: 'Readings',
      columns: [
        ID_COLUMN,
        column({ id: 'col_label', key: 'label', label: 'Label' }),
        column({ id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' }),
      ],
      primaryKey: 'col_id',
      rows: [
        ['a', 'first', 1],
        ['b', 'second', 2],
        ['c', 'third', 3],
      ],
    });
    await openSeededWorkspace(page, 'Schema Add');

    await expect(page.getByTestId('columns-panel')).toBeVisible();
    await page.getByTestId('column-add').click();
    const dialog = page.getByRole('dialog', { name: '新增列' });
    await dialog.getByLabel('显示名称').fill('Note');
    await expect(dialog.getByLabel('Key')).toHaveValue('note');
    await dialog.getByRole('button', { name: '添加列' }).click();

    await expect(page.getByTestId('columns-panel')).toContainText('Note');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-colcount', '4');
    await expect
      .poll(() => readManifest(seeded.root).tables[0]?.columns.map((entry) => entry.key))
      .toEqual(['id', 'label', 'value', 'note']);
    await expect
      .poll(() => {
        const lines = readJsonl(seeded.root, seeded.tableId).trim().split('\n');
        return lines.map((line) => (JSON.parse(line) as { v: Cell[] }).v.at(-1));
      })
      .toEqual([null, null, null]);

    await openSeededWorkspace(page, 'Schema Add');
    await expect(page.getByTestId('columns-panel')).toContainText('Note');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-colcount', '4');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '4');
  });

  test('converts a text column to numbers and reloads with the new type', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Schema Convert',
      tableId: 'tbl_schema_convert',
      viewId: 'viw_schema_convert',
      tableName: 'Readings',
      columns: [ID_COLUMN, column({ id: 'col_amount', key: 'amount', label: 'Amount', role: 'y' })],
      primaryKey: 'col_id',
      rows: [
        ['a', '10'],
        ['b', '20.5'],
        ['c', '30'],
      ],
    });
    await openSeededWorkspace(page, 'Schema Convert');

    await page.getByRole('button', { name: '编辑列 Amount' }).click();
    const form = page.getByRole('dialog', { name: '编辑列' });
    await form.getByLabel('存储类型').selectOption('number');
    await form.getByRole('button', { name: '保存列' }).click();

    const confirm = page.getByRole('dialog', { name: '修改列“Amount”？' });
    await expect(confirm).toContainText('需转换单元格：3');
    await confirm.getByTestId('column-change-confirm').click();

    await expect.poll(() => readManifest(seeded.root).tables[0]?.columns[1]?.type).toBe('number');
    await expect
      .poll(() =>
        readJsonl(seeded.root, seeded.tableId)
          .trim()
          .split('\n')
          .map((line) => (JSON.parse(line) as { v: Cell[] }).v[1]),
      )
      .toEqual([10, 20.5, 30]);

    await openSeededWorkspace(page, 'Schema Convert');
    await expect(page.getByTestId('column-row-col_amount')).toContainText('数字');
    await expect(page.getByTestId('grid-cell-0-1')).toHaveText('10');
  });

  test('reports every failed conversion and leaves both files byte-identical', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Schema Convert Fail',
      tableId: 'tbl_schema_fail',
      viewId: 'viw_schema_fail',
      tableName: 'Readings',
      columns: [ID_COLUMN, column({ id: 'col_label', key: 'label', label: 'Label' })],
      primaryKey: 'col_id',
      rows: [
        ['a', 'abc'],
        ['b', 'def'],
      ],
    });
    await openSeededWorkspace(page, 'Schema Convert Fail');

    const manifestPath = join(seeded.root, 'manifest.json');
    const jsonlPath = join(seeded.root, 'tables', `${seeded.tableId}.jsonl`);
    const manifestBefore = readFileSync(manifestPath, 'utf8');
    const jsonlBefore = readFileSync(jsonlPath, 'utf8');

    await page.getByRole('button', { name: '编辑列 Label' }).click();
    const form = page.getByRole('dialog', { name: '编辑列' });
    await form.getByLabel('存储类型').selectOption('number');
    await form.getByRole('button', { name: '保存列' }).click();

    const confirm = page.getByRole('dialog', { name: '无法修改列“Label”' });
    await expect(confirm).toContainText('无法转换的行（显示前 2 行，共 2 行）');
    await expect(confirm.getByTestId('column-change-failures').locator('li')).toHaveCount(2);
    await expect(confirm.getByTestId('column-change-confirm')).toBeDisabled();
    await confirm.getByRole('button', { name: '取消' }).click();

    expect(readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
    expect(readFileSync(jsonlPath, 'utf8')).toBe(jsonlBefore);
    await expect(page.getByTestId('column-row-col_label')).toContainText('文本');
  });

  test('deletes a column, cleans view state and shows the chart error state', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Schema Delete',
      tableId: 'tbl_schema_delete',
      viewId: 'viw_schema_delete',
      tableName: 'Readings',
      columns: [
        ID_COLUMN,
        column({ id: 'col_time', key: 'time', label: 'Time', type: 'date', role: 'x' }),
        column({ id: 'col_value', key: 'value', label: 'Value', type: 'number', role: 'y' }),
        column({ id: 'col_note', key: 'note', label: 'Note' }),
      ],
      primaryKey: 'col_id',
      rows: [
        ['a', 1_767_225_600_000, 10, 'first'],
        ['b', 1_767_225_660_000, 20, 'second'],
      ],
      tableView: {
        widths: { col_note: 180, col_value: 120 },
        hiddenColumnIds: ['col_note'],
        sort: [{ columnId: 'col_note', direction: 'asc' }],
        filter: {
          kind: 'all',
          children: [
            { kind: 'compare', columnId: 'col_note', op: 'eq', value: 'first' },
            { kind: 'compare', columnId: 'col_value', op: 'gt', value: 0 },
          ],
        },
        frozenColumnCount: 2,
      },
      chart: {
        id: 'cht_schema_delete',
        viewId: 'viw_schema_chart',
        title: 'Note chart',
        mapping: { layout: 'wide', xColumnId: 'col_note', yColumnIds: ['col_value'] },
      },
    });
    await openSeededWorkspace(page, 'Schema Delete');

    await page.getByRole('button', { name: '编辑列 Note' }).click();
    const form = page.getByRole('dialog', { name: '编辑列' });
    await form.getByTestId('column-form-delete').click();
    const confirm = page.getByRole('dialog', { name: '删除列“Note”？' });
    await expect(confirm).toContainText('将失效图表：1');
    await confirm.getByTestId('column-change-confirm').click();

    await expect.poll(() => readManifest(seeded.root).tables[0]?.columns.length).toBe(3);
    const manifest = readManifest(seeded.root);
    const tableView = manifest.views.find((view) => view.id === seeded.viewId)?.tableView;
    expect(tableView?.columnOrder).toEqual(['col_id', 'col_time', 'col_value']);
    expect(tableView?.widths).toEqual({ col_value: 120 });
    expect(tableView?.hiddenColumnIds).toEqual([]);
    expect(tableView?.sort).toEqual([]);
    expect(tableView?.filter).toEqual({
      kind: 'all',
      children: [{ kind: 'compare', columnId: 'col_value', op: 'gt', value: 0 }],
    });
    expect(tableView?.frozenColumnCount).toBe(2);
    // The chart mapping is not rewritten automatically (SPEC §19).
    expect(manifest.charts[0]?.mapping).toEqual({
      layout: 'wide',
      xColumnId: 'col_note',
      yColumnIds: ['col_value'],
    });

    await page.getByRole('tab', { name: 'Note chart' }).click();
    const placeholder = page.getByTestId('chart-placeholder');
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText('列已删除：col_note');

    await openSeededWorkspace(page, 'Schema Delete', false);
    await expect(page.getByTestId('chart-placeholder')).toContainText('列已删除：col_note');
    await expect(page.getByTestId('workspace-view')).toBeVisible();
  });

  test('promotes a unique text column to primary key and persists it', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Schema Key',
      tableId: 'tbl_schema_key',
      viewId: 'viw_schema_key',
      tableName: 'Readings',
      columns: [ID_COLUMN, column({ id: 'col_code', key: 'code', label: 'Code' })],
      primaryKey: 'col_id',
      rows: [
        ['a', 'x'],
        ['b', 'y'],
        ['c', 'z'],
      ],
    });
    await openSeededWorkspace(page, 'Schema Key');

    await page.getByRole('button', { name: '编辑列 Code' }).click();
    await page
      .getByRole('dialog', { name: '编辑列' })
      .getByTestId('column-form-primary-key')
      .click();
    const confirm = page.getByRole('dialog', { name: '将主键改为“Code”？' });
    await confirm.getByTestId('column-change-confirm').click();

    await expect.poll(() => readManifest(seeded.root).tables[0]?.primaryKey).toBe('col_code');
    await expect.poll(() => readManifest(seeded.root).tables[0]?.columns[1]?.required).toBe(true);

    await openSeededWorkspace(page, 'Schema Key');
    await expect(page.getByTestId('column-row-col_code')).toContainText('主键');
  });

  test('refuses a primary key with duplicate values', async ({ page }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Schema Key Fail',
      tableId: 'tbl_schema_key_fail',
      viewId: 'viw_schema_key_fail',
      tableName: 'Readings',
      columns: [ID_COLUMN, column({ id: 'col_code', key: 'code', label: 'Code' })],
      primaryKey: 'col_id',
      rows: [
        ['a', 'dup'],
        ['b', 'dup'],
      ],
    });
    await openSeededWorkspace(page, 'Schema Key Fail');

    await page.getByRole('button', { name: '编辑列 Code' }).click();
    await page
      .getByRole('dialog', { name: '编辑列' })
      .getByTestId('column-form-primary-key')
      .click();
    const confirm = page.getByRole('dialog', { name: '无法修改列“Code”' });
    await expect(confirm.getByTestId('column-change-failures').locator('li')).toHaveCount(1);
    await expect(confirm.getByTestId('column-change-confirm')).toBeDisabled();
    await confirm.getByRole('button', { name: '取消' }).click();

    expect(readManifest(seeded.root).tables[0]?.primaryKey).toBe('col_id');
  });

  test('disables adding a column at the 100-column limit', async ({ page }, testInfo) => {
    const columns: Column[] = [ID_COLUMN];
    for (let index = 1; index < 100; index += 1) {
      columns.push({
        id: `col_${String(index)}`,
        key: `field_${String(index)}`,
        label: `Field ${String(index)}`,
        type: 'text',
        role: 'none',
      });
    }
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Schema Limit',
      tableId: 'tbl_schema_limit',
      viewId: 'viw_schema_limit',
      tableName: 'Readings',
      columns,
      primaryKey: 'col_id',
      rows: [],
    });
    await openSeededWorkspace(page, 'Schema Limit');

    await expect(page.getByTestId('columns-panel')).toContainText('100 列');
    await expect(page.getByTestId('column-add')).toBeDisabled();
    await expect(page.getByTestId('column-limit')).toContainText('已达 100 列上限');
    expect(readManifest(seeded.root).tables[0]?.columns).toHaveLength(100);
  });

  test('keeps the column panel keyboard reachable at 200% zoom', async ({
    page,
    electronApp,
  }, testInfo) => {
    await seedWorkspace(page, testInfo, {
      name: 'Schema Zoom',
      tableId: 'tbl_schema_zoom',
      viewId: 'viw_schema_zoom',
      tableName: 'Readings',
      columns: [ID_COLUMN, column({ id: 'col_label', key: 'label', label: 'Label' })],
      primaryKey: 'col_id',
      rows: [['a', 'first']],
    });
    await openSeededWorkspace(page, 'Schema Zoom');
    await setZoom200(electronApp, page);

    await expect(page.getByTestId('columns-panel')).toBeVisible();
    await page.getByTestId('column-add').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '新增列' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '新增列' })).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow).toBe(true);
  });
});
