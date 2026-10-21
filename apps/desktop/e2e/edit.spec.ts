import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Page, TestInfo } from '@playwright/test';

/**
 * T2.2 — cell editing, validation, keyboard semantics, undo/redo and saving.
 *
 * The workspace is seeded with one column of every storage type through the
 * real IPC bridge, then reopened from the welcome page. Assertions cover both
 * the rendered grid and the persisted JSONL/closed-reopen path.
 */

const SEED_NAME = 'Edit Demo';
const TABLE_ID = 'tbl_edit';
const VIEW_ID = 'viw_edit';

const COLUMNS = {
  id: 'col_edit_id',
  name: 'col_edit_name',
  amount: 'col_edit_amount',
  day: 'col_edit_day',
  active: 'col_edit_active',
  status: 'col_edit_status',
} as const;

const COLUMN_ORDER = [
  COLUMNS.id,
  COLUMNS.name,
  COLUMNS.amount,
  COLUMNS.day,
  COLUMNS.active,
  COLUMNS.status,
] as const;

const ROWS = [
  ['alpha', 'First', 10, new Date(2026, 0, 1).getTime(), true, 'active'],
  ['beta', 'Second', 20, new Date(2026, 0, 2).getTime(), false, 'paused'],
  ['gamma', 'Third', 30, new Date(2026, 0, 3).getTime(), true, 'active'],
] as const;

function seedJsonl(): string {
  return `${ROWS.map((row, index) =>
    JSON.stringify({ id: `row_${String(index + 1)}`, v: row }),
  ).join('\n')}\n`;
}

interface SeededWorkspace {
  root: string;
  jsonlPath: string;
}

