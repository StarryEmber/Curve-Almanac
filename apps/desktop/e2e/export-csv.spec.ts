import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { launchCurveApp, repositoryRoot, test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Page, TestInfo } from '@playwright/test';

/**
 * T3.6 — CSV export through the real Electron app (SPEC §9.6, ADR-039).
 *
 * The first scenario proves filter/sort scope, view column order, BOM, CRLF,
 * RFC 4180 quoting and the display/raw switch. The second copies the generated
 * 100k workspace and enforces the 5s budget plus cancellation. The third covers
 * the 200% / keyboard path required for a UI task.
 */

const BENCH_WORKSPACE = join(repositoryRoot, 'bench', '.fixtures', '100k-workspace');
const BENCH_WORKSPACE_NAME = 'Bench 100k';

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
  rowsJsonl: string;
  filter?: Filter;
  sort?: TableView['sort'];
  hiddenColumnIds?: string[];
}

function jsonlRows(rows: readonly Cell[][]): string {
  return `${rows
    .map((values, index) => JSON.stringify({ id: `row_${String(index + 1)}`, v: values }))
    .join('\n')}\n`;
}

function column(overrides: Partial<Column> & Pick<Column, 'id' | 'key' | 'type'>): Column {
  return { label: overrides.key, role: 'none', ...overrides };
}

const COLUMNS: Column[] = [
  column({ id: 'col_id', key: 'id', label: 'ID', type: 'text', required: true }),
  column({ id: 'col_name', key: 'name', label: 'Name', type: 'text' }),
  column({ id: 'col_note', key: 'note', label: 'Note', type: 'text' }),
  column({ id: 'col_value', key: 'value', label: 'Value', type: 'number', precision: 1 }),
  column({ id: 'col_day', key: 'day', label: 'Day', type: 'date' }),
  column({ id: 'col_flag', key: 'flag', label: 'Flag', type: 'boolean' }),
  column({
    id: 'col_status',
    key: 'status',
    label: 'Status',
    type: 'enum',
    enumOptions: [
      { value: 'open', label: 'Open' },
      { value: 'done', label: 'Done' },
    ],
  }),
];

const DAY = Date.UTC(2023, 10, 15, 12, 0, 0);

const ROWS: Cell[][] = [
  ['r1', 'Alice, A.', 'line one\nline two', 1234.5, DAY, true, 'open'],
  ['r2', 'Bob "B"', ' padded ', 2, DAY + 86_400_000, false, 'done'],
  ['r3', '张三', null, 30, DAY + 172_800_000, true, 'open'],
  ['r4', 'excluded', 'filtered out', 1, DAY, false, 'done'],
];

async function seedWorkspace(page: Page, testInfo: TestInfo, spec: SeedSpec): Promise<string> {
  const parent = testInfo.outputPath(`export-parent-${spec.tableId}`);
  await page.evaluate(
    async (seed) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir: seed.parent, name: seed.name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      const timestamp = manifest.createdAt;
      const rowCount = seed.rowsJsonl.split('\n').filter((line) => line.trim() !== '').length;
      const tableView = {
        tableId: seed.tableId,
        styleId: 'builtin.report-light',
        columnOrder: seed.columns.map((column) => column.id),
        widths: {},
        hiddenColumnIds: seed.hiddenColumnIds,
        sort: seed.sort,
        ...(seed.filter === undefined ? {} : { filter: seed.filter }),
        frozenColumnCount: 1,
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
            rowCount,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views: [
          {
            id: seed.viewId,
            kind: 'table',
            refId: seed.tableId,
            title: seed.tableName,
            tableView,
          },
        ],
        layout: { type: 'pane', viewIds: [seed.viewId], activeViewId: seed.viewId },
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId: seed.tableId,
        jsonl: seed.rowsJsonl,
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
      rowsJsonl: spec.rowsJsonl,
      filter: spec.filter,
      sort: spec.sort ?? [],
      hiddenColumnIds: spec.hiddenColumnIds ?? [],
    },
  );
  return join(parent, `${spec.name}.cstudio`);
}

async function openWorkspace(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

async function setZoom200(
  electronApp: Awaited<ReturnType<typeof launchCurveApp>>['electronApp'],
  page: Page,
): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(2);
  });
  await page.waitForFunction(() => window.innerWidth < 800);
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function recordLines(text: string): string[] {
  return text.split('\r\n').filter((line) => line.length > 0);
}

