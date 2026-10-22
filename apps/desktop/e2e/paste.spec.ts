import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

/**
 * T2.4 — clipboard paste, appending, new-column confirmation, cancellation and
 * one-step undo. Every scenario seeds a real workspace through `window.api` and
 * asserts both the rendered grid and the files on disk.
 */

type Column = WorkspaceManifest['tables'][number]['columns'][number];
type TableView = NonNullable<WorkspaceManifest['views'][number]['tableView']>;
type Filter = NonNullable<TableView['filter']>;
type Cell = string | number | boolean | null;

interface SeedSpec {
  name: string;
  tableId: string;
  viewId: string;
  tableName: string;
  columns: Column[];
  primaryKey: string;
  rows: Cell[][];
  filter?: Filter;
}

interface SeededWorkspace {
  root: string;
  jsonlPath: string;
  manifestPath: string;
}

async function seedWorkspace(
  page: Page,
  testInfo: TestInfo,
  spec: SeedSpec,
): Promise<SeededWorkspace> {
  const parent = testInfo.outputPath(`paste-parent-${spec.tableId}`);
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
        ...(seed.filter === undefined ? {} : { filter: seed.filter }),
        frozenColumnCount: 1,
      };
      const view = {
        id: seed.viewId,
        kind: 'table' as const,
        refId: seed.tableId,
        title: seed.tableName,
        tableView,
      };
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
        views: [view],
        layout: { type: 'pane', viewIds: [seed.viewId], activeViewId: seed.viewId },
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
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
      tableName: spec.tableName,
      columns: spec.columns,
      primaryKey: spec.primaryKey,
      rows: spec.rows,
      ...(spec.filter === undefined ? {} : { filter: spec.filter }),
    },
  );

  const root = join(parent, `${spec.name}.cstudio`);
  return {
    root,
    jsonlPath: join(root, 'tables', `${spec.tableId}.jsonl`),
    manifestPath: join(root, 'manifest.json'),
  };
}