async function seedWorkspace(page: Page, testInfo: TestInfo): Promise<SeededWorkspace> {
  const parent = testInfo.outputPath('edit-parent');
  const jsonl = seedJsonl();
  const result = await page.evaluate(
    async ({ dir, name, tableId, viewId, columnOrder, jsonlText }) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir, name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      const timestamp = manifest.createdAt;
      const [
        idColumn = '',
        nameColumn = '',
        amountColumn = '',
        dayColumn = '',
        flagColumn = '',
        statusColumn = '',
      ] = columnOrder;
      const columns: WorkspaceManifest['tables'][number]['columns'] = [
        {
          id: idColumn,
          key: 'id',
          label: 'ID',
          type: 'text',
          role: 'none',
          required: true,
        },
        { id: nameColumn, key: 'name', label: 'Name', type: 'text', role: 'label' },
        {
          id: amountColumn,
          key: 'amount',
          label: 'Amount',
          type: 'number',
          role: 'y',
          precision: 2,
        },
        { id: dayColumn, key: 'day', label: 'Day', type: 'date', role: 'x' },
        { id: flagColumn, key: 'flag', label: 'Flag', type: 'boolean', role: 'none' },
        {
          id: statusColumn,
          key: 'status',
          label: 'Status',
          type: 'enum',
          role: 'series',
          enumOptions: [
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
          ],
        },
      ];
      const views: WorkspaceManifest['views'] = [
        {
          id: viewId,
          kind: 'table',
          refId: tableId,
          title: 'Editable',
          tableView: {
            tableId,
            styleId: 'builtin.report-light',
            columnOrder: [...columnOrder],
            widths: {},
            hiddenColumnIds: [],
            sort: [],
            frozenColumnCount: 1,
          },
        },
      ];
      const layout: WorkspaceManifest['layout'] = {
        type: 'pane',
        viewIds: [viewId],
        activeViewId: viewId,
      };
      const next = {
        ...manifest,
        updatedAt: timestamp,
        tables: [
          {
            id: tableId,
            name: 'Editable',
            file: `tables/${tableId}.jsonl`,
            schemaVersion: 1,
            columns,
            primaryKey: idColumn,
            rowCount: 3,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views,
        layout,
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId,
        jsonl: jsonlText,
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
      dir: parent,
      name: SEED_NAME,
      tableId: TABLE_ID,
      viewId: VIEW_ID,
      columnOrder: [...COLUMN_ORDER],
      jsonlText: jsonl,
    },
  );
  void result;

  const root = join(parent, `${SEED_NAME}.cstudio`);
  const jsonlPath = join(root, 'tables', `${TABLE_ID}.jsonl`);
  expect(readFileSync(jsonlPath, 'utf8')).toBe(jsonl);
  return { root, jsonlPath };
}

async function openSeededWorkspace(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: SEED_NAME }).first().click();
  await expect(page.getByTestId('workspace-view')).toBeVisible();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

function cell(page: Page, row: number, col: number) {
  return page.getByTestId(`grid-cell-${row}-${col}`);
}

async function startEdit(page: Page, row: number, col: number): Promise<void> {
  await cell(page, row, col).click();
  await page.keyboard.press('F2');
  await expect(page.getByTestId('cell-editor')).toBeVisible();
}

async function fillAndCommit(page: Page, row: number, col: number, value: string): Promise<void> {
  await startEdit(page, row, col);
  await page.getByTestId('cell-editor').fill(value);
  await page.keyboard.press('Enter');
}

test.describe('T2.2 cell editing', () => {
  test('edits text, number, date, boolean and enum cells and persists them', async ({
    page,
  }, testInfo) => {
    const { jsonlPath } = await seedWorkspace(page, testInfo);
    await openSeededWorkspace(page);

    await fillAndCommit(page, 0, 1, 'Renamed');
    await expect(cell(page, 0, 1)).toHaveText('Renamed');

    await fillAndCommit(page, 0, 2, '1,234.5');
    await expect(cell(page, 0, 2)).toHaveText('1,234.50');

    await fillAndCommit(page, 0, 3, '2026-02-03');
    await expect(cell(page, 0, 3)).toHaveText(/2026[/-]02[/-]03/);

    await startEdit(page, 0, 4);
    await page.getByTestId('cell-editor').selectOption('false');
    await page.keyboard.press('Enter');
    await expect(cell(page, 0, 4)).toHaveText('false');

    await startEdit(page, 0, 5);
    await page.getByTestId('cell-editor').selectOption('paused');
    await page.keyboard.press('Enter');
    await expect(cell(page, 0, 5)).toHaveText('Paused');

    await expect(page.getByTestId('autosave-status')).toContainText('已保存');
    await expect
      .poll(() => readFileSync(jsonlPath, 'utf8'))
      .toContain('"v":["alpha","Renamed",1234.5,');
    const jsonl = readFileSync(jsonlPath, 'utf8');
    expect(jsonl).toContain('"v":["alpha","Renamed",1234.5,');
    expect(jsonl).toContain('"paused"');
    expect(jsonl).not.toContain('"First"');

    // Closing flushes the queue; reopening reads the file back through the Worker.
    await page.getByRole('button', { name: '关闭工作区' }).click();
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('recent-workspace').filter({ hasText: SEED_NAME }).first().click();
    await expect(page.getByTestId('data-grid')).toBeVisible();
    await expect(cell(page, 0, 1)).toHaveText('Renamed');
    await expect(cell(page, 0, 2)).toHaveText('1,234.50');
    await expect(cell(page, 0, 4)).toHaveText('false');
    await expect(cell(page, 0, 5)).toHaveText('Paused');
  });

  test('rejects invalid values, empty required keys and duplicate keys with localised errors', async ({
    page,
  }, testInfo) => {
    const { jsonlPath } = await seedWorkspace(page, testInfo);
    await openSeededWorkspace(page);

    await startEdit(page, 1, 2);
    await page.getByTestId('cell-editor').fill('not-a-number');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('edit-status')).toContainText('第 2 行 · 列 Amount：类型不匹配');
    await expect(page.getByTestId('cell-editor')).toBeVisible();
    await expect(page.getByTestId('cell-editor')).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');
    await expect(cell(page, 1, 2)).toHaveText('20.00');

    await startEdit(page, 1, 0);
    await page.getByTestId('cell-editor').fill('');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('edit-status')).toContainText('主键不能为空');
    await expect(page.getByTestId('cell-editor')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cell(page, 1, 0)).toHaveText('beta');

    await startEdit(page, 1, 0);
    await page.getByTestId('cell-editor').fill('alpha');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('edit-status')).toContainText('与第 1 行冲突');
    await expect(cell(page, 0, 0)).toHaveClass(/cs-grid__cell--conflict/);
    await page.keyboard.press('Escape');

    // Failed commits never reached the model or the save queue.
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');
    await expect.poll(() => readFileSync(jsonlPath, 'utf8')).toContain('"v":["alpha","First"');
    expect(readFileSync(jsonlPath, 'utf8')).not.toContain('not-a-number');
  });

  test('supports F2/Enter/Tab/Esc and undo/redo without a mouse after focus', async ({
    page,
  }, testInfo) => {
    await seedWorkspace(page, testInfo);
    await openSeededWorkspace(page);

    // Focus the grid with one click; the rest of the edit is keyboard-only.
    await cell(page, 0, 1).click();
    await page.keyboard.press('F2');
    await page.getByTestId('cell-editor').fill('Keyboard');
    await page.keyboard.press('Enter');
    await expect(cell(page, 0, 1)).toHaveText('Keyboard');

    // Enter committed down: row 1 is active. Tab commits right.
    await page.keyboard.press('F2');
    await page.getByTestId('cell-editor').fill('Second2');
    await page.keyboard.press('Tab');
    await expect(cell(page, 1, 1)).toHaveText('Second2');

    // A fresh edit can be cancelled without touching the model.
    await page.keyboard.press('F2');
    await page.getByTestId('cell-editor').fill('ShouldCancel');
    await page.keyboard.press('Escape');
    await expect(cell(page, 1, 2)).toHaveText('20.00');

    await page.keyboard.press('Control+z');
    await expect(cell(page, 1, 1)).toHaveText('Second');
    await page.keyboard.press('Control+Shift+z');
    await expect(cell(page, 1, 1)).toHaveText('Second2');
    await expect(page.getByTestId('autosave-status')).toContainText('已保存');
  });
});