test.describe('export-csv', () => {
  test('escapes values, follows filter/sort/view order and switches raw/display', async ({
    userDataDir,
    importDir,
  }, testInfo) => {
    const saveFile = testInfo.outputPath('export-table.csv');
    const app = await launchCurveApp({
      userDataDir,
      importFile: join(importDir, 'points.json'),
      saveFile,
    });

    try {
      await seedWorkspace(app.page, testInfo, {
        name: 'Export CSV',
        tableId: 'tbl_export_csv',
        viewId: 'viw_export_csv',
        tableName: 'Readings',
        columns: COLUMNS,
        primaryKey: 'col_id',
        rowsJsonl: jsonlRows(ROWS),
        filter: {
          kind: 'all',
          children: [{ kind: 'compare', columnId: 'col_value', op: 'gte', value: 2 }],
        },
        sort: [{ columnId: 'col_value', direction: 'desc' }],
        hiddenColumnIds: ['col_flag'],
      });
      await openWorkspace(app.page, 'Export CSV');
      await expect(app.page.getByTestId('data-grid')).toHaveAttribute('data-visible-rows', '3');

      await app.page.getByTestId('grid-export-open').click();
      const dialog = app.page.getByRole('dialog', { name: '导出 CSV' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('将导出 3 行 × 6 列。')).toBeVisible();
      await expect(dialog.getByText('1 个隐藏列不会导出。')).toBeVisible();
      const dialogShot = testInfo.outputPath('t3.6-export-dialog.png');
      await dialog.screenshot({ path: dialogShot });
      await testInfo.attach('t3.6-export-dialog', {
        path: dialogShot,
        contentType: 'image/png',
      });

      await dialog.getByRole('button', { name: '导出' }).click();
      await expect(app.page.getByTestId('export-csv-done')).toBeVisible({ timeout: 10_000 });
      await app.page.getByRole('button', { name: '关闭' }).last().click();

      const bytes = readFileSync(saveFile);
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const text = bytes.toString('utf8');
      const lines = recordLines(text);
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('\uFEFFID,Name,Note,Value,Day,Status');
      expect(text).toContain('"Alice, A."');
      expect(text).toContain('"line one\nline two"');
      expect(text).toContain('"Bob ""B"""');
      expect(text).toContain('" padded "');
      expect(text).toContain('张三');
      expect(text).toContain('"1,234.5"');
      expect(text).not.toContain(String(DAY));
      expect(text).not.toContain('r4');
      expect(text).not.toContain('Flag');
      expect(text).toContain('Open');
      expect(text).toContain('Done');
      expect(text.indexOf('r1')).toBeLessThan(text.indexOf('r3'));
      expect(text.indexOf('r3')).toBeLessThan(text.indexOf('r2'));

      await app.page.getByTestId('grid-export-open').click();
      const rawDialog = app.page.getByRole('dialog', { name: '导出 CSV' });
      await rawDialog.getByLabel('值格式', { exact: true }).selectOption('raw');
      await rawDialog.getByRole('button', { name: '导出' }).click();
      await expect(app.page.getByTestId('export-csv-done')).toBeVisible({ timeout: 10_000 });
      await app.page.getByRole('button', { name: '关闭' }).last().click();

      const raw = read(saveFile);
      expect(raw).toContain('1234.5');
      expect(raw).not.toContain('"1,234.5"');
      expect(raw).toContain(String(DAY));
      expect(raw).toContain(',open');
      expect(raw).toContain(',done');
      expect(raw).toContain('"Alice, A."');
      expect(raw).toContain('张三');
    } finally {
      await app.electronApp.close();
    }
  });

  test('streams 100k rows within 5s and cancels without leaving a file', async ({
    userDataDir,
    importDir,
  }, testInfo) => {
    test.setTimeout(180_000);
    const saveFile = testInfo.outputPath('export-100k.csv');
    const app = await launchCurveApp({
      userDataDir,
      importFile: join(importDir, 'points.json'),
      saveFile,
    });

    try {
      if (!existsSync(join(BENCH_WORKSPACE, 'manifest.json'))) {
        throw new Error(`Missing ${BENCH_WORKSPACE}; run \`pnpm e2e\` first.`);
      }
      const target = testInfo.outputPath('bench-export-100k');
      cpSync(BENCH_WORKSPACE, target, { recursive: true });
      await app.page.evaluate(async (dir) => {
        const api = (globalThis as unknown as { api: CurveApi }).api;
        const opened = await api.workspace.open({ dir });
        if (!opened.ok) {
          throw new Error(`open failed: ${opened.error.code}`);
        }
        const closed = await api.workspace.close({ workspaceId: opened.data.manifest.id });
        if (!closed.ok) {
          throw new Error(`close failed: ${closed.error.code}`);
        }
      }, target);

      await openWorkspace(app.page, BENCH_WORKSPACE_NAME);
      await expect(app.page.getByTestId('data-grid')).toHaveAttribute(
        'data-visible-rows',
        '100000',
      );

      await app.page.getByTestId('grid-export-open').click();
      const dialog = app.page.getByRole('dialog', { name: '导出 CSV' });
      await expect(dialog.getByText('将导出 100000 行 × 10 列。')).toBeVisible();

      const started = Date.now();
      await dialog.getByRole('button', { name: '导出' }).click();
      await expect(app.page.getByTestId('export-csv-done')).toBeVisible({ timeout: 15_000 });
      const elapsed = Date.now() - started;
      expect(elapsed).toBeLessThanOrEqual(5_000);
      console.log(`[export-csv] 100k export ${String(elapsed)}ms`);
      await testInfo.attach('export-100k-metrics', {
        body: JSON.stringify({ elapsedMs: elapsed, rows: 100_000 }),
        contentType: 'application/json',
      });
      await app.page.getByRole('button', { name: '关闭' }).last().click();

      const text = read(saveFile);
      expect(text.startsWith('\uFEFF')).toBe(true);
      expect((text.match(/\r\n/g) ?? []).length).toBe(100_001);

      rmSync(saveFile, { force: true });
      await app.page.getByTestId('grid-export-open').click();
      const cancelDialog = app.page.getByRole('dialog', { name: '导出 CSV' });

      // Slow the per-chunk yield so the cancel button gets a deterministic
      // window; this is the same test-only technique as the T2.4 cancel test.
      await app.page.evaluate(() => {
        const original = window.setTimeout;
        (
          window as unknown as { __curveOriginalSetTimeout: typeof window.setTimeout }
        ).__curveOriginalSetTimeout = original;
        window.setTimeout = ((
          handler: TimerHandler,
          timeout?: number,
          ...args: unknown[]
        ): number =>
          original(handler, timeout === 0 ? 20 : timeout, ...args)) as typeof window.setTimeout;
      });

      try {
        await cancelDialog.getByRole('button', { name: '导出' }).click();
        await expect(app.page.getByTestId('export-csv-progress')).toBeVisible({ timeout: 5_000 });
        await app.page.getByRole('button', { name: '取消导出' }).click();
        await expect(app.page.getByTestId('export-csv-cancelled')).toBeVisible({ timeout: 10_000 });
      } finally {
        await app.page.evaluate(() => {
          const original = (
            window as unknown as { __curveOriginalSetTimeout?: typeof window.setTimeout }
          ).__curveOriginalSetTimeout;
          if (original !== undefined) {
            window.setTimeout = original;
          }
        });
      }

      expect(existsSync(saveFile)).toBe(false);
      expect(
        readdirSync(testInfo.outputPath()).filter((name) => name.includes('.curve-export-')),
      ).toEqual([]);
    } finally {
      await app.electronApp.close();
    }
  });

  test('opens the export dialog from the keyboard at 200% zoom', async ({
    userDataDir,
    importDir,
  }, testInfo) => {
    const app = await launchCurveApp({
      userDataDir,
      importFile: join(importDir, 'points.json'),
      saveFile: testInfo.outputPath('export-200.csv'),
    });

    try {
      await seedWorkspace(app.page, testInfo, {
        name: 'Export 200',
        tableId: 'tbl_export_200',
        viewId: 'viw_export_200',
        tableName: 'Zoom',
        columns: COLUMNS,
        primaryKey: 'col_id',
        rowsJsonl: jsonlRows(ROWS.slice(0, 2)),
      });
      await openWorkspace(app.page, 'Export 200');
      await setZoom200(app.electronApp, app.page);

      await app.page.getByTestId('grid-export-open').focus();
      await app.page.keyboard.press('Enter');
      const dialog = app.page.getByRole('dialog', { name: '导出 CSV' });
      await expect(dialog).toBeVisible();

      const box = await dialog.boundingBox();
      const viewport = await app.page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        devicePixelRatio: window.devicePixelRatio,
      }));
      expect(box).not.toBeNull();
      if (box !== null) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      }

      await app.page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    } finally {
      await app.electronApp.close();
    }
  });
});