async function openSeededWorkspace(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

function cell(page: Page, row: number, col: number) {
  return page.getByTestId(`grid-cell-${String(row)}-${String(col)}`);
}

async function focusCell(page: Page, row = 0, col = 0): Promise<void> {
  await cell(page, row, col).click();
}

/** Dispatches a real `paste` ClipboardEvent with text/plain on the active cell. */
async function pasteText(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const active = document.querySelector<HTMLElement>('[data-active="true"]');
    if (active === null) {
      throw new Error('No active grid cell to paste into.');
    }
    const data = new DataTransfer();
    data.setData('text/plain', value);
    active.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
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

test.describe('T2.4 region paste', () => {
  test('pastes a 5x4 Excel matrix with quotes and newlines and persists it', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Paste Matrix',
      tableId: 'tbl_paste_matrix',
      viewId: 'viw_paste_matrix',
      tableName: 'Matrix',
      columns: [
        ID_COLUMN,
        column({ id: 'col_name', key: 'name', label: 'Name', role: 'label' }),
        column({
          id: 'col_amount',
          key: 'amount',
          label: 'Amount',
          type: 'number',
          role: 'y',
          precision: 2,
        }),
        column({ id: 'col_day', key: 'day', label: 'Day', type: 'date', role: 'x' }),
      ],
      primaryKey: 'col_id',
      rows: [
        ['r1', 'First', 1, null],
        ['r2', 'Second', 2, null],
        ['r3', 'Third', 3, null],
      ],
    });
    await openSeededWorkspace(page, 'Paste Matrix');
    await focusCell(page);

    const matrix = [
      'alpha\t"Hello, world"\t1,234.5\t2026-02-03',
      'beta\t"Line1\nLine2"\t20\t2026-01-02',
      'gamma\t"Say ""hi"""\t30\t2026-01-03',
      'delta\tDelta\t40\t2026-01-04',
      'epsilon\tEpsilon\t50\t2026-01-05',
    ].join('\r\n');
    await pasteText(page, matrix);

    await expect(cell(page, 0, 1)).toHaveText('Hello, world');
    await expect(cell(page, 0, 2)).toHaveText('1,234.50');
    await expect(cell(page, 1, 1)).toContainText('Line1');
    await expect(cell(page, 3, 0)).toHaveText('delta');
    await expect(cell(page, 4, 0)).toHaveText('epsilon');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');

    await expect.poll(() => read(seeded.jsonlPath)).toContain('"Line1\\nLine2"');
    const jsonl = read(seeded.jsonlPath);
    expect(jsonl).toContain('"Say \\"hi\\""');
    expect(jsonl).toContain('1234.5');
    expect(jsonl.split('\n').filter((line) => line.trim().length > 0)).toHaveLength(5);

    await page.getByRole('button', { name: '关闭工作区' }).click();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('recent-workspace').filter({ hasText: 'Paste Matrix' }).first().click();
    await expect(page.getByTestId('data-grid')).toBeVisible();
    await expect(cell(page, 0, 1)).toHaveText('Hello, world');
    await expect(cell(page, 1, 1)).toContainText('Line2');
    await expect(cell(page, 4, 0)).toHaveText('epsilon');
  });

  test('rejects type errors as a whole batch, locates the cell and leaves disk untouched', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Paste Error',
      tableId: 'tbl_paste_error',
      viewId: 'viw_paste_error',
      tableName: 'Errors',
      columns: [
        ID_COLUMN,
        column({ id: 'col_name', key: 'name', label: 'Name', role: 'label' }),
        column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number', role: 'y' }),
      ],
      primaryKey: 'col_id',
      rows: [
        ['r1', 'First', 1],
        ['r2', 'Second', 2],
      ],
    });
    await openSeededWorkspace(page, 'Paste Error');
    await focusCell(page);
    const before = read(seeded.jsonlPath);

    await pasteText(page, 'alpha\tAlpha\tnot-a-number');

    const dialog = page.getByTestId('paste-error-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('第 1 行 · 列 Amount：类型不匹配');
    await page.getByTestId('paste-locate-error').click();
    await expect(dialog).toHaveCount(0);
    await expect(cell(page, 0, 2)).toHaveClass(/cs-grid__cell--paste-error/);

    // Nothing was dispatched: neither the table file nor a manifest row count changed.
    expect(read(seeded.jsonlPath)).toBe(before);
    expect(readManifest(seeded.manifestPath).tables[0]?.rowCount).toBe(2);
  });

  test('confirms new columns, applies the matrix and keeps the schema after reopen', async ({
    page,
  }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Paste Columns',
      tableId: 'tbl_paste_columns',
      viewId: 'viw_paste_columns',
      tableName: 'Columns',
      columns: [ID_COLUMN, column({ id: 'col_name', key: 'name', label: 'Name', role: 'label' })],
      primaryKey: 'col_id',
      rows: [['r1', 'First']],
    });
    await openSeededWorkspace(page, 'Paste Columns');
    await focusCell(page);

    await pasteText(page, ['alpha\tAlpha\t7', 'beta\tBeta\t8'].join('\n'));

    const columnsDialog = page.getByTestId('paste-columns-dialog');
    await expect(columnsDialog).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('粘贴需要新增 1 列');
    await page.getByTestId('paste-column-label-0').fill('Score');
    await page.getByTestId('paste-column-type-0').selectOption('number');
    await page.getByTestId('paste-columns-confirm').click();

    await expect(page.getByRole('grid')).toHaveAttribute('aria-colcount', '3');
    await expect(cell(page, 0, 2)).toHaveText('7');
    await expect(cell(page, 1, 0)).toHaveText('beta');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');
    await expect
      .poll(() => readManifest(seeded.manifestPath).tables[0]?.columns.map((entry) => entry.key))
      .toEqual(['id', 'name', 'score']);
    expect(readManifest(seeded.manifestPath).tables[0]?.rowCount).toBe(2);
    expect(read(seeded.jsonlPath)).toContain('"alpha","Alpha",7');

    await page.getByRole('button', { name: '关闭工作区' }).click();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('recent-workspace').filter({ hasText: 'Paste Columns' }).first().click();
    await expect(page.getByTestId('data-grid')).toBeVisible();
    await expect(page.getByTestId('data-grid')).toContainText('Score');
    await expect(cell(page, 0, 2)).toHaveText('7');
  });

  test('cancels a 10k-cell paste without changing memory or disk', async ({ page }, testInfo) => {
    const columns: Column[] = [
      ID_COLUMN,
      ...Array.from({ length: 99 }, (_, index) =>
        column({
          id: `col_c${String(index)}`,
          key: `c${String(index)}`,
          label: `C${String(index)}`,
        }),
      ),
    ];
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Paste Cancel',
      tableId: 'tbl_paste_cancel',
      viewId: 'viw_paste_cancel',
      tableName: 'Cancel',
      columns,
      primaryKey: 'col_id',
      rows: [
        ['r1', ...Array<string>(99).fill('x')],
        ['r2', ...Array<string>(99).fill('x')],
      ],
    });
    await openSeededWorkspace(page, 'Paste Cancel');
    await focusCell(page);
    const before = read(seeded.jsonlPath);

    const matrix = Array.from({ length: 100 }, (_, rowIndex) =>
      [`id${String(rowIndex)}`, ...Array<string>(99).fill(`v${String(rowIndex)}`)].join('\t'),
    ).join('\n');

    // Make the chunk yields slow (like a busy machine) so the cancel window is
    // deterministic; this changes only the test page's timers, not the app.
    await page.evaluate(() => {
      const original = window.setTimeout.bind(window);
      const testWindow = window as Window & { __restorePasteTimers?: () => void };
      testWindow.__restorePasteTimers = () => {
        window.setTimeout = original;
      };
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        original(handler, timeout === 0 ? 200 : timeout, ...args)) as typeof window.setTimeout;
    });

    await pasteText(page, matrix);

    const progress = page.getByTestId('paste-progress-dialog');
    await expect(progress).toBeVisible();
    await page.getByTestId('paste-progress-cancel').click();
    await expect(progress).toHaveCount(0);
    await page.evaluate(() => {
      (window as Window & { __restorePasteTimers?: () => void }).__restorePasteTimers?.();
    });

    await page.waitForTimeout(300);
    expect(read(seeded.jsonlPath)).toBe(before);
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '3');
  });

  test('undoes and redoes a whole paste as one history entry', async ({ page }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Paste Undo',
      tableId: 'tbl_paste_undo',
      viewId: 'viw_paste_undo',
      tableName: 'Undo',
      columns: [
        ID_COLUMN,
        column({ id: 'col_name', key: 'name', label: 'Name', role: 'label' }),
        column({ id: 'col_amount', key: 'amount', label: 'Amount', type: 'number', role: 'y' }),
      ],
      primaryKey: 'col_id',
      rows: [['r1', 'First', 1]],
    });
    await openSeededWorkspace(page, 'Paste Undo');
    await focusCell(page);

    await pasteText(page, ['alpha\tAlpha\t7', 'beta\tBeta\t8'].join('\n'));
    await expect(cell(page, 1, 0)).toHaveText('beta');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');
    await expect.poll(() => read(seeded.jsonlPath).trim().split('\n')).toHaveLength(2);

    await page.keyboard.press('Control+z');
    await expect(page.getByRole('grid')).toHaveAttribute('aria-rowcount', '2');
    await expect(cell(page, 0, 0)).toHaveText('r1');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');
    await expect.poll(() => read(seeded.jsonlPath).trim().split('\n')).toHaveLength(1);

    await page.keyboard.press('Control+Shift+z');
    await expect(cell(page, 1, 0)).toHaveText('beta');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');
    await expect.poll(() => read(seeded.jsonlPath).trim().split('\n')).toHaveLength(2);
  });

  test('rejects every paste while a view filter is active', async ({ page }, testInfo) => {
    const seeded = await seedWorkspace(page, testInfo, {
      name: 'Paste Filter',
      tableId: 'tbl_paste_filter',
      viewId: 'viw_paste_filter',
      tableName: 'Filter',
      columns: [ID_COLUMN, column({ id: 'col_name', key: 'name', label: 'Name', role: 'label' })],
      primaryKey: 'col_id',
      rows: [['r1', 'Keep']],
      filter: { kind: 'compare', columnId: 'col_name', op: 'eq', value: 'Keep' },
    });
    await openSeededWorkspace(page, 'Paste Filter');
    await focusCell(page);
    const before = read(seeded.jsonlPath);

    await pasteText(page, 'alpha\tAlpha');

    const dialog = page.getByRole('dialog', { name: '筛选激活时无法粘贴' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('隐藏行不会被修改');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(read(seeded.jsonlPath)).toBe(before);
  });

  test('keeps the paste confirmation keyboard reachable at 200% zoom', async ({
    page,
    electronApp,
  }, testInfo) => {
    await seedWorkspace(page, testInfo, {
      name: 'Paste Zoom',
      tableId: 'tbl_paste_zoom',
      viewId: 'viw_paste_zoom',
      tableName: 'Zoom',
      columns: [ID_COLUMN, column({ id: 'col_name', key: 'name', label: 'Name', role: 'label' })],
      primaryKey: 'col_id',
      rows: [['r1', 'First']],
    });
    await openSeededWorkspace(page, 'Paste Zoom');
    await focusCell(page);
    await setZoom200(electronApp, page);

    await pasteText(page, 'alpha\tAlpha\t7');
    const dialog = page.getByTestId('paste-columns-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('paste-column-label-0').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('paste-columns-confirm')).toBeFocused();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
